import { verifyFirebaseIdToken } from "@/lib/auth/firebase";
import { NextResponse } from "next/server";
import { isValidE164Phone } from "@/lib/auth/sms";
import { verifyPhoneOtp } from "@/lib/db/otps";
import { createUser, getUserByPhone, linkIdentity, setPhoneVerified, toSafeUser, updateLastLogin } from "@/lib/db/users";
import { createSession } from "@/lib/db/sessions";
import { setSessionCookie } from "@/lib/auth/session";
import { logAudit } from "@/lib/db/audit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const firebaseIdToken = typeof body?.firebaseIdToken === "string" ? body.firebaseIdToken.trim() : "";

    if (!phone || !isValidE164Phone(phone)) {
      return NextResponse.json(
        { ok: false, message: "Please provide a valid phone number in E.164 format." },
        { status: 400 }
      );
    }

    if (firebaseIdToken) {
      // Verify via Google Firebase Identity Toolkit
      const fbCheck = await verifyFirebaseIdToken(firebaseIdToken, phone);
      if (!fbCheck.success) {
        return NextResponse.json(
          { ok: false, message: fbCheck.error || "Firebase authentication failed." },
          { status: 400 }
        );
      }
    } else {
      if (!code || code.length !== 6) {
        return NextResponse.json(
          { ok: false, message: "Please provide a 6-digit verification code." },
          { status: 400 }
        );
      }

      // Verify OTP code
      const verifyResult = verifyPhoneOtp(phone, code);
      if (!verifyResult.success) {
        return NextResponse.json(
          { ok: false, message: verifyResult.error || "Invalid verification code." },
          { status: 400 }
        );
      }
    }

    // Check if user exists by phone
    let user = getUserByPhone(phone);

    if (user) {
      if (user.status !== "active") {
        return NextResponse.json(
          { ok: false, message: "Your account has been suspended. Please contact an administrator." },
          { status: 403 }
        );
      }

      setPhoneVerified(user.id, phone);
      updateLastLogin(user.id);
      const session = createSession(user.id);
      await setSessionCookie(session.token);

      logAudit({
        actorId: user.id,
        action: "auth.phone_login",
        target: user.id,
      });

      return NextResponse.json({ ok: true, user: toSafeUser(user) });
    }

    // New user via phone
    const defaultName = name || `User ${phone.slice(-4)}`;
    const newUser = createUser({
      name: defaultName,
      phoneNumber: phone,
      phoneVerified: true,
      role: "user",
      status: "active",
    });

    linkIdentity(newUser.id, "phone", phone);
    const session = createSession(newUser.id);
    await setSessionCookie(session.token);

    logAudit({
      actorId: newUser.id,
      action: "user.signup_phone",
      target: newUser.id,
      details: { phone },
    });

    return NextResponse.json({ ok: true, user: newUser }, { status: 201 });
  } catch (err) {
    console.error("Phone verify OTP error:", err);
    return NextResponse.json({ ok: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
