import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SafeUser } from "@/lib/db/schema";

const auth = vi.hoisted(() => ({ user: null as SafeUser | null }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => auth.user }));

import { makeCapturedPayment, makeUser } from "../admin-helpers";
import { beginRefund, completeRefund } from "@/lib/db/payments";
import { activateSubscription, evaluateGracePeriods } from "@/lib/db/subscriptions";
import { getPlanBySlug } from "@/lib/db/plans";
import { getDb } from "@/lib/db";

let GET: typeof import("@/app/api/admin/dashboard/stats/route").GET;
beforeAll(async () => {
  GET = (await import("@/app/api/admin/dashboard/stats/route")).GET;
});

async function stats() {
  auth.user = makeUser("admin");
  const res = await GET();
  expect(res.status).toBe(200);
  return (await res.json()).stats;
}
type Revenue = { currency: string; gross: number; refunded: number; net: number; payments: number };
const byCurrency = (s: { revenueByCurrency: Revenue[] }, c: string) =>
  s.revenueByCurrency.find((r) => r.currency === c) ?? { gross: 0, refunded: 0, net: 0, payments: 0 };

describe("dashboard stats", () => {
  it("keeps currencies apart and nets out refunds", async () => {
    const before = await stats();
    const u = makeUser();
    makeCapturedPayment(u.id, 100_000, "INR");
    const refunded = makeCapturedPayment(u.id, 50_000, "INR");
    makeCapturedPayment(u.id, 2_000, "USD");
    const claim = beginRefund({ paymentId: refunded.id, amount: 20_000, reason: "partial", createdBy: u.id });
    if (!claim.ok) throw new Error(claim.error);
    completeRefund(claim.refund.id, "rfnd_test_1");

    const after = await stats();
    const inrBefore = byCurrency(before, "INR");
    const inrAfter = byCurrency(after, "INR");
    expect(inrAfter.gross - inrBefore.gross).toBe(150_000);
    expect(inrAfter.refunded - inrBefore.refunded).toBe(20_000);
    expect(inrAfter.net - inrBefore.net).toBe(130_000);
    // USD is reported on its own, never added into the rupee total
    expect(byCurrency(after, "USD").gross - byCurrency(before, "USD").gross).toBe(2_000);
    expect(after.totalRevenue - before.totalRevenue).toBe(130_000);
  });

  it("plan shares use the same live definition as the total, so they never exceed 100%", async () => {
    const plan = getPlanBySlug("monthly-pro") ?? getPlanBySlug("weekly-pro");
    expect(plan).toBeTruthy();
    const late = makeUser();
    activateSubscription({ userId: late.id, planId: plan!.id });
    // push it into its grace period: it still counts as live everywhere
    getDb().prepare("UPDATE subscriptions SET current_period_end = ? WHERE user_id = ?").run(Date.now() - 1000, late.id);
    evaluateGracePeriods(5);

    const s = await stats();
    const sum = (s.subsByPlan as Array<{ count: number }>).reduce((n, p) => n + p.count, 0);
    expect(sum).toBe(s.activeSubscriptions);
    for (const p of s.subsByPlan) expect(p.count).toBeLessThanOrEqual(s.activeSubscriptions);
    expect(s.gracePeriodSubscriptions).toBeGreaterThan(0);
  });

  it("soft-deleted accounts are not counted as users", async () => {
    const before = await stats();
    const u = makeUser();
    const mid = await stats();
    expect(mid.totalUsers).toBe(before.totalUsers + 2); // `stats()` itself makes an admin each call
    getDb().prepare("UPDATE users SET status = 'deleted' WHERE id = ?").run(u.id);
    const after = await stats();
    expect(after.totalUsers).toBe(mid.totalUsers); // +1 new admin, -1 deleted
  });
});
