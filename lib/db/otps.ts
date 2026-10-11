import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { getDb } from "./index";
import type { PhoneOtp } from "./schema";

const OTP_DURATION_MS = 10 * 60 * 1000; // 10 minutes expiry
const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds cooldown
const MAX_ATTEMPTS = 5;

function hashOtp(phone: string, code: string): string {
  return createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

export function canRequestOtp(phoneNumber: string): { allowed: boolean; waitSeconds?: number } {
  const db = getDb();
  const cleanPhone = phoneNumber.trim();

  const stmt = db.prepare("SELECT * FROM phone_otps WHERE phone_number = ? ORDER BY created_at DESC LIMIT 1");
  const row = stmt.get(cleanPhone) as PhoneOtp | undefined;

  if (row) {
    const elapsed = Date.now() - row.created_at;
    if (elapsed < OTP_RESEND_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000);
      return { allowed: false, waitSeconds };
    }
  }

  return { allowed: true };
}

export function createPhoneOtp(phoneNumber: string, durationMs: number = OTP_DURATION_MS): string {
  const db = getDb();
  const cleanPhone = phoneNumber.trim();
  const now = Date.now();
  const expiresAt = now + durationMs;

  // Generate cryptographically secure 6-digit numeric OTP
  const rawCode = randomInt(100000, 1000000).toString();
  const otpHash = hashOtp(cleanPhone, rawCode);
  const id = randomUUID();

  // Delete previous OTP for this phone number
  db.prepare("DELETE FROM phone_otps WHERE phone_number = ?").run(cleanPhone);

  const stmt = db.prepare(`
    INSERT INTO phone_otps (id, phone_number, otp_hash, attempts, expires_at, created_at)
    VALUES (?, ?, ?, 0, ?, ?)
  `);
  stmt.run(id, cleanPhone, otpHash, expiresAt, now);

  return rawCode;
}

export function verifyPhoneOtp(
  phoneNumber: string,
  candidateCode: string
): { success: boolean; error?: string } {
  const db = getDb();
  const cleanPhone = phoneNumber.trim();
  const cleanCode = candidateCode.trim();

  if (!cleanCode || cleanCode.length !== 6) {
    return { success: false, error: "Please enter a valid 6-digit code." };
  }

  const stmt = db.prepare("SELECT * FROM phone_otps WHERE phone_number = ? LIMIT 1");
  const row = stmt.get(cleanPhone) as PhoneOtp | undefined;

  if (!row) {
    return { success: false, error: "No active verification code found for this number. Please request a new code." };
  }

  const now = Date.now();
  if (now > row.expires_at) {
    db.prepare("DELETE FROM phone_otps WHERE id = ?").run(row.id);
    return { success: false, error: "The verification code has expired. Please request a new one." };
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    db.prepare("DELETE FROM phone_otps WHERE id = ?").run(row.id);
    return { success: false, error: "Too many incorrect attempts. Please request a new verification code." };
  }

  const candidateHash = hashOtp(cleanPhone, cleanCode);
  const candidateBuf = Buffer.from(candidateHash, "hex");
  const storedBuf = Buffer.from(row.otp_hash, "hex");

  const isMatch = candidateBuf.length === storedBuf.length && timingSafeEqual(candidateBuf, storedBuf);

  if (!isMatch) {
    const nextAttempts = row.attempts + 1;
    db.prepare("UPDATE phone_otps SET attempts = ? WHERE id = ?").run(nextAttempts, row.id);
    const remaining = MAX_ATTEMPTS - nextAttempts;
    return {
      success: false,
      error: `Incorrect code. ${remaining > 0 ? `${remaining} attempts remaining.` : "Please request a new code."}`,
    };
  }

  // Code verified! Delete OTP so it cannot be used again
  db.prepare("DELETE FROM phone_otps WHERE id = ?").run(row.id);
  return { success: true };
}
