import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { getUserById } from "@/lib/db/users";
import type { ReferralCode } from "@/lib/db/schema";

/**
 * Generates an attractive, readable referral code based on user's name or a random token.
 * Format: VIPLAY + up to 4 letters from the name + 3 random characters, uppercase (e.g. VIPLAY-ALEX-9K2). Older codes start with VDO- and keep working.
 */
export function generateRandomCode(name?: string): string {
  const sanitized = (name || "USER")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
  const suffix = randomBytes(2).toString("hex").toUpperCase().slice(0, 3);
  return `VIPLAY-${sanitized || "PRO"}-${suffix}`;
}

/**
 * Returns existing referral code record for a user or creates a unique one.
 */
export function getOrCreateReferralCode(userId: string): ReferralCode {
  const db = getDb();
  let row = db
    .prepare("SELECT * FROM referral_codes WHERE user_id = ?")
    .get(userId) as ReferralCode | undefined;

  if (row) return row;

  const user = getUserById(userId);
  const id = "refc_" + randomUUID().slice(0, 8);
  const now = Date.now();

  // Try generating unique code with collision handling
  let code = generateRandomCode(user?.name);
  let attempts = 0;
  while (attempts < 5) {
    const existing = db
      .prepare("SELECT id FROM referral_codes WHERE code = ? COLLATE NOCASE")
      .get(code);
    if (!existing) break;
    code = generateRandomCode(user?.name);
    attempts++;
  }

  const stmt = db.prepare(`
    INSERT INTO referral_codes (id, user_id, code, clicks, signups, conversions, created_at, updated_at)
    VALUES (?, ?, ?, 0, 0, 0, ?, ?)
  `);

  try {
    stmt.run(id, userId, code, now, now);
  } catch (err: any) {
    // If concurrent insert occurred, return the stored one
    const existing = db
      .prepare("SELECT * FROM referral_codes WHERE user_id = ?")
      .get(userId) as ReferralCode | undefined;
    if (existing) return existing;
    throw err;
  }

  return {
    id,
    user_id: userId,
    code,
    clicks: 0,
    signups: 0,
    conversions: 0,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Look up referral code details case-insensitively.
 */
export function getReferralCodeByCode(code: string): ReferralCode | null {
  if (!code) return null;
  const db = getDb();
  const clean = code.trim();
  const row = db
    .prepare("SELECT * FROM referral_codes WHERE code = ? COLLATE NOCASE LIMIT 1")
    .get(clean) as ReferralCode | undefined;
  return row ?? null;
}

/**
 * Increment click count on referral link access.
 */
export function recordReferralCodeClick(code: string): boolean {
  if (!code) return false;
  const db = getDb();
  const clean = code.trim();
  const res = db
    .prepare("UPDATE referral_codes SET clicks = clicks + 1, updated_at = ? WHERE code = ? COLLATE NOCASE")
    .run(Date.now(), clean);
  return res.changes > 0;
}
