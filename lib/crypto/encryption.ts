import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits recommended for GCM

function getMasterKey(): Buffer {
  const secret =
    process.env.AI_CREDENTIAL_SECRET ||
    process.env.ENCRYPTION_SECRET ||
    process.env.AUTH_SECRET ||
    "vdo-studio-default-secure-master-encryption-key-production-32b";
  
  // Use SHA-256 to ensure exact 32 bytes (256 bits)
  return createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns format: "ivHex:tagHex:cipherHex"
 */
export function encryptString(plaintext: string): string {
  if (!plaintext) return "";
  const key = getMasterKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted payload.
 */
export function decryptString(payload: string): string | null {
  if (!payload) return null;
  const parts = payload.split(":");
  if (parts.length !== 3) return null;

  try {
    const key = getMasterKey();
    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const encryptedHex = parts[2];

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("Decryption failed:", error);
    return null;
  }
}

/**
 * Helper to mask a secret key, returning only the last 4 characters.
 */
export function maskSecretKey(key: string | null | undefined): {
  hasKey: boolean;
  last4: string | null;
} {
  if (!key || typeof key !== "string") {
    return { hasKey: false, last4: null };
  }
  const trimmed = key.trim();
  if (!trimmed) {
    return { hasKey: false, last4: null };
  }
  return {
    hasKey: true,
    last4: trimmed.slice(-4),
  };
}
