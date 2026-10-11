import "server-only";
import { getDb } from "./index";

/** Subscriptions that currently give access: one definition for every count on the dashboard. */
export const LIVE_SUBSCRIPTION_STATUSES = ["active", "trialing", "grace_period"] as const;

export type RevenueByCurrency = {
  currency: string;
  gross: number; // smallest unit, captured payments (including ones later refunded)
  refunded: number; // processed refunds against those payments
  net: number; // gross - refunded
  payments: number;
};

/** Revenue per currency (never summed across currencies), net of processed refunds. */
export function getRevenueByCurrency(): RevenueByCurrency[] {
  const rows = getDb()
    .prepare(`
      SELECT p.currency as currency,
             COALESCE(SUM(p.amount), 0) as gross,
             COUNT(*) as payments,
             COALESCE(SUM((SELECT COALESCE(SUM(r.amount), 0) FROM refunds r WHERE r.payment_id = p.id AND r.status = 'processed')), 0) as refunded
      FROM payments p
      WHERE p.status IN ('captured', 'partially_refunded', 'refunded')
      GROUP BY p.currency
      ORDER BY gross DESC
    `)
    .all() as Array<{ currency: string; gross: number; payments: number; refunded: number }>;
  return rows.map((r) => ({ ...r, net: r.gross - r.refunded }));
}

/** Live subscriptions per plan; plans that are archived and have no live subscribers are left out. */
export function getLiveSubscriptionsByPlan(): Array<{ plan_name: string; plan_slug: string; count: number }> {
  const placeholders = LIVE_SUBSCRIPTION_STATUSES.map(() => "?").join(", ");
  return getDb()
    .prepare(`
      SELECT p.name as plan_name, p.slug as plan_slug, COUNT(s.id) as count, p.is_active as is_active
      FROM plans p
      LEFT JOIN subscriptions s ON p.id = s.plan_id AND s.status IN (${placeholders})
      GROUP BY p.id
      HAVING p.is_active = 1 OR COUNT(s.id) > 0
      ORDER BY count DESC, p.price_amount ASC
    `)
    .all(...LIVE_SUBSCRIPTION_STATUSES) as Array<{ plan_name: string; plan_slug: string; count: number }>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** India Standard Time: days on the charts start at midnight IST. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** "YYYY-MM-DD" of an epoch-ms moment, in IST. */
export const istDay = (ms: number) => new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);

export type DailyPoint = { day: string; signups: number; paid: number };

/** Monthly recurring revenue per currency (smallest unit): paying subscriptions only (no trials), priced per month. */
export function getMrr(): Array<{ currency: string; mrr: number; payingSubscriptions: number }> {
  const rows = getDb()
    .prepare(`
      SELECT p.currency as currency, p.interval as interval, p.price_amount as price, COUNT(s.id) as n
      FROM subscriptions s JOIN plans p ON p.id = s.plan_id
      WHERE s.status IN ('active', 'grace_period') AND p.price_amount > 0
      GROUP BY p.id
    `)
    .all() as Array<{ currency: string; interval: string; price: number; n: number }>;
  const per = (interval: string, price: number) => (interval === "weekly" ? (price * 52) / 12 : interval === "yearly" ? price / 12 : price);
  const by = new Map<string, { mrr: number; payingSubscriptions: number }>();
  for (const r of rows) {
    const cur = by.get(r.currency) ?? { mrr: 0, payingSubscriptions: 0 };
    cur.mrr += per(r.interval, r.price) * r.n;
    cur.payingSubscriptions += r.n;
    by.set(r.currency, cur);
  }
  return [...by.entries()].map(([currency, v]) => ({ currency, mrr: Math.round(v.mrr), payingSubscriptions: v.payingSubscriptions }));
}

/** Signups and paid payments per day (IST) for the last `days` days, oldest first, with empty days as 0. */
export function getDailyGrowth(days = 30, now = Date.now()): DailyPoint[] {
  const db = getDb();
  const since = now - days * DAY_MS;
  const signups = db.prepare("SELECT created_at as t FROM users WHERE created_at >= ? AND status != 'deleted'").all(since) as Array<{ t: number }>;
  const paid = db
    .prepare("SELECT created_at as t FROM payments WHERE created_at >= ? AND status IN ('captured', 'partially_refunded', 'refunded')")
    .all(since) as Array<{ t: number }>;
  const out = new Map<string, DailyPoint>();
  for (let i = days - 1; i >= 0; i--) {
    const day = istDay(now - i * DAY_MS);
    out.set(day, { day, signups: 0, paid: 0 });
  }
  for (const r of signups) {
    const p = out.get(istDay(r.t));
    if (p) p.signups++;
  }
  for (const r of paid) {
    const p = out.get(istDay(r.t));
    if (p) p.paid++;
  }
  return [...out.values()];
}

/** Share of subscriptions that ended (cancelled / expired) in the last `days` days, of those live at any point in it. */
export function getChurn(days = 30, now = Date.now()): { ended: number; base: number; rate: number } {
  const db = getDb();
  const since = now - days * DAY_MS;
  const ended = (db.prepare("SELECT COUNT(*) as n FROM subscriptions WHERE status IN ('cancelled', 'expired') AND updated_at >= ?").get(since) as { n: number }).n;
  const live = (db.prepare("SELECT COUNT(*) as n FROM subscriptions WHERE status IN ('active', 'trialing', 'grace_period', 'past_due')").get() as { n: number }).n;
  const base = live + ended;
  return { ended, base, rate: base > 0 ? Math.round((ended / base) * 1000) / 10 : 0 };
}

/** The AI tools used most in the last `days` days (from the credit ledger: "AI: <tool>", refunds subtracted). */
export function getAiUsage(days = 30, now = Date.now()): Array<{ tool: string; uses: number; credits: number }> {
  const rows = getDb()
    .prepare("SELECT reason, amount FROM ai_credit_transactions WHERE created_at >= ? AND (reason LIKE 'AI: %' OR reason LIKE 'Refund: AI %')")
    .all(now - days * DAY_MS) as Array<{ reason: string; amount: number }>;
  const by = new Map<string, { uses: number; credits: number }>();
  for (const r of rows) {
    const m = /^(?:AI: |Refund: AI )(\w+)/.exec(r.reason);
    if (!m) continue;
    const cur = by.get(m[1]) ?? { uses: 0, credits: 0 };
    if (r.reason.startsWith("AI: ")) {
      cur.uses++;
      cur.credits += -r.amount;
    } else {
      cur.uses--;
      cur.credits -= r.amount;
    }
    by.set(m[1], cur);
  }
  return [...by.entries()]
    .map(([tool, v]) => ({ tool, uses: Math.max(0, v.uses), credits: Math.max(0, v.credits) }))
    .filter((x) => x.uses > 0)
    .sort((a, b) => b.credits - a.credits);
}
