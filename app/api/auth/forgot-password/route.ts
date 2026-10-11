import { NextResponse } from "next/server";
import { getUserByEmail } from "@/lib/db/users";
import { createAuthToken } from "@/lib/db/tokens";
import { sendPasswordResetEmail } from "@/lib/auth/email";
import { checkRateLimit, getClientIp } from "@/lib/auth/rateLimit";
import { logAudit } from "@/lib/db/audit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || !email.includes("@")) {
      return NextResponse.json({ ok: false, message: "Please provide a valid email address." }, { status: 400 });
    }

    // Rate limit: max 4 requests per hour per IP/email
    const rateLimitKey = `forgot-pwd:${ip}:${email}`;
    const rateCheck = checkRateLimit(rateLimitKey, 4, 60 * 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          ok: false,
          message: `Too many password reset requests. Please wait ${rateCheck.retryAfterSeconds} seconds before trying again.`,
        },
        { status: 429 }
      );
    }

    const user = getUserByEmail(email);

    let devResetUrl: string | undefined = undefined;

    if (user && user.status === "active") {
      const token = createAuthToken(user.id, "password_reset", 60 * 60 * 1000); // 1 hour expiry
      await sendPasswordResetEmail(user.email ?? email, user.name, token);

      const hasRealEmail = Boolean(process.env.RESEND_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_USER));
      if (!hasRealEmail && process.env.NODE_ENV !== "production") {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        devResetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
      }

      logAudit({
        actorId: user.id,
        action: "auth.forgot_password_requested",
        target: user.id,
      });
    }

    // Always return success to prevent email enumeration attacks
    return NextResponse.json({
      ok: true,
      message: "If an account exists with this email address, password reset instructions have been sent.",
      ...(devResetUrl ? { devResetUrl } : {}),
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    return NextResponse.json({ ok: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
