import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Hashes a password using scrypt with a cryptographic random salt.
 */
export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

/**
 * Verifies a password against the stored hash and salt in constant time.
 */
export function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    const check = scryptSync(password, salt, 64).toString("hex");
    const checkBuf = Buffer.from(check, "hex");
    const hashBuf = Buffer.from(hash, "hex");
    if (checkBuf.length !== hashBuf.length) return false;
    return timingSafeEqual(checkBuf, hashBuf);
  } catch {
    return false;
  }
}
