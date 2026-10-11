import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "./index";
import type { Payment, PaymentStatus, Refund } from "./schema";

export function generateInvoiceNumber(): string {
  const db = getDb();
  const year = new Date().getFullYear();
  const countRow = db.prepare(`
    SELECT COUNT(*) as count FROM payments WHERE invoice_number LIKE ?
  `).get(`INV-${year}-%`) as { count: number };
  
  const seq = (countRow?.count ?? 0) + 1;
  return `INV-${year}-${String(seq).padStart(4, "0")}`;
}

export function createPaymentRecord(data: {
  userId: string;
  subscriptionId?: string | null;
  razorpayOrderId: string;
  amount: number;
  currency?: string;
  status?: PaymentStatus;
  idempotencyKey?: string | null;
  planId?: string | null;
  couponId?: string | null;
}): Payment {
  const db = getDb();
  const id = "pay_" + randomUUID().slice(0, 8);
  const now = Date.now();
  const invoiceNumber = generateInvoiceNumber();

  const stmt = db.prepare(`
    INSERT INTO payments (
      id, user_id, subscription_id, razorpay_order_id, razorpay_payment_id,
      amount, currency, status, error_code, error_description, invoice_number,
      idempotency_key, created_at, updated_at, plan_id, coupon_id
    ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    data.userId,
    data.subscriptionId ?? null,
    data.razorpayOrderId,
    data.amount,
    data.currency || "INR",
    data.status || "created",
    invoiceNumber,
    data.idempotencyKey ?? null,
    now,
    now,
    data.planId ?? null,
    data.couponId ?? null
  );

  return getPaymentById(id)!;
}

export function getPaymentById(id: string): Payment | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM payments WHERE id = ?").get(id) as Payment | undefined;
  return row ?? null;
}

export function getPaymentByOrderId(orderId: string): Payment | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM payments WHERE razorpay_order_id = ?").get(orderId) as Payment | undefined;
  return row ?? null;
}

/**
 * Marks an order as used to activate its plan. True only for the one request that gets there first
 * (the browser's verify and a retry, or two tabs, can't both activate it).
 */
export function claimPaymentActivation(orderId: string): boolean {
  const res = getDb()
    .prepare("UPDATE payments SET idempotency_key = ?, updated_at = ? WHERE razorpay_order_id = ? AND idempotency_key IS NULL")
    .run(`activated:${orderId}`, Date.now(), orderId);
  return Number(res.changes) === 1;
}

/** Gives the claim back (activation failed after claiming), so the user can retry. */
export function releasePaymentActivation(orderId: string): void {
  getDb().prepare("UPDATE payments SET idempotency_key = NULL WHERE razorpay_order_id = ? AND idempotency_key = ?").run(orderId, `activated:${orderId}`);
}

export function updatePaymentStatus(
  orderId: string,
  status: PaymentStatus,
  data?: {
    razorpayPaymentId?: string;
    errorCode?: string;
    errorDescription?: string;
    subscriptionId?: string;
  }
): Payment | null {
  const db = getDb();
  const now = Date.now();

  db.prepare(`
    UPDATE payments SET
      status = ?,
      razorpay_payment_id = COALESCE(?, razorpay_payment_id),
      error_code = COALESCE(?, error_code),
      error_description = COALESCE(?, error_description),
      subscription_id = COALESCE(?, subscription_id),
      updated_at = ?
    WHERE razorpay_order_id = ?
  `).run(
    status,
    data?.razorpayPaymentId ?? null,
    data?.errorCode ?? null,
    data?.errorDescription ?? null,
    data?.subscriptionId ?? null,
    now,
    orderId
  );

  return getPaymentByOrderId(orderId);
}

export function recordRefund(data: {
  paymentId: string;
  userId: string;
  razorpayRefundId?: string | null;
  amount: number;
  currency: string;
  reason: string;
  createdBy?: string | null;
}): Refund {
  const db = getDb();
  const id = "ref_" + randomUUID().slice(0, 8);
  const now = Date.now();

  db.prepare(`
    INSERT INTO refunds (
      id, payment_id, user_id, razorpay_refund_id, amount, currency,
      reason, status, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'processed', ?, ?)
  `).run(
    id,
    data.paymentId,
    data.userId,
    data.razorpayRefundId ?? null,
    data.amount,
    data.currency,
    data.reason,
    data.createdBy ?? null,
    now
  );

  db.prepare("UPDATE payments SET status = 'refunded', updated_at = ? WHERE id = ?").run(now, data.paymentId);

  return {
    id,
    payment_id: data.paymentId,
    user_id: data.userId,
    razorpay_refund_id: data.razorpayRefundId ?? null,
    amount: data.amount,
    currency: data.currency,
    reason: data.reason,
    status: "processed",
    created_by: data.createdBy ?? null,
    created_at: now,
  };
}

/** Refunds that count against the payment: processed ones plus in-flight (pending) ones. */
export function getRefundedTotal(paymentId: string): number {
  const row = getDb()
    .prepare("SELECT COALESCE(SUM(amount), 0) as total FROM refunds WHERE payment_id = ? AND status IN ('pending', 'processed')")
    .get(paymentId) as { total: number };
  return row.total;
}

export type RefundClaim =
  | { ok: true; refund: Refund; payment: Payment; refundable: number }
  | { ok: false; status: number; error: string };

/**
 * Step 1 of an admin refund: validates the amount against what is still refundable and
 * reserves it with a 'pending' refund row, all in one write transaction. Two concurrent
 * requests cannot both reserve the same money; the gateway is called only after this.
 * `amount` is in the smallest unit (paise); undefined means "everything still refundable".
 */
export function beginRefund(data: { paymentId: string; amount?: number; reason: string; createdBy: string }): RefundClaim {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const payment = getPaymentById(data.paymentId);
    if (!payment) {
      db.exec("ROLLBACK");
      return { ok: false, status: 404, error: "Payment not found" };
    }
    if (payment.status !== "captured" && payment.status !== "partially_refunded") {
      db.exec("ROLLBACK");
      return { ok: false, status: 409, error: `Only captured payments can be refunded (this one is ${payment.status})` };
    }
    const refundable = payment.amount - getRefundedTotal(payment.id);
    const amount = data.amount ?? refundable;
    if (refundable <= 0) {
      db.exec("ROLLBACK");
      return { ok: false, status: 409, error: "This payment has already been fully refunded (or a refund is in progress)" };
    }
    if (!Number.isInteger(amount) || amount <= 0 || amount > refundable) {
      db.exec("ROLLBACK");
      return { ok: false, status: 400, error: `Refund amount must be between 1 and ${refundable} (smallest currency unit)` };
    }

    const id = "ref_" + randomUUID().slice(0, 8);
    const now = Date.now();
    db.prepare(`
      INSERT INTO refunds (id, payment_id, user_id, razorpay_refund_id, amount, currency, reason, status, created_by, created_at)
      VALUES (?, ?, ?, NULL, ?, ?, ?, 'pending', ?, ?)
    `).run(id, payment.id, payment.user_id, amount, payment.currency, data.reason, data.createdBy, now);
    db.exec("COMMIT");

    const refund: Refund = {
      id,
      payment_id: payment.id,
      user_id: payment.user_id,
      razorpay_refund_id: null,
      amount,
      currency: payment.currency,
      reason: data.reason,
      status: "pending",
      created_by: data.createdBy,
      created_at: now,
    };
    return { ok: true, refund, payment, refundable };
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw err;
  }
}

/** Step 2 (gateway accepted): marks the refund processed and the payment (partially_)refunded. */
export function completeRefund(refundId: string, razorpayRefundId: string): { fullyRefunded: boolean } {
  const db = getDb();
  const refund = db.prepare("SELECT * FROM refunds WHERE id = ?").get(refundId) as Refund | undefined;
  if (!refund) throw new Error("Refund not found: " + refundId);
  const now = Date.now();
  db.prepare("UPDATE refunds SET status = 'processed', razorpay_refund_id = ? WHERE id = ?").run(razorpayRefundId, refundId);
  const payment = getPaymentById(refund.payment_id)!;
  const fullyRefunded = getRefundedTotal(payment.id) >= payment.amount;
  db.prepare("UPDATE payments SET status = ?, updated_at = ? WHERE id = ?").run(
    fullyRefunded ? "refunded" : "partially_refunded",
    now,
    payment.id
  );
  return { fullyRefunded };
}

/** Step 2 (gateway refused): releases the reserved amount so it can be retried. */
export function failRefund(refundId: string): void {
  getDb().prepare("UPDATE refunds SET status = 'failed' WHERE id = ? AND status = 'pending'").run(refundId);
}

export function listUserPayments(userId: string): Payment[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM payments 
    WHERE user_id = ? 
    ORDER BY created_at DESC
  `).all(userId) as Payment[];
}

export function listAllPayments(options?: {
  status?: string;
  limit?: number;
  offset?: number;
}): { payments: Array<Payment & { user_email: string; user_name: string }>; total: number } {
  const db = getDb();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  const statusFilter = options?.status && options.status !== "all" ? options.status : null;

  const countQuery = statusFilter
    ? "SELECT COUNT(*) as count FROM payments WHERE status = ?"
    : "SELECT COUNT(*) as count FROM payments";
  
  const countRow = (statusFilter ? db.prepare(countQuery).get(statusFilter) : db.prepare(countQuery).get()) as { count: number };
  const total = countRow?.count ?? 0;

  const dataQuery = statusFilter
    ? `
      SELECT p.*, u.email as user_email, u.name as user_name,
        (SELECT COALESCE(SUM(r.amount), 0) FROM refunds r WHERE r.payment_id = p.id AND r.status IN ('pending', 'processed')) as refunded_amount
      FROM payments p
      JOIN users u ON p.user_id = u.id
      WHERE p.status = ?
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `
    : `
      SELECT p.*, u.email as user_email, u.name as user_name,
        (SELECT COALESCE(SUM(r.amount), 0) FROM refunds r WHERE r.payment_id = p.id AND r.status IN ('pending', 'processed')) as refunded_amount
      FROM payments p
      JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `;

  const rows = (statusFilter
    ? db.prepare(dataQuery).all(statusFilter, limit, offset)
    : db.prepare(dataQuery).all(limit, offset)) as any[];

  return { payments: rows, total };
}
