import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { getUserById } from "@/lib/db/users";
import { getReferralProgramConfig } from "./config";
import { creditPendingReward, cancelPendingReward, reverseAvailableReward } from "./wallet";
import { createNotification } from "@/lib/db/notifications";
import { logAudit } from "@/lib/db/audit";
import { sendReferralRewardEarnedEmail } from "@/lib/notifications/email-service";
import type { Payment, Referral, ReferralReward } from "@/lib/db/schema";

export type ProcessRewardResult = {
  processed: boolean;
  reward?: ReferralReward;
  reason?: string;
};

/**
 * Idempotently evaluates and credits a referral reward when a qualifying subscription payment is captured.
 */
export function processQualifyingPurchaseReward(payment: Payment): ProcessRewardResult {
  if (!payment || payment.status !== "captured") {
    return { processed: false, reason: "Payment is not in captured status" };
  }

  const db = getDb();

  // 1. Idempotency Guard: Ensure reward has not already been credited for this payment ID
  const existingReward = db
    .prepare("SELECT * FROM referral_rewards WHERE payment_id = ?")
    .get(payment.id) as ReferralReward | undefined;

  if (existingReward) {
    return { processed: false, reward: existingReward, reason: "Reward already processed for this payment" };
  }

  // 2. Check if referral program is active
  const config = getReferralProgramConfig();
  if (!config.enabled) {
    return { processed: false, reason: "Referral program is currently disabled" };
  }

  // 3. Check if paying user was referred and has status 'signed_up'
  const referral = db
    .prepare("SELECT * FROM referrals WHERE referred_user_id = ? LIMIT 1")
    .get(payment.user_id) as Referral | undefined;

  if (!referral) {
    return { processed: false, reason: "Customer has no referral attribution" };
  }

  if (referral.status === "converted" || referral.status === "rejected_fraud") {
    return { processed: false, reason: `Customer referral already in state: ${referral.status}` };
  }

  // 4. Check minimum qualifying purchase amount
  if (payment.amount < config.minQualifyingPurchase) {
    return {
      processed: false,
      reason: `Payment amount ₹${(payment.amount / 100).toFixed(2)} is below minimum qualifying threshold ₹${(config.minQualifyingPurchase / 100).toFixed(2)}`,
    };
  }

  // 5. Check attribution window expiry
  const now = Date.now();
  const windowMs = config.attributionWindowDays * 24 * 60 * 60 * 1000;
  if (now - referral.attributed_at > windowMs) {
    db.prepare("UPDATE referrals SET status = 'expired' WHERE id = ?").run(referral.id);
    return { processed: false, reason: "Referral conversion occurred outside attribution window" };
  }

  // 6. Calculate reward amount
  let rewardAmount = 0;
  if (config.rewardType === "percentage") {
    rewardAmount = Math.round(payment.amount * (config.rewardValue / 100));
  } else {
    rewardAmount = Math.round(config.rewardValue);
  }

  if (rewardAmount <= 0) {
    return { processed: false, reason: "Computed reward amount is zero" };
  }

  const rewardId = "rrew_" + randomUUID().slice(0, 8);
  const unlockAt = now + config.holdingPeriodDays * 24 * 60 * 60 * 1000;

  db.exec("BEGIN IMMEDIATE");
  try {
    // 7. Insert referral_rewards record
    db.prepare(`
      INSERT INTO referral_rewards (
        id, referrer_id, referred_user_id, payment_id, amount, currency,
        reward_type, reward_value, status, holding_period_days, unlock_at, matured_at,
        cancellation_reason, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, NULL, NULL, ?, ?)
    `).run(
      rewardId,
      referral.referrer_id,
      payment.user_id,
      payment.id,
      rewardAmount,
      payment.currency || "INR",
      config.rewardType,
      config.rewardValue,
      config.holdingPeriodDays,
      unlockAt,
      now,
      now
    );

    // 8. Update referral record to 'converted'
    db.prepare(`
      UPDATE referrals
      SET status = 'converted', converted_at = ?, first_purchase_payment_id = ?
      WHERE id = ?
    `).run(now, payment.id, referral.id);

    // 9. Increment conversions counter on referral_codes
    db.prepare(`
      UPDATE referral_codes
      SET conversions = conversions + 1, updated_at = ?
      WHERE user_id = ?
    `).run(now, referral.referrer_id);

    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    console.error("Failed to commit referral reward:", err);
    throw err;
  }

  // 10. Update wallet pending balance and insert ledger entry
  const description = `Referral commission from order ${payment.razorpay_order_id} (${config.rewardType === "percentage" ? `${config.rewardValue}%` : "Fixed"})`;
  creditPendingReward(referral.referrer_id, rewardAmount, rewardId, description);

  // 11. Send in-app notification to referrer
  const formattedReward = (rewardAmount / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 });
  createNotification({
    userId: referral.referrer_id,
    title: "Referral Commission Earned! (Pending)",
    message: `You earned ₹${formattedReward} commission! It is currently in holding and will unlock in ${config.holdingPeriodDays} days.`,
    type: "promotion",
  });

  // 12. Send notification email to referrer
  const referrer = getUserById(referral.referrer_id);
  const referredUser = getUserById(payment.user_id);
  if (referrer?.email) {
    sendReferralRewardEarnedEmail({
      toEmail: referrer.email,
      userName: referrer.name || "Creator",
      referredUserName: referredUser?.name || "Your referred creator",
      amount: rewardAmount,
      holdingDays: config.holdingPeriodDays,
      currency: payment.currency || "INR",
    }).catch((err) => console.error("Referral email dispatch error:", err));
  }

  logAudit({
    actorId: payment.user_id,
    action: "referral.reward_credited",
    target: referral.referrer_id,
    details: {
      rewardId,
      paymentId: payment.id,
      amount: rewardAmount,
      unlockAt,
    },
  });

  const createdReward: ReferralReward = {
    id: rewardId,
    referrer_id: referral.referrer_id,
    referred_user_id: payment.user_id,
    payment_id: payment.id,
    amount: rewardAmount,
    currency: payment.currency || "INR",
    reward_type: config.rewardType,
    reward_value: config.rewardValue,
    status: "pending",
    holding_period_days: config.holdingPeriodDays,
    unlock_at: unlockAt,
    matured_at: null,
    cancellation_reason: null,
    created_at: now,
    updated_at: now,
  };

  return { processed: true, reward: createdReward };
}

/**
 * Handles refund or chargeback reversal for rewards linked to a refunded payment.
 */
export function reverseRewardForRefund(paymentId: string, reason = "Payment refunded"): boolean {
  const db = getDb();
  const reward = db
    .prepare("SELECT * FROM referral_rewards WHERE payment_id = ?")
    .get(paymentId) as ReferralReward | undefined;

  if (!reward) return false;
  if (reward.status === "cancelled" || reward.status === "reversed") {
    return true; // Already reversed
  }

  const now = Date.now();

  if (reward.status === "pending") {
    // Reward was still pending: cancel it and remove from pending balance
    db.prepare(`
      UPDATE referral_rewards
      SET status = 'cancelled', cancellation_reason = ?, updated_at = ?
      WHERE id = ?
    `).run(reason, now, reward.id);

    cancelPendingReward(reward.referrer_id, reward.amount, reward.id, reason);

    createNotification({
      userId: reward.referrer_id,
      title: "Pending Referral Reward Cancelled",
      message: `A pending commission of ₹${(reward.amount / 100).toFixed(2)} was cancelled due to a payment refund.`,
      type: "billing",
    });

    logAudit({
      actorId: null,
      action: "referral.reward_cancelled",
      target: reward.referrer_id,
      details: { rewardId: reward.id, paymentId, reason },
    });

    return true;
  }

  if (reward.status === "available") {
    // Reward had already matured: reverse from available balance
    db.prepare(`
      UPDATE referral_rewards
      SET status = 'reversed', cancellation_reason = ?, updated_at = ?
      WHERE id = ?
    `).run(reason, now, reward.id);

    reverseAvailableReward(reward.referrer_id, reward.amount, reward.id, reason);

    createNotification({
      userId: reward.referrer_id,
      title: "Referral Commission Reversal",
      message: `A referral commission of ₹${(reward.amount / 100).toFixed(2)} was reversed following a customer refund.`,
      type: "billing",
    });

    logAudit({
      actorId: null,
      action: "referral.reward_reversed",
      target: reward.referrer_id,
      details: { rewardId: reward.id, paymentId, reason },
    });

    return true;
  }

  return false;
}
