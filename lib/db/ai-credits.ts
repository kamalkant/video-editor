import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "./index";
import type { AICreditLedger, AICreditTransaction } from "./schema";

export function getUserAICredits(userId: string): AICreditLedger {
  const db = getDb();
  let row = db.prepare("SELECT * FROM ai_credits WHERE user_id = ?").get(userId) as AICreditLedger | undefined;

  if (!row) {
    const now = Date.now();
    db.prepare(`
      INSERT INTO ai_credits (user_id, balance, lifetime_granted, lifetime_used, updated_at)
      VALUES (?, 10, 10, 0, ?)
    `).run(userId, now);
    row = {
      user_id: userId,
      balance: 10,
      lifetime_granted: 10,
      lifetime_used: 0,
      updated_at: now,
    };
  }

  return row;
}

export function grantAICredits(
  userId: string,
  amount: number,
  reason: string,
  referenceId?: string | null
): AICreditLedger {
  if (amount <= 0) return getUserAICredits(userId);
  const db = getDb();
  const now = Date.now();
  const current = getUserAICredits(userId);

  const newBalance = current.balance + amount;
  const newGranted = current.lifetime_granted + amount;

  db.prepare(`
    UPDATE ai_credits 
    SET balance = ?, lifetime_granted = ?, updated_at = ?
    WHERE user_id = ?
  `).run(newBalance, newGranted, now, userId);

  const txId = "aitx_" + randomUUID().slice(0, 8);
  db.prepare(`
    INSERT INTO ai_credit_transactions (id, user_id, amount, reason, reference_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(txId, userId, amount, reason, referenceId ?? null, now);

  return {
    user_id: userId,
    balance: newBalance,
    lifetime_granted: newGranted,
    lifetime_used: current.lifetime_used,
    updated_at: now,
  };
}

export function deductAICredits(
  userId: string,
  amount: number,
  reason: string,
  referenceId?: string | null
): { success: boolean; balance: number; error?: string } {
  if (amount <= 0) return { success: true, balance: getUserAICredits(userId).balance };
  const db = getDb();
  const now = Date.now();
  getUserAICredits(userId); // (makes the ledger row if it's missing)

  // one conditional update: two AI requests at once can never spend the same credits twice
  const res = db
    .prepare("UPDATE ai_credits SET balance = balance - ?, lifetime_used = lifetime_used + ?, updated_at = ? WHERE user_id = ? AND balance >= ?")
    .run(amount, amount, now, userId, amount);
  if (res.changes !== 1) {
    const balance = getUserAICredits(userId).balance;
    return {
      success: false,
      balance,
      error: `Insufficient AI credits. Required: ${amount}, Available: ${balance}`,
    };
  }

  const txId = "aitx_" + randomUUID().slice(0, 8);
  db.prepare(`
    INSERT INTO ai_credit_transactions (id, user_id, amount, reason, reference_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(txId, userId, -amount, reason, referenceId ?? null, now);

  return { success: true, balance: getUserAICredits(userId).balance };
}

/** Give back credits taken for an AI request that then failed (undoes the use, not a new grant). */
export function refundAICredits(userId: string, amount: number, reason: string, referenceId?: string | null): void {
  if (amount <= 0) return;
  const db = getDb();
  const now = Date.now();
  db.prepare("UPDATE ai_credits SET balance = balance + ?, lifetime_used = MAX(0, lifetime_used - ?), updated_at = ? WHERE user_id = ?").run(amount, amount, now, userId);
  db.prepare(`
    INSERT INTO ai_credit_transactions (id, user_id, amount, reason, reference_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run("aitx_" + randomUUID().slice(0, 8), userId, amount, reason, referenceId ?? null, now);
}

export function listAICreditTransactions(userId: string, limit = 50): AICreditTransaction[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM ai_credit_transactions
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(userId, limit) as AICreditTransaction[];
}
