import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { createNotification } from "@/lib/db/notifications";
import { logAudit } from "@/lib/db/audit";
import type { Wallet, WalletTransaction, WalletTransactionType, WalletTransactionStatus, ReferralReward } from "@/lib/db/schema";

/**
 * Retrieves a user's wallet or initializes a fresh zero-balance wallet.
 */
export function getUserWallet(userId: string): Wallet {
  const db = getDb();
  let row = db.prepare("SELECT * FROM wallets WHERE user_id = ?").get(userId) as Wallet | undefined;

  if (row) return row;

  const now = Date.now();
  db.prepare(`
    INSERT INTO wallets (user_id, currency, available_balance, pending_balance, total_earned, total_withdrawn, updated_at)
    VALUES (?, 'INR', 0, 0, 0, 0, ?)
  `).run(userId, now);

  return {
    user_id: userId,
    currency: "INR",
    available_balance: 0,
    pending_balance: 0,
    total_earned: 0,
    total_withdrawn: 0,
    updated_at: now,
  };
}

/**
 * Checks pending rewards that have passed their holding period unlock timestamp
 * and transitions them to Available balance inside an atomic transaction.
 */
export function maturePendingRewards(userId?: string): number {
  const db = getDb();
  const now = Date.now();

  const query = userId
    ? "SELECT * FROM referral_rewards WHERE referrer_id = ? AND status = 'pending' AND unlock_at <= ?"
    : "SELECT * FROM referral_rewards WHERE status = 'pending' AND unlock_at <= ?";

  const matureRewards = (
    userId ? db.prepare(query).all(userId, now) : db.prepare(query).all(now)
  ) as ReferralReward[];

  if (matureRewards.length === 0) return 0;

  let maturedCount = 0;

  for (const reward of matureRewards) {
    try {
      db.exec("BEGIN IMMEDIATE");

      // Verify still pending inside transaction
      const currentReward = db
        .prepare("SELECT * FROM referral_rewards WHERE id = ? AND status = 'pending'")
        .get(reward.id) as ReferralReward | undefined;

      if (!currentReward) {
        db.exec("ROLLBACK");
        continue;
      }

      // 1. Mark reward as available
      db.prepare(`
        UPDATE referral_rewards
        SET status = 'available', matured_at = ?, updated_at = ?
        WHERE id = ?
      `).run(now, now, currentReward.id);

      // 2. Fetch current wallet
      const wallet = getUserWallet(currentReward.referrer_id);
      const newPending = Math.max(0, wallet.pending_balance - currentReward.amount);
      const newAvailable = wallet.available_balance + currentReward.amount;
      const newTotalEarned = wallet.total_earned + currentReward.amount;

      // 3. Update wallet balances
      db.prepare(`
        UPDATE wallets
        SET pending_balance = ?, available_balance = ?, total_earned = ?, updated_at = ?
        WHERE user_id = ?
      `).run(newPending, newAvailable, newTotalEarned, now, currentReward.referrer_id);

      // 4. Create immutable wallet ledger entry
      const txId = "wtx_" + randomUUID().slice(0, 8);
      db.prepare(`
        INSERT INTO wallet_transactions (
          id, wallet_user_id, amount, type, status, reference_id, description, balance_after, created_at
        ) VALUES (?, ?, ?, 'reward_matured', 'completed', ?, ?, ?, ?)
      `).run(
        txId,
        currentReward.referrer_id,
        currentReward.amount,
        currentReward.id,
        `Referral reward unlocked (${currentReward.reward_type === "percentage" ? `${currentReward.reward_value}%` : "Fixed"} commission)`,
        newAvailable,
        now
      );

      db.exec("COMMIT");
      maturedCount++;

      // Send in-app notification
      const formattedAmount = (currentReward.amount / 100).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
      });
      createNotification({
        userId: currentReward.referrer_id,
        title: "Referral Reward Available for Withdrawal!",
        message: `₹${formattedAmount} has matured from pending to your available wallet balance.`,
        type: "billing",
      });
    } catch (err) {
      try {
        db.exec("ROLLBACK");
      } catch {}
      console.error(`Failed to mature reward ${reward.id}:`, err);
    }
  }

  return maturedCount;
}

/**
 * Credits a newly generated reward to pending balance and writes a ledger entry.
 */
export function creditPendingReward(
  userId: string,
  amount: number,
  rewardId: string,
  description: string
): Wallet {
  const db = getDb();
  const now = Date.now();

  db.exec("BEGIN IMMEDIATE");
  try {
    const wallet = getUserWallet(userId);
    const newPending = wallet.pending_balance + amount;

    db.prepare(`
      UPDATE wallets SET pending_balance = ?, updated_at = ? WHERE user_id = ?
    `).run(newPending, now, userId);

    const txId = "wtx_" + randomUUID().slice(0, 8);
    db.prepare(`
      INSERT INTO wallet_transactions (
        id, wallet_user_id, amount, type, status, reference_id, description, balance_after, created_at
      ) VALUES (?, ?, ?, 'reward_pending', 'pending', ?, ?, ?, ?)
    `).run(txId, userId, amount, rewardId, description, wallet.available_balance, now);

    db.exec("COMMIT");
    return { ...wallet, pending_balance: newPending, updated_at: now };
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw err;
  }
}

/**
 * Cancels a pending reward (e.g. refund during holding period) and debits pending balance.
 */
export function cancelPendingReward(
  userId: string,
  amount: number,
  rewardId: string,
  reason: string
): Wallet {
  const db = getDb();
  const now = Date.now();

  db.exec("BEGIN IMMEDIATE");
  try {
    const wallet = getUserWallet(userId);
    const newPending = Math.max(0, wallet.pending_balance - amount);

    db.prepare(`
      UPDATE wallets SET pending_balance = ?, updated_at = ? WHERE user_id = ?
    `).run(newPending, now, userId);

    const txId = "wtx_" + randomUUID().slice(0, 8);
    db.prepare(`
      INSERT INTO wallet_transactions (
        id, wallet_user_id, amount, type, status, reference_id, description, balance_after, created_at
      ) VALUES (?, ?, ?, 'reward_reversal', 'cancelled', ?, ?, ?, ?)
    `).run(txId, userId, -amount, rewardId, `Pending reward cancelled: ${reason}`, wallet.available_balance, now);

    db.exec("COMMIT");
    return { ...wallet, pending_balance: newPending, updated_at: now };
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw err;
  }
}

/**
 * Reverses an already-matured reward (e.g. chargeback or late refund) from available balance.
 */
export function reverseAvailableReward(
  userId: string,
  amount: number,
  rewardId: string,
  reason: string
): Wallet {
  const db = getDb();
  const now = Date.now();

  db.exec("BEGIN IMMEDIATE");
  try {
    const wallet = getUserWallet(userId);
    const newAvailable = wallet.available_balance - amount;
    const newTotalEarned = Math.max(0, wallet.total_earned - amount);

    db.prepare(`
      UPDATE wallets SET available_balance = ?, total_earned = ?, updated_at = ? WHERE user_id = ?
    `).run(newAvailable, newTotalEarned, now, userId);

    const txId = "wtx_" + randomUUID().slice(0, 8);
    db.prepare(`
      INSERT INTO wallet_transactions (
        id, wallet_user_id, amount, type, status, reference_id, description, balance_after, created_at
      ) VALUES (?, ?, ?, 'reward_reversal', 'reversed', ?, ?, ?, ?)
    `).run(txId, userId, -amount, rewardId, `Reward reversed: ${reason}`, newAvailable, now);

    db.exec("COMMIT");
    return {
      ...wallet,
      available_balance: newAvailable,
      total_earned: newTotalEarned,
      updated_at: now,
    };
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw err;
  }
}

/**
 * Atomically locks funds from available balance when a withdrawal request is submitted.
 */
export function lockFundsForWithdrawal(
  userId: string,
  amount: number,
  payoutRequestId: string
): { success: boolean; error?: string; wallet?: Wallet } {
  if (amount <= 0) {
    return { success: false, error: "Invalid withdrawal amount" };
  }

  const db = getDb();
  const now = Date.now();

  db.exec("BEGIN IMMEDIATE");
  try {
    const wallet = getUserWallet(userId);

    if (wallet.available_balance < amount) {
      db.exec("ROLLBACK");
      return {
        success: false,
        error: `Insufficient available balance. Required: ₹${(amount / 100).toFixed(2)}, Available: ₹${(wallet.available_balance / 100).toFixed(2)}`,
      };
    }

    const newAvailable = wallet.available_balance - amount;

    db.prepare(`
      UPDATE wallets SET available_balance = ?, updated_at = ? WHERE user_id = ?
    `).run(newAvailable, now, userId);

    const txId = "wtx_" + randomUUID().slice(0, 8);
    db.prepare(`
      INSERT INTO wallet_transactions (
        id, wallet_user_id, amount, type, status, reference_id, description, balance_after, created_at
      ) VALUES (?, ?, ?, 'withdrawal_locked', 'completed', ?, 'Funds locked for withdrawal request', ?, ?)
    `).run(txId, userId, -amount, payoutRequestId, newAvailable, now);

    db.exec("COMMIT");
    return {
      success: true,
      wallet: { ...wallet, available_balance: newAvailable, updated_at: now },
    };
  } catch (err: any) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    return { success: false, error: err?.message || "Failed to lock funds" };
  }
}

/**
 * Releases locked funds back to available balance when a payout request is rejected or fails.
 */
export function releaseLockedFunds(
  userId: string,
  amount: number,
  payoutRequestId: string,
  reason: string
): Wallet {
  const db = getDb();
  const now = Date.now();

  db.exec("BEGIN IMMEDIATE");
  try {
    const wallet = getUserWallet(userId);
    const newAvailable = wallet.available_balance + amount;

    db.prepare(`
      UPDATE wallets SET available_balance = ?, updated_at = ? WHERE user_id = ?
    `).run(newAvailable, now, userId);

    const txId = "wtx_" + randomUUID().slice(0, 8);
    db.prepare(`
      INSERT INTO wallet_transactions (
        id, wallet_user_id, amount, type, status, reference_id, description, balance_after, created_at
      ) VALUES (?, ?, ?, 'withdrawal_refunded', 'completed', ?, ?, ?, ?)
    `).run(txId, userId, amount, payoutRequestId, `Withdrawal unfulfilled/refunded: ${reason}`, newAvailable, now);

    db.exec("COMMIT");
    return { ...wallet, available_balance: newAvailable, updated_at: now };
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw err;
  }
}

/**
 * Finalizes payout as paid and increments lifetime withdrawn balance.
 */
export function finalizeWithdrawalPaid(
  userId: string,
  amount: number,
  payoutRequestId: string,
  reference: string
): Wallet {
  const db = getDb();
  const now = Date.now();

  db.exec("BEGIN IMMEDIATE");
  try {
    const wallet = getUserWallet(userId);
    const newWithdrawn = wallet.total_withdrawn + amount;

    db.prepare(`
      UPDATE wallets SET total_withdrawn = ?, updated_at = ? WHERE user_id = ?
    `).run(newWithdrawn, now, userId);

    const txId = "wtx_" + randomUUID().slice(0, 8);
    db.prepare(`
      INSERT INTO wallet_transactions (
        id, wallet_user_id, amount, type, status, reference_id, description, balance_after, created_at
      ) VALUES (?, ?, 0, 'withdrawal_paid', 'completed', ?, ?, ?, ?)
    `).run(txId, userId, payoutRequestId, `Payout dispatched successfully (Ref: ${reference})`, wallet.available_balance, now);

    db.exec("COMMIT");
    return { ...wallet, total_withdrawn: newWithdrawn, updated_at: now };
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw err;
  }
}

/**
 * Super Admin manual adjustment with mandatory reason and audit log.
 */
export function adminAdjustWallet(
  userId: string,
  amount: number,
  reason: string,
  adminId: string
): { wallet: Wallet; transaction: WalletTransaction } {
  const db = getDb();
  const now = Date.now();

  db.exec("BEGIN IMMEDIATE");
  try {
    const wallet = getUserWallet(userId);
    const newAvailable = wallet.available_balance + amount;
    const newTotalEarned = amount > 0 ? wallet.total_earned + amount : wallet.total_earned;

    db.prepare(`
      UPDATE wallets SET available_balance = ?, total_earned = ?, updated_at = ? WHERE user_id = ?
    `).run(newAvailable, newTotalEarned, now, userId);

    const txId = "wtx_" + randomUUID().slice(0, 8);
    const description = `Admin Adjustment: ${reason}`;

    db.prepare(`
      INSERT INTO wallet_transactions (
        id, wallet_user_id, amount, type, status, reference_id, description, balance_after, created_at
      ) VALUES (?, ?, ?, 'admin_adjustment', 'completed', ?, ?, ?, ?)
    `).run(txId, userId, amount, adminId, description, newAvailable, now);

    logAudit({
      actorId: adminId,
      action: "wallet.admin_adjustment",
      target: userId,
      details: { amount, reason, balanceAfter: newAvailable },
    });

    db.exec("COMMIT");

    const updatedWallet: Wallet = {
      ...wallet,
      available_balance: newAvailable,
      total_earned: newTotalEarned,
      updated_at: now,
    };

    const transaction: WalletTransaction = {
      id: txId,
      wallet_user_id: userId,
      amount,
      type: "admin_adjustment",
      status: "completed",
      reference_id: adminId,
      description,
      balance_after: newAvailable,
      created_at: now,
    };

    return { wallet: updatedWallet, transaction };
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw err;
  }
}

/**
 * Lists ledger transactions for a user's wallet with pagination.
 */
export function listWalletTransactions(
  userId: string,
  limit = 50,
  offset = 0
): { transactions: WalletTransaction[]; total: number } {
  const db = getDb();

  const countRow = db
    .prepare("SELECT COUNT(*) as count FROM wallet_transactions WHERE wallet_user_id = ?")
    .get(userId) as { count: number };
  const total = countRow?.count ?? 0;

  const rows = db
    .prepare(`
      SELECT * FROM wallet_transactions
      WHERE wallet_user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `)
    .all(userId, limit, offset) as WalletTransaction[];

  return { transactions: rows, total };
}
