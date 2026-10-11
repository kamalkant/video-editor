import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { getUserById } from "@/lib/db/users";
import { getReferralCodeByCode } from "./codes";
import { getReferralProgramConfig } from "./config";
import { createNotification } from "@/lib/db/notifications";
import { logAudit } from "@/lib/db/audit";
import type { Referral } from "@/lib/db/schema";

export type AttributeReferralResult = {
  success: boolean;
  referral?: Referral;
  error?: string;
};

/**
 * Attributes a newly registered user to a referrer code with complete anti-fraud checks.
 */
export function attributeReferral(params: {
  code: string;
  newUserId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): AttributeReferralResult {
  const config = getReferralProgramConfig();
  if (!config.enabled) {
    return { success: false, error: "Referral program is currently inactive" };
  }

  const cleanCode = params.code?.trim();
  if (!cleanCode) {
    return { success: false, error: "No referral code provided" };
  }

  const refCodeRecord = getReferralCodeByCode(cleanCode);
  if (!refCodeRecord) {
    return { success: false, error: "Invalid referral code" };
  }

  const referrerId = refCodeRecord.user_id;
  const newUserId = params.newUserId;

  // 1. Self-referral prevention: User ID
  if (referrerId === newUserId) {
    return { success: false, error: "Self-referral is not allowed" };
  }

  const referrer = getUserById(referrerId);
  const newUser = getUserById(newUserId);

  if (!referrer || !newUser) {
    return { success: false, error: "User record not found" };
  }

  // 2. Self-referral prevention: Email equality check
  if (referrer.email && newUser.email && referrer.email.toLowerCase() === newUser.email.toLowerCase()) {
    return { success: false, error: "Cannot use referral code with matching email address" };
  }

  // 3. Self-referral prevention: Phone equality check
  if (referrer.phone_number && newUser.phone_number && referrer.phone_number === newUser.phone_number) {
    return { success: false, error: "Cannot use referral code with matching phone number" };
  }

  const db = getDb();

  // 4. Duplicate attribution check: Has this user already been referred?
  const existingAttribution = db
    .prepare("SELECT * FROM referrals WHERE referred_user_id = ?")
    .get(newUserId) as Referral | undefined;

  if (existingAttribution) {
    return { success: false, error: "User has already been referred" };
  }

  const id = "ref_" + randomUUID().slice(0, 8);
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO referrals (
      id, referrer_id, referred_user_id, referral_code, status,
      first_purchase_payment_id, ip_address, user_agent, attributed_at, converted_at
    ) VALUES (?, ?, ?, ?, 'signed_up', NULL, ?, ?, ?, NULL)
  `);

  try {
    stmt.run(
      id,
      referrerId,
      newUserId,
      refCodeRecord.code,
      params.ipAddress ?? null,
      params.userAgent ?? null,
      now
    );

    // Increment signups counter on the code
    db.prepare("UPDATE referral_codes SET signups = signups + 1, updated_at = ? WHERE id = ?").run(
      now,
      refCodeRecord.id
    );

    // Notify referrer
    createNotification({
      userId: referrerId,
      title: "New Referral Signup!",
      message: `${newUser.name || "A new creator"} just joined ViPlay using your referral code ${refCodeRecord.code}.`,
      type: "promotion",
    });

    logAudit({
      actorId: newUserId,
      action: "referral.attributed",
      target: referrerId,
      details: {
        referralCode: refCodeRecord.code,
        ipAddress: params.ipAddress,
      },
    });

    const created: Referral = {
      id,
      referrer_id: referrerId,
      referred_user_id: newUserId,
      referral_code: refCodeRecord.code,
      status: "signed_up",
      first_purchase_payment_id: null,
      ip_address: params.ipAddress ?? null,
      user_agent: params.userAgent ?? null,
      attributed_at: now,
      converted_at: null,
    };

    return { success: true, referral: created };
  } catch (err: any) {
    console.error("Referral attribution error:", err);
    return { success: false, error: err?.message || "Failed to attribute referral" };
  }
}

/**
 * Returns referral record for a referred user if one exists.
 */
export function getReferralByReferredUserId(userId: string): Referral | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM referrals WHERE referred_user_id = ?")
    .get(userId) as Referral | undefined;
  return row ?? null;
}

/**
 * List all users referred by a specific referrer.
 */
export function listUserReferrals(
  referrerId: string,
  limit = 50,
  offset = 0
): { referrals: Array<Referral & { user_name: string; user_email: string | null }>; total: number } {
  const db = getDb();

  const countRow = db
    .prepare("SELECT COUNT(*) as count FROM referrals WHERE referrer_id = ?")
    .get(referrerId) as { count: number };
  const total = countRow?.count ?? 0;

  const rows = db
    .prepare(`
      SELECT r.*, u.name as user_name, u.email as user_email
      FROM referrals r
      JOIN users u ON r.referred_user_id = u.id
      WHERE r.referrer_id = ?
      ORDER BY r.attributed_at DESC
      LIMIT ? OFFSET ?
    `)
    .all(referrerId, limit, offset) as any[];

  return { referrals: rows, total };
}
