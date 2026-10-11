import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "./index";
import type { Subscription, SubscriptionStatus } from "./schema";
import { getPlanById, getPlanBySlug, parsePlan } from "./plans";
import { grantAICredits } from "./ai-credits";
import { logAudit } from "./audit";

export function getActiveSubscription(userId: string): Subscription | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM subscriptions 
    WHERE user_id = ? AND status IN ('active', 'trialing', 'grace_period')
    ORDER BY current_period_end DESC 
    LIMIT 1
  `).get(userId) as Subscription | undefined;
  return row ?? null;
}

export function getUserSubscription(userId: string): Subscription | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM subscriptions 
    WHERE user_id = ? 
    ORDER BY created_at DESC 
    LIMIT 1
  `).get(userId) as Subscription | undefined;
  return row ?? null;
}

export function getUserSubscriptionWithPlan(userId: string) {
  const activeSub = getActiveSubscription(userId);
  if (activeSub) {
    const plan = getPlanById(activeSub.plan_id);
    if (plan) return { subscription: activeSub, plan };
  }

  // Fallback to Free Tier Plan
  const freePlan = getPlanBySlug("free") || {
    id: "plan_free",
    name: "Free Tier",
    slug: "free",
    description: "Default free editing tier",
    interval: "monthly" as const,
    currency: "INR",
    price_amount: 0,
    tax_rate_percent: 18.0,
    trial_days: 0,
    ai_credits_monthly: 10,
    device_limit: 1,
    features: ["720p & 1080p Export", "Basic Tools"],
    is_active: true,
    is_public: true,
    version: 1,
    created_at: 0,
    updated_at: 0,
    max_export_height: 1080,
    watermark: true,
  };

  return { subscription: null, plan: freePlan };
}

export function activateSubscription(data: {
  userId: string;
  planId: string;
  razorpaySubscriptionId?: string | null;
  razorpayCustomerId?: string | null;
  appliedCouponId?: string | null;
  durationMs?: number;
}): Subscription {
  const db = getDb();
  const plan = getPlanById(data.planId);
  if (!plan) throw new Error("Plan not found: " + data.planId);

  const now = Date.now();
  let duration = data.durationMs;
  if (!duration) {
    if (plan.interval === "weekly") duration = 7 * 24 * 60 * 60 * 1000;
    else if (plan.interval === "yearly") duration = 365 * 24 * 60 * 60 * 1000;
    else duration = 30 * 24 * 60 * 60 * 1000;
  }

  const periodEnd = now + duration;
  const id = "sub_" + randomUUID().slice(0, 8);

  // If previous active subscription exists, mark it as cancelled or superseded
  db.prepare(`
    UPDATE subscriptions 
    SET status = 'cancelled', cancelled_at = ?, updated_at = ?
    WHERE user_id = ? AND status IN ('active', 'trialing', 'grace_period')
  `).run(now, now, data.userId);

  const stmt = db.prepare(`
    INSERT INTO subscriptions (
      id, user_id, plan_id, status, current_period_start, current_period_end,
      cancel_at_period_end, cancelled_at, grace_period_end, razorpay_subscription_id,
      razorpay_customer_id, applied_coupon_id, renewal_count, created_at, updated_at
    ) VALUES (?, ?, ?, 'active', ?, ?, 0, NULL, NULL, ?, ?, ?, 0, ?, ?)
  `);

  stmt.run(
    id,
    data.userId,
    data.planId,
    now,
    periodEnd,
    data.razorpaySubscriptionId ?? null,
    data.razorpayCustomerId ?? null,
    data.appliedCouponId ?? null,
    now,
    now
  );

  // Grant AI credits allocated by plan
  if (plan.ai_credits_monthly > 0) {
    grantAICredits(data.userId, plan.ai_credits_monthly, `Subscription activated (${plan.name})`, id);
  }

  logAudit({
    actorId: data.userId,
    action: "subscription.activated",
    target: id,
    details: { planId: data.planId, planName: plan.name, periodEnd },
  });

  return getSubscriptionById(id)!;
}

export function getSubscriptionById(id: string): Subscription | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(id) as Subscription | undefined;
  return row ?? null;
}

export function cancelSubscription(userId: string, immediate = false, actorId: string = userId): boolean {
  const sub = getActiveSubscription(userId);
  if (!sub) return false;

  const db = getDb();
  const now = Date.now();

  if (immediate) {
    db.prepare(`
      UPDATE subscriptions 
      SET status = 'cancelled', cancelled_at = ?, updated_at = ?
      WHERE id = ?
    `).run(now, now, sub.id);
  } else {
    db.prepare(`
      UPDATE subscriptions 
      SET cancel_at_period_end = 1, cancelled_at = ?, updated_at = ?
      WHERE id = ?
    `).run(now, now, sub.id);
  }

  logAudit({
    actorId,
    action: immediate ? "subscription.cancelled_immediate" : "subscription.cancel_at_period_end",
    target: sub.id,
    details: { immediate },
  });

  return true;
}

export function renewSubscription(subId: string, durationMs?: number, actorId?: string): Subscription | null {
  const sub = getSubscriptionById(subId);
  if (!sub) return null;

  const plan = getPlanById(sub.plan_id);
  if (!plan) return null;

  const db = getDb();
  const now = Date.now();

  let duration = durationMs;
  if (!duration) {
    if (plan.interval === "weekly") duration = 7 * 24 * 60 * 60 * 1000;
    else if (plan.interval === "yearly") duration = 365 * 24 * 60 * 60 * 1000;
    else duration = 30 * 24 * 60 * 60 * 1000;
  }

  const newPeriodEnd = Math.max(sub.current_period_end, now) + duration;
  const newRenewalCount = sub.renewal_count + 1;

  db.prepare(`
    UPDATE subscriptions 
    SET status = 'active', current_period_start = ?, current_period_end = ?,
        grace_period_end = NULL, renewal_count = ?, updated_at = ?
    WHERE id = ?
  `).run(now, newPeriodEnd, newRenewalCount, now, subId);

  // Grant AI credits for new cycle
  if (plan.ai_credits_monthly > 0) {
    grantAICredits(sub.user_id, plan.ai_credits_monthly, `Subscription renewed (${plan.name})`, subId);
  }

  logAudit({
    actorId: actorId ?? sub.user_id,
    action: "subscription.renewed",
    target: subId,
    details: { renewalCount: newRenewalCount, newPeriodEnd, ...(actorId ? { complimentary: true } : {}) },
  });

  return getSubscriptionById(subId);
}

const LIVE_STATUSES = ["active", "trialing", "grace_period", "past_due"];

/** Admin: cancel this exact subscription row now (not "whatever is active for the user"). */
export function adminCancelSubscription(subId: string, actorId: string): { ok: true } | { ok: false; error: string } {
  const sub = getSubscriptionById(subId);
  if (!sub) return { ok: false, error: "Subscription not found" };
  if (!LIVE_STATUSES.includes(sub.status)) return { ok: false, error: `Subscription is already ${sub.status}` };
  const now = Date.now();
  const res = getDb()
    .prepare(`UPDATE subscriptions SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ? AND status = ?`)
    .run(now, now, subId, sub.status);
  if (res.changes !== 1) return { ok: false, error: "Subscription changed meanwhile, reload and retry" };
  logAudit({ actorId, action: "subscription.cancelled_immediate", target: subId, details: { userId: sub.user_id, previousStatus: sub.status } });
  return { ok: true };
}

/**
 * Admin: extend a live subscription by one billing period at no charge (credits are granted too).
 * Refused for cancelled/expired rows, and when the user already has another live subscription.
 */
export function adminExtendSubscription(subId: string, actorId: string): { ok: true; subscription: Subscription } | { ok: false; error: string } {
  const sub = getSubscriptionById(subId);
  if (!sub) return { ok: false, error: "Subscription not found" };
  if (!["active", "grace_period", "past_due"].includes(sub.status)) {
    return { ok: false, error: `Only active, grace-period or past-due subscriptions can be extended (this one is ${sub.status})` };
  }
  const other = getDb()
    .prepare(`SELECT id FROM subscriptions WHERE user_id = ? AND id != ? AND status IN ('active', 'trialing', 'grace_period') LIMIT 1`)
    .get(sub.user_id, subId) as { id: string } | undefined;
  if (other) return { ok: false, error: `User already has another live subscription (${other.id})` };
  const renewed = renewSubscription(subId, undefined, actorId);
  return renewed ? { ok: true, subscription: renewed } : { ok: false, error: "Plan for this subscription no longer exists" };
}

/**
 * Checks for past due subscriptions and applies the configured grace period (default 5 days).
 */
export function evaluateGracePeriods(gracePeriodDays = 5): number {
  const db = getDb();
  const now = Date.now();
  const graceDurationMs = gracePeriodDays * 24 * 60 * 60 * 1000;

  const expiredActive = db.prepare(`
    SELECT * FROM subscriptions 
    WHERE status = 'active' AND current_period_end < ?
  `).all(now) as Subscription[];

  for (const s of expiredActive) {
    const graceEnd = s.current_period_end + graceDurationMs;
    db.prepare(`
      UPDATE subscriptions 
      SET status = 'grace_period', grace_period_end = ?, updated_at = ?
      WHERE id = ?
    `).run(graceEnd, now, s.id);

    logAudit({
      actorId: null,
      action: "subscription.grace_period_started",
      target: s.id,
      details: { gracePeriodEnd: graceEnd },
    });
  }

  return expiredActive.length;
}

/**
 * Automatically transitions subscriptions that have exceeded grace period to expired.
 * Does NOT touch user projects or media files.
 */
export function downgradeExpiredSubscriptions(): number {
  const db = getDb();
  const now = Date.now();

  const fullyExpired = db.prepare(`
    SELECT * FROM subscriptions 
    WHERE status = 'grace_period' AND grace_period_end < ?
  `).all(now) as Subscription[];

  for (const s of fullyExpired) {
    db.prepare(`
      UPDATE subscriptions 
      SET status = 'expired', updated_at = ?
      WHERE id = ?
    `).run(now, s.id);

    logAudit({
      actorId: null,
      action: "subscription.soft_downgraded_to_free",
      target: s.id,
      details: { previousPlanId: s.plan_id },
    });
  }

  return fullyExpired.length;
}

export function listSubscriptions(options?: {
  status?: string;
  limit?: number;
  offset?: number;
}): { subscriptions: Array<Subscription & { user_email: string; user_name: string; plan_name: string }>; total: number } {
  const db = getDb();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  const statusFilter = options?.status && options.status !== "all" ? options.status : null;

  const countQuery = statusFilter
    ? "SELECT COUNT(*) as count FROM subscriptions WHERE status = ?"
    : "SELECT COUNT(*) as count FROM subscriptions";
  
  const countRow = (statusFilter ? db.prepare(countQuery).get(statusFilter) : db.prepare(countQuery).get()) as { count: number };
  const total = countRow?.count ?? 0;

  const dataQuery = statusFilter
    ? `
      SELECT s.*, u.email as user_email, u.name as user_name, p.name as plan_name
      FROM subscriptions s
      JOIN users u ON s.user_id = u.id
      JOIN plans p ON s.plan_id = p.id
      WHERE s.status = ?
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `
    : `
      SELECT s.*, u.email as user_email, u.name as user_name, p.name as plan_name
      FROM subscriptions s
      JOIN users u ON s.user_id = u.id
      JOIN plans p ON s.plan_id = p.id
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `;

  const rows = (statusFilter
    ? db.prepare(dataQuery).all(statusFilter, limit, offset)
    : db.prepare(dataQuery).all(limit, offset)) as any[];

  return { subscriptions: rows, total };
}
