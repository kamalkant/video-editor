import { adminError, requireAdmin } from "@/lib/auth/admin-guard";
import { getDb } from "@/lib/db";
import { getUserStats } from "@/lib/db/users";
import { getAiUsage, getChurn, getDailyGrowth, getLiveSubscriptionsByPlan, getMrr, getRevenueByCurrency } from "@/lib/db/admin-stats";

export const runtime = "nodejs";

export async function GET() {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;

  try {
    const db = getDb();
    const userStats = getUserStats();
    const revenueByCurrency = getRevenueByCurrency();
    const inr = revenueByCurrency.find((r) => r.currency === "INR");

    const subsStatusRows = db
      .prepare("SELECT status, COUNT(*) as count FROM subscriptions GROUP BY status")
      .all() as Array<{ status: string; count: number }>;
    const subsByStatus: Record<string, number> = {};
    for (const r of subsStatusRows) subsByStatus[r.status] = r.count;

    // same "live" definition as the per-plan breakdown, so plan shares add up to 100%
    const subsByPlan = getLiveSubscriptionsByPlan();
    const liveSubscriptions = subsByPlan.reduce((sum, p) => sum + p.count, 0);

    const creditRows = db.prepare(`
      SELECT 
        COALESCE(SUM(balance), 0) as total_balance,
        COALESCE(SUM(lifetime_granted), 0) as total_granted,
        COALESCE(SUM(lifetime_used), 0) as total_used
      FROM ai_credits
    `).get() as { total_balance: number; total_granted: number; total_used: number };

    const recentPayments = db.prepare(`
      SELECT p.*, u.name as user_name, u.email as user_email
      FROM payments p
      JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
      LIMIT 5
    `).all();

    const couponRedemptions = (db.prepare("SELECT COUNT(*) as count FROM coupon_redemptions").get() as { count: number })?.count ?? 0;

    return Response.json({
      ok: true,
      stats: {
        revenueByCurrency,
        // kept for older clients: INR only, net of refunds
        totalRevenue: inr?.net ?? 0,
        totalPayments: revenueByCurrency.reduce((sum, r) => sum + r.payments, 0),
        activeSubscriptions: liveSubscriptions,
        trialingSubscriptions: subsByStatus["trialing"] || 0,
        gracePeriodSubscriptions: subsByStatus["grace_period"] || 0,
        expiredSubscriptions: (subsByStatus["expired"] || 0) + (subsByStatus["cancelled"] || 0),
        totalUsers: userStats.total,
        activeUsers: userStats.active,
        subsByPlan,
        subsByStatus,
        aiCredits: creditRows,
        couponRedemptions,
        recentPayments,
        // growth: recurring revenue, the last 30 days, churn and which AI tools people use
        growth: {
          mrr: getMrr(),
          daily: getDailyGrowth(30),
          churn: getChurn(30),
          aiUsage: getAiUsage(30),
        },
      },
    });
  } catch (err: any) {
    return adminError(500, "server_error", err?.message || "Failed to fetch stats");
  }
}
