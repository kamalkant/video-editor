import "server-only";
import { getDb } from "./index";
import { listAuditLogs } from "./audit";
import { getUserAICredits, listAICreditTransactions } from "./ai-credits";
import { listUserDevices, getUserDeviceLimit } from "./devices";
import { listUserPayments } from "./payments";
import { getSafeUserById } from "./users";
import { getUserSubscription, getUserSubscriptionWithPlan } from "./subscriptions";
import { getUserWallet } from "../referrals/wallet";
import { getReferralByReferredUserId, listUserReferrals } from "../referrals/attribution";
import type { AuditLog, Refund } from "./schema";

function omit<T extends object, K extends keyof T>(o: T, ...keys: K[]): Omit<T, K> {
  const out = { ...o };
  for (const k of keys) delete out[k];
  return out;
}

/**
 * Everything the admin "user 360" view shows about one account, in one read: plan and subscription,
 * payments and refunds, AI credits, devices, referrals and wallet, and the audit trail
 * (what they did and what admins did to them). Device session tokens are never included.
 */
export function getUserOverview(userId: string) {
  const user = getSafeUserById(userId);
  if (!user) return null;
  const db = getDb();
  const { plan } = getUserSubscriptionWithPlan(userId);
  const refunds = db.prepare("SELECT * FROM refunds WHERE user_id = ? ORDER BY created_at DESC").all(userId) as Refund[];
  const referredBy = getReferralByReferredUserId(userId);
  const referrer = referredBy ? getSafeUserById(referredBy.referrer_id) : null;
  const referrals = listUserReferrals(userId, 20);

  return {
    user,
    plan: { id: plan.id, name: plan.name, slug: plan.slug, price_amount: plan.price_amount, currency: plan.currency, interval: plan.interval },
    // the latest subscription, whatever its state (null: never subscribed)
    subscription: getUserSubscription(userId),
    payments: listUserPayments(userId).slice(0, 50),
    refunds,
    credits: { ledger: getUserAICredits(userId), recent: listAICreditTransactions(userId, 20) },
    devices: {
      limit: getUserDeviceLimit(userId),
      list: listUserDevices(userId, true).map((d) => omit(d, "session_token")),
    },
    referrals: {
      referredBy: referredBy && { ...referredBy, referrer_name: referrer?.name ?? null, referrer_email: referrer?.email ?? null },
      total: referrals.total,
      recent: referrals.referrals.map((r) => omit(r, "ip_address", "user_agent")),
      wallet: getUserWallet(userId),
    },
    audit: listAuditLogs(30, 0, { subject: userId }).logs as Array<AuditLog & { actor_name: string | null; actor_email: string | null }>,
  };
}

export type UserOverview = NonNullable<ReturnType<typeof getUserOverview>>;
