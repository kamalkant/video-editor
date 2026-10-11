import { NextResponse } from "next/server";
import { isValidE164Phone, sendOtpSms } from "@/lib/auth/sms";
import { canRequestOtp, createPhoneOtp } from "@/lib/db/otps";
import { checkRateLimit, getClientIp } from "@/lib/auth/rateLimit";
import { logAudit } from "@/lib/db/audit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const body = await request.json();
    const phone = typeof body?.phone === "string" ? body.phone.trim() : "";

    if (!phone || !isValidE164Phone(phone)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Please enter a valid phone number including country code (e.g. +14155552671).",
        },
        { status: 400 }
      );
    }

    // Rate Limit: max 3 requests per 10 minutes per IP/phone
    const rateCheck = checkRateLimit(`phone-otp:${ip}:${phone}`, 3, 10 * 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          ok: false,
          message: `Too many OTP requests. Please wait ${rateCheck.retryAfterSeconds} seconds before requesting another code.`,
        },
        { status: 429 }
      );
    }

    // 60-second Resend Cooldown Check
    const cooldown = canRequestOtp(phone);
    if (!cooldown.allowed) {
      return NextResponse.json(
        {
          ok: false,
          message: `Please wait ${cooldown.waitSeconds} seconds before requesting a new code.`,
          waitSeconds: cooldown.waitSeconds,
        },
        { status: 429 }
      );
    }

    // Generate secure 6-digit OTP
    const code = createPhoneOtp(phone);

    // Send SMS
    const sent = await sendOtpSms(phone, code);
    if (!sent) {
      return NextResponse.json(
        { ok: false, message: "Failed to send SMS. Please check the phone number or try again later." },
        { status: 500 }
      );
    }

    logAudit({
      actorId: null,
      action: "auth.phone_otp_sent",
      target: phone,
    });

    return NextResponse.json({
      ok: true,
      message: "Verification code sent successfully.",
      expiresInSeconds: 600,
    });
  } catch (err) {
    console.error("Phone send OTP error:", err);
    return NextResponse.json({ ok: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
