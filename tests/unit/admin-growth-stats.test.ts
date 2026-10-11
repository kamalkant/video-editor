import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { makeCapturedPayment, makeUser } from "../admin-helpers";
import { getDb } from "@/lib/db";
import { createPlan } from "@/lib/db/plans";
import { activateSubscription } from "@/lib/db/subscriptions";
import { deductAICredits, grantAICredits, refundAICredits } from "@/lib/db/ai-credits";
import { getAiUsage, getChurn, getDailyGrowth, getMrr, istDay } from "@/lib/db/admin-stats";

const DAY = 24 * 60 * 60 * 1000;
// (a currency no other test uses, so these numbers are ours alone)
const CUR = "TST";
const plan = (interval: "weekly" | "monthly" | "yearly", price: number) =>
  createPlan({ name: `Growth ${interval}`, slug: `growth-${interval}-${randomUUID().slice(0, 6)}`, interval, currency: CUR, price_amount: price, features: [] });
const subscribe = (planId: string) => activateSubscription({ userId: makeUser().id, planId });
const ours = () => getMrr().find((m) => m.currency === CUR);

describe("admin growth stats", () => {
  it("MRR prices every paying plan per month; trials and free plans don't count", () => {
    expect(ours()).toBeUndefined();
    subscribe(plan("weekly", 1200).id); // 1200 × 52 / 12 = 5200
    subscribe(plan("monthly", 999).id);
    subscribe(plan("yearly", 12000).id); // 1000
    const trial = subscribe(plan("monthly", 5000).id);
    getDb().prepare("UPDATE subscriptions SET status = 'trialing' WHERE id = ?").run(trial.id);
    subscribe(plan("monthly", 0).id);
    expect(ours()).toEqual({ currency: CUR, mrr: 5200 + 999 + 1000, payingSubscriptions: 3 });
  });

  it("daily growth: 30 IST days oldest first, empty days are 0, deleted signups don't count", () => {
    const now = Date.now();
    const before = getDailyGrowth(30, now);
    expect(before).toHaveLength(30);
    expect(before[29].day).toBe(istDay(now));
    expect(before[0].day).toBe(istDay(now - 29 * DAY));

    makeUser();
    const gone = makeUser();
    getDb().prepare("UPDATE users SET status = 'deleted' WHERE id = ?").run(gone.id);
    const pay = makeCapturedPayment(makeUser().id, 99900);
    getDb().prepare("UPDATE payments SET created_at = ? WHERE id = ?").run(now - 3 * DAY, pay.id);

    const after = getDailyGrowth(30, Date.now());
    const today = after[29];
    expect(today.signups - before[29].signups).toBe(2); // the deleted one is left out
    expect(after[26].paid - before[26].paid).toBe(1);
  });

  it("churn: subscriptions ended in the window over those live or ended", () => {
    const before = getChurn(30);
    const sub = subscribe(plan("monthly", 999).id);
    getDb().prepare("UPDATE subscriptions SET status = 'cancelled', updated_at = ? WHERE id = ?").run(Date.now(), sub.id);
    const after = getChurn(30);
    expect(after.ended - before.ended).toBe(1);
    expect(after.base - before.base).toBe(1);
    expect(after.rate).toBe(Math.round((after.ended / after.base) * 1000) / 10);
  });

  it("AI usage: uses and credits per tool, failed (refunded) requests subtracted", () => {
    const u = makeUser();
    grantAICredits(u.id, 100, "test");
    deductAICredits(u.id, 5, "AI: zzgrowth");
    deductAICredits(u.id, 5, "AI: zzgrowth");
    deductAICredits(u.id, 5, "AI: zzgrowth");
    refundAICredits(u.id, 5, "Refund: AI zzgrowth failed");
    expect(getAiUsage(30).find((x) => x.tool === "zzgrowth")).toEqual({ tool: "zzgrowth", uses: 2, credits: 10 });
  });
});
