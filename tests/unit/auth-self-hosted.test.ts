import { describe, it, expect, beforeEach } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/passwords";
import { canRequestOtp, createPhoneOtp, verifyPhoneOtp } from "@/lib/db/otps";
import { isValidE164Phone } from "@/lib/auth/sms";
import { createAuthToken, verifyAuthToken, consumeAuthToken } from "@/lib/db/tokens";
import { checkRateLimit } from "@/lib/auth/rateLimit";
import {
  createUser,
  getUserByEmail,
  getUserByPhone,
  linkIdentity,
  getUserByIdentity,
  toSafeUser,
  setEmailVerified,
  setPhoneVerified,
} from "@/lib/db/users";
import { createSession, getSessionWithUser, deleteSession } from "@/lib/db/sessions";

describe("VDO Self-Hosted Authentication System", () => {
  describe("Password Hashing & Constant-Time Verification", () => {
    it("hashes password with cryptographic salt and verifies correctly", () => {
      const password = "superSecretPassword123!";
      const { hash, salt } = hashPassword(password);

      expect(hash).toBeDefined();
      expect(salt).toBeDefined();
      expect(hash.length).toBeGreaterThan(32);
      expect(salt.length).toBe(32); // 16 bytes hex

      expect(verifyPassword(password, hash, salt)).toBe(true);
      expect(verifyPassword("wrongPassword123!", hash, salt)).toBe(false);
      expect(verifyPassword(password, "tamperedHash", salt)).toBe(false);
    });
  });

  describe("Phone SMS OTP Lifecycle & Formatting", () => {
    it("validates E.164 phone numbers correctly", () => {
      expect(isValidE164Phone("+14155552671")).toBe(true);
      expect(isValidE164Phone("+919876543210")).toBe(true);
      expect(isValidE164Phone("+442071838750")).toBe(true);
      expect(isValidE164Phone("4155552671")).toBe(false); // missing +
      expect(isValidE164Phone("+012345")).toBe(false); // invalid starting digit
      expect(isValidE164Phone("invalid-phone")).toBe(false);
    });

    it("generates 6-digit OTP, enforces 60s cooldown, and verifies accurately", () => {
      const phone = "+14155559999";
      
      // 1. Initial request is allowed
      const cooldown1 = canRequestOtp(phone);
      expect(cooldown1.allowed).toBe(true);

      // 2. Generate OTP
      const code = createPhoneOtp(phone);
      expect(code).toMatch(/^\d{6}$/);

      // 3. Immediate next request is blocked by 60s cooldown
      const cooldown2 = canRequestOtp(phone);
      expect(cooldown2.allowed).toBe(false);
      expect(cooldown2.waitSeconds).toBeGreaterThanOrEqual(1);

      // 4. Verification with wrong code fails
      const badVerify = verifyPhoneOtp(phone, "000000");
      expect(badVerify.success).toBe(false);
      expect(badVerify.error).toContain("Incorrect code");

      // 5. Verification with correct code succeeds
      const goodVerify = verifyPhoneOtp(phone, code);
      expect(goodVerify.success).toBe(true);

      // 6. Code is single-use and consumed
      const replayVerify = verifyPhoneOtp(phone, code);
      expect(replayVerify.success).toBe(false);
    });
  });

  describe("Email Verification & Password Reset Tokens", () => {
    it("creates, verifies, and consumes single-use tokens", () => {
      const user = createUser({
        email: `token-tester-${Date.now()}@example.com`,
        name: "Token Tester",
      });
      const mockUserId = user.id;

      // Create token
      const rawToken = createAuthToken(mockUserId, "email_verify", 3600000);
      expect(rawToken.length).toBe(64); // 32 bytes hex

      // Verify token
      const record = verifyAuthToken(rawToken, "email_verify");
      expect(record).not.toBeNull();
      expect(record?.user_id).toBe(mockUserId);

      // Wrong type fails
      const wrongType = verifyAuthToken(rawToken, "password_reset");
      expect(wrongType).toBeNull();

      // Consume token (single-use)
      const consumedUserId = consumeAuthToken(rawToken, "email_verify");
      expect(consumedUserId).toBe(mockUserId);

      // Subsequent consumption fails
      expect(consumeAuthToken(rawToken, "email_verify")).toBeNull();
    });
  });

  describe("Sliding-Window Rate Limiter", () => {
    it("tracks attempts and enforces max limits within time window", () => {
      const key = "test-ip-rate-limit";
      const max = 3;
      const windowMs = 5000;

      expect(checkRateLimit(key, max, windowMs).allowed).toBe(true);
      expect(checkRateLimit(key, max, windowMs).allowed).toBe(true);
      expect(checkRateLimit(key, max, windowMs).allowed).toBe(true);

      // 4th attempt should be blocked
      const blocked = checkRateLimit(key, max, windowMs);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    });
  });

  describe("User Accounts & Identity Linking", () => {
    it("creates users without exposing password hash or salt in SafeUser", () => {
      const email = `test-${Date.now()}@example.com`;
      const user = createUser({
        email,
        name: "Security Tester",
        password: "TestPassword123!",
        role: "user",
      });

      expect(user.id).toBeDefined();
      expect(user.email).toBe(email);
      expect(user.name).toBe("Security Tester");
      expect((user as any).password_hash).toBeUndefined();
      expect((user as any).password_salt).toBeUndefined();

      const fetched = getUserByEmail(email);
      expect(fetched).not.toBeNull();
      expect(fetched?.password_hash).toBeDefined();

      const safe = toSafeUser(fetched!);
      expect((safe as any).password_hash).toBeUndefined();
    });

    it("supports email and phone verification updates", () => {
      const email = `verify-${Date.now()}@example.com`;
      const user = createUser({
        email,
        name: "Verify Tester",
        role: "user",
      });

      expect(user.email_verified).toBe(0);
      setEmailVerified(user.id);

      const refreshed = getUserByEmail(email);
      expect(refreshed?.email_verified).toBeGreaterThan(0);

      const phone = `+1415555${Math.floor(1000 + Math.random() * 9000)}`;
      setPhoneVerified(user.id, phone);

      const phoneUser = getUserByPhone(phone);
      expect(phoneUser?.id).toBe(user.id);
      expect(phoneUser?.phone_verified).toBeGreaterThan(0);
    });

    it("links external Google/Phone identities cleanly without duplication", () => {
      const email = `oauth-${Date.now()}@example.com`;
      const user = createUser({
        email,
        name: "OAuth User",
        emailVerified: true,
      });

      const googleSub = `google-sub-${Date.now()}`;
      linkIdentity(user.id, "google", googleSub);

      const linked = getUserByIdentity("google", googleSub);
      expect(linked).not.toBeNull();
      expect(linked?.id).toBe(user.id);
      expect(linked?.email).toBe(email);
    });

    it("creates and validates server-side user sessions", () => {
      const user = createUser({
        email: `session-${Date.now()}@example.com`,
        name: "Session User",
      });

      const session = createSession(user.id);
      expect(session.token).toBeDefined();
      expect(session.user_id).toBe(user.id);

      const sessionWithUser = getSessionWithUser(session.token);
      expect(sessionWithUser).not.toBeNull();
      expect(sessionWithUser?.user.id).toBe(user.id);

      // Deleting session invalidates it
      deleteSession(session.token);
      expect(getSessionWithUser(session.token)).toBeNull();
    });
  });
});
