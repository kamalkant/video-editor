import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/session";
import { sessionTokenFrom } from "@/lib/auth/sessionCookie";
import { listUserDevices, revokeDevice, revokeAllOtherDevices, registerOrUpdateDevice, getUserDeviceLimit } from "@/lib/db/devices";
import { getUserSubscriptionWithPlan } from "@/lib/db/subscriptions";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const cookieStore = await cookies();
    const currentToken = sessionTokenFrom(cookieStore) || "";
    const userAgent = req.headers.get("user-agent") || "";
    const ipAddress = req.headers.get("x-forwarded-for") || null;

    // Register or touch current device
    if (currentToken) {
      registerOrUpdateDevice({
        userId: user.id,
        sessionToken: currentToken,
        userAgent,
        ipAddress,
      });
    }

    const devices = listUserDevices(user.id);
    const { plan } = getUserSubscriptionWithPlan(user.id);

    return NextResponse.json({
      ok: true,
      devices,
      currentToken,
      deviceLimit: getUserDeviceLimit(user.id),
      isLimitExceeded: devices.length > getUserDeviceLimit(user.id),
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message || "Failed to fetch devices" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const cookieStore = await cookies();
    const currentToken = sessionTokenFrom(cookieStore) || "";
    const body = await req.json();
    const { action, deviceId } = body || {};

    if (action === "revoke_other") {
      const count = revokeAllOtherDevices(user.id, currentToken);
      return NextResponse.json({ ok: true, revokedCount: count, message: `Revoked ${count} other sessions` });
    }

    if (action === "revoke" && deviceId) {
      const success = revokeDevice(deviceId, user.id);
      return NextResponse.json({ ok: success, message: success ? "Device session revoked" : "Device not found" });
    }

    return NextResponse.json({ ok: false, message: "Invalid device action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message || "Device action failed" }, { status: 500 });
  }
}
