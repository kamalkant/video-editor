import { NextResponse } from "next/server";
import { getUserByEmail, toSafeUser, updateLastLogin } from "@/lib/db/users";
import { verifyPassword } from "@/lib/auth/passwords";
import { createSession } from "@/lib/db/sessions";
import { setSessionCookie } from "@/lib/auth/session";
import { checkRateLimit, getClientIp } from "@/lib/auth/rateLimit";
import { checkDeviceLimit, registerOrUpdateDevice, revokeDevice, revokeAllUserDevices } from "@/lib/db/devices";
import { logAudit } from "@/lib/db/audit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const revokeDeviceId = typeof body?.revokeDeviceId === "string" ? body.revokeDeviceId : "";
    const revokeAllOther = body?.action === "revoke_all_other" || body?.revokeAll === true;

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, message: "Email and password are required." },
        { status: 400 }
      );
    }

    // Rate Limit: max 5 attempts per 5 minutes per IP/email
    const rateCheck = checkRateLimit(`login:${ip}:${email}`, 5, 5 * 60 * 1000);
    if (!rateCheck.allowed) {
      logAudit({
        actorId: null,
        action: "auth.rate_limited",
        target: email,
        details: { ip, retryAfter: rateCheck.retryAfterSeconds },
      });
      return NextResponse.json(
        {
          ok: false,
          message: `Too many failed sign-in attempts. Please wait ${rateCheck.retryAfterSeconds} seconds before trying again.`,
        },
        { status: 429 }
      );
    }

    const user = getUserByEmail(email);
    if (!user || !user.password_hash || !user.password_salt) {
      logAudit({
        actorId: null,
        action: "auth.login_failed",
        target: email,
        details: { reason: "account_not_found_or_no_password" },
      });
      return NextResponse.json(
        { ok: false, message: "Invalid email or password." },
        { status: 401 }
      );
    }

    const isMatch = verifyPassword(password, user.password_hash, user.password_salt);
    if (!isMatch) {
      logAudit({
        actorId: null,
        action: "auth.login_failed",
        target: email,
        details: { reason: "incorrect_password" },
      });
      return NextResponse.json(
        { ok: false, message: "Invalid email or password." },
        { status: 401 }
      );
    }

    if (user.status !== "active") {
      logAudit({
        actorId: user.id,
        action: "auth.login_blocked",
        target: user.id,
        details: { reason: "account_suspended" },
      });
      return NextResponse.json(
        { ok: false, message: "Your account has been suspended. Please contact an administrator." },
        { status: 403 }
      );
    }

    // Optional: User requested revoking a device to make room for this login
    if (revokeDeviceId) {
      revokeDevice(revokeDeviceId, user.id);
      logAudit({
        actorId: user.id,
        action: "auth.device_revoked_on_login",
        target: revokeDeviceId,
      });
    } else if (revokeAllOther) {
      const count = revokeAllUserDevices(user.id);
      logAudit({
        actorId: user.id,
        action: "auth.all_devices_revoked_on_login",
        target: user.id,
        details: { count },
      });
    }

    // Enforce simultaneous device limit
    const deviceCheck = checkDeviceLimit(user.id);
    if (deviceCheck.activeCount >= deviceCheck.limit) {
      logAudit({
        actorId: user.id,
        action: "auth.device_limit_blocked",
        target: user.id,
        details: { limit: deviceCheck.limit, activeCount: deviceCheck.activeCount },
      });
      return NextResponse.json(
        {
          ok: false,
          code: "DEVICE_LIMIT_EXCEEDED",
          message: `Simultaneous session limit of ${deviceCheck.limit} devices reached. Please select a session to log out to continue.`,
          limit: deviceCheck.limit,
          activeCount: deviceCheck.activeCount,
          devices: deviceCheck.devices.map((d) => ({
            id: d.id,
            device_name: d.device_name,
            device_type: d.device_type,
            os: d.os,
            browser: d.browser,
            ip_address: d.ip_address,
            last_active_at: d.last_active_at,
          })),
          redirectUrl: `/manage-devices?email=${encodeURIComponent(user.email || "")}`,
        },
        { status: 403 }
      );
    }


    updateLastLogin(user.id);
    const session = createSession(user.id);
    await setSessionCookie(session.token);

    // Register active device session
    try {
      registerOrUpdateDevice({
        userId: user.id,
        sessionToken: session.token,
        userAgent: request.headers.get("user-agent") || "",
        ipAddress: ip,
      });
    } catch (e) {
      console.error("Failed to register device session:", e);
    }

    logAudit({
      actorId: user.id,
      action: "auth.login_success",
      target: user.id,
    });

    return NextResponse.json({ ok: true, user: toSafeUser(user) });
  } catch (err) {
    console.error("Login failed:", err);
    return NextResponse.json(
      { ok: false, message: "An unexpected error occurred during login." },
      { status: 500 }
    );
  }
}
