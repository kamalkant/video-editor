import { NextResponse } from "next/server";
import { createUser, getUserByEmail, linkIdentity } from "@/lib/db/users";
import { createSession } from "@/lib/db/sessions";
import { setSessionCookie } from "@/lib/auth/session";
import { createAuthToken } from "@/lib/db/tokens";
import { sendVerificationEmail } from "@/lib/auth/email";
import { checkRateLimit, getClientIp } from "@/lib/auth/rateLimit";
import { logAudit } from "@/lib/db/audit";
import { attributeReferral } from "@/lib/referrals/attribution";
import { getOrCreateReferralCode } from "@/lib/referrals/codes";
import { getUserWallet } from "@/lib/referrals/wallet";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const referralCode = typeof body?.referralCode === "string" ? body.referralCode.trim() : "";

    // Rate Limit: max 10 signups per hour per IP
    const rateCheck = checkRateLimit(`signup:${ip}`, 10, 60 * 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          ok: false,
          message: `Too many accounts created from this network. Please wait ${rateCheck.retryAfterSeconds} seconds before trying again.`,
        },
        { status: 429 }
      );
    }

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { ok: false, message: "A valid email address is required." },
        { status: 400 }
      );
    }

    if (!password || password.length < 8) {
      return NextResponse.json(
        { ok: false, message: "Password must be at least 8 characters long." },
        { status: 400 }
      );
    }

    if (!name || name.length < 2) {
      return NextResponse.json(
        { ok: false, message: "Please enter your name (at least 2 characters)." },
        { status: 400 }
      );
    }

    const existing = getUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { ok: false, message: "An account with this email address already exists." },
        { status: 409 }
      );
    }

    const user = createUser({
      email,
      name,
      password,
      role: "user",
      status: "active",
      emailVerified: false,
    });

    linkIdentity(user.id, "email", email);

    // Attribute referral if referral code was provided
    if (referralCode) {
      attributeReferral({
        code: referralCode,
        newUserId: user.id,
        ipAddress: ip,
        userAgent: request.headers.get("user-agent"),
      });
    }

    // Initialize user's own referral code and wallet
    getOrCreateReferralCode(user.id);
    getUserWallet(user.id);

    // Generate email verification token and send verification email
    const verifyToken = createAuthToken(user.id, "email_verify");
    await sendVerificationEmail(user.email ?? email, user.name, verifyToken);

    // Create session so user is logged in
    const session = createSession(user.id);
    await setSessionCookie(session.token);

    logAudit({
      actorId: user.id,
      action: "user.signup",
      target: user.id,
      details: { email: user.email, name: user.name },
    });

    return NextResponse.json(
      {
        ok: true,
        user,
        message: "Account created successfully. A verification link has been sent to your email.",
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Signup failed:", err);
    return NextResponse.json(
      { ok: false, message: "Failed to create account. Please try again." },
      { status: 500 }
    );
  }
}
