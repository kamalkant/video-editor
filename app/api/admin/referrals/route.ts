import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getReferralProgramConfig } from "@/lib/referrals/config";
import { pageParams, requireAdmin } from "@/lib/auth/admin-guard";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const guard = await requireAdmin();
    if (guard.denied) return guard.denied;

    const { searchParams } = new URL(req.url);
    const { limit, offset } = pageParams(searchParams);
    const status = searchParams.get("status");

    const db = getDb();

    // Summary statistics
    const totalRefRow = db.prepare("SELECT COUNT(*) as count FROM referrals").get() as { count: number };
    const conversionsRow = db.prepare("SELECT COUNT(*) as count FROM referrals WHERE status = 'converted'").get() as { count: number };
    const pendingRewardsRow = db.prepare("SELECT COALESCE(SUM(amount), 0) as sum FROM referral_rewards WHERE status = 'pending'").get() as { sum: number };
    const paidPayoutsRow = db.prepare("SELECT COALESCE(SUM(amount), 0) as sum FROM payout_requests WHERE status = 'paid'").get() as { sum: number };

    // Search / list referrals
    const statusFilter = status && status !== "all" ? status : null;
    const countQuery = statusFilter
      ? "SELECT COUNT(*) as count FROM referrals WHERE status = ?"
      : "SELECT COUNT(*) as count FROM referrals";

    const countRow = (statusFilter ? db.prepare(countQuery).get(statusFilter) : db.prepare(countQuery).get()) as { count: number };
    const total = countRow?.count ?? 0;

    const dataQuery = statusFilter
      ? `
        SELECT r.*,
          u1.name as referrer_name, u1.email as referrer_email,
          u2.name as referred_name, u2.email as referred_email,
          rw.amount as reward_amount, rw.status as reward_status
        FROM referrals r
        JOIN users u1 ON r.referrer_id = u1.id
        JOIN users u2 ON r.referred_user_id = u2.id
        LEFT JOIN referral_rewards rw ON r.first_purchase_payment_id = rw.payment_id
        WHERE r.status = ?
        ORDER BY r.attributed_at DESC
        LIMIT ? OFFSET ?
      `
      : `
        SELECT r.*,
          u1.name as referrer_name, u1.email as referrer_email,
          u2.name as referred_name, u2.email as referred_email,
          rw.amount as reward_amount, rw.status as reward_status
        FROM referrals r
        JOIN users u1 ON r.referrer_id = u1.id
        JOIN users u2 ON r.referred_user_id = u2.id
        LEFT JOIN referral_rewards rw ON r.first_purchase_payment_id = rw.payment_id
        ORDER BY r.attributed_at DESC
        LIMIT ? OFFSET ?
      `;

    const rows = (statusFilter
      ? db.prepare(dataQuery).all(statusFilter, limit, offset)
      : db.prepare(dataQuery).all(limit, offset)) as any[];

    const config = getReferralProgramConfig();

    return NextResponse.json({
      ok: true,
      stats: {
        totalReferrals: totalRefRow.count,
        totalConversions: conversionsRow.count,
        conversionRate: totalRefRow.count > 0 ? ((conversionsRow.count / totalRefRow.count) * 100).toFixed(1) : "0.0",
        totalPendingLiability: pendingRewardsRow.sum,
        totalPaidPayouts: paidPayoutsRow.sum,
        programEnabled: config.enabled,
      },
      referrals: rows,
      total,
    });
  } catch (err: any) {
    console.error("Admin referrals GET error:", err);
    return NextResponse.json({ ok: false, message: err?.message || "Failed to load referrals" }, { status: 500 });
  }
}
