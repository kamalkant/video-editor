import "server-only";
import { getDb } from "../db/index";
import { istTime, toCsv, units } from "./csv";

export const EXPORT_KINDS = ["payments", "refunds", "payouts", "users"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

/** The most rows one download holds (newest first). */
export const EXPORT_MAX_ROWS = 50_000;

type Range = { from?: number; to?: number };
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows straight from SQL, read column by column below
type Row = Record<string, any>;

const between = (col: string, r: Range, params: unknown[]) => {
  const parts: string[] = [];
  if (r.from !== undefined) {
    parts.push(`${col} >= ?`);
    params.push(r.from);
  }
  if (r.to !== undefined) {
    parts.push(`${col} <= ?`);
    params.push(r.to);
  }
  return parts.length ? `WHERE ${parts.join(" AND ")}` : "";
};

const query = (sql: (where: string) => string, col: string, r: Range): Row[] => {
  const params: unknown[] = [];
  const where = between(col, r, params);
  return getDb().prepare(sql(where)).all(...(params as never[]), EXPORT_MAX_ROWS) as Row[];
};

/** One admin CSV export: payments, refunds, payouts or users, optionally limited to a date range. */
export function exportCsv(kind: ExportKind, range: Range = {}): { csv: string; rows: number } {
  if (kind === "payments") {
    const rows = query(
      (w) => `
        SELECT p.*, u.email as user_email, u.name as user_name, pl.name as plan_name,
          (SELECT COALESCE(SUM(r.amount), 0) FROM refunds r WHERE r.payment_id = p.id AND r.status IN ('pending', 'processed')) as refunded
        FROM payments p
        JOIN users u ON u.id = p.user_id
        LEFT JOIN subscriptions s ON s.id = p.subscription_id
        LEFT JOIN plans pl ON pl.id = s.plan_id
        ${w} ORDER BY p.created_at DESC LIMIT ?`,
      "p.created_at",
      range,
    );
    const csv = toCsv(rows, [
      ["Date (IST)", (r) => istTime(r.created_at)],
      ["Invoice", (r) => r.invoice_number],
      ["Customer", (r) => r.user_name],
      ["Email", (r) => r.user_email],
      ["Plan", (r) => r.plan_name],
      ["Amount (incl. GST)", (r) => units(r.amount)],
      ["Refunded", (r) => units(r.refunded)],
      ["Currency", (r) => r.currency],
      ["Status", (r) => r.status],
      ["Razorpay order", (r) => r.razorpay_order_id],
      ["Razorpay payment", (r) => r.razorpay_payment_id],
    ]);
    return { csv, rows: rows.length };
  }
  if (kind === "refunds") {
    const rows = query(
      (w) => `
        SELECT r.*, u.email as user_email, u.name as user_name, p.invoice_number as invoice_number, a.email as admin_email
        FROM refunds r
        JOIN users u ON u.id = r.user_id
        JOIN payments p ON p.id = r.payment_id
        LEFT JOIN users a ON a.id = r.created_by
        ${w} ORDER BY r.created_at DESC LIMIT ?`,
      "r.created_at",
      range,
    );
    const csv = toCsv(rows, [
      ["Date (IST)", (r) => istTime(r.created_at)],
      ["Invoice", (r) => r.invoice_number],
      ["Customer", (r) => r.user_name],
      ["Email", (r) => r.user_email],
      ["Amount", (r) => units(r.amount)],
      ["Currency", (r) => r.currency],
      ["Reason", (r) => r.reason],
      ["Status", (r) => r.status],
      ["Razorpay refund", (r) => r.razorpay_refund_id],
      ["By", (r) => r.admin_email],
    ]);
    return { csv, rows: rows.length };
  }
  if (kind === "payouts") {
    // (no bank or UPI details: those stay in the payouts screen)
    const rows = query(
      (w) => `
        SELECT q.*, u.email as user_email, u.name as user_name, b.payout_method as method
        FROM payout_requests q
        JOIN users u ON u.id = q.user_id
        LEFT JOIN payout_beneficiaries b ON b.id = q.beneficiary_id
        ${w} ORDER BY q.requested_at DESC LIMIT ?`,
      "q.requested_at",
      range,
    );
    const csv = toCsv(rows, [
      ["Requested (IST)", (r) => istTime(r.requested_at)],
      ["Name", (r) => r.user_name],
      ["Email", (r) => r.user_email],
      ["Amount", (r) => units(r.amount)],
      ["Currency", (r) => r.currency],
      ["Method", (r) => r.method],
      ["Status", (r) => r.status],
      ["Provider", (r) => r.payout_provider],
      ["Reference", (r) => r.payout_reference],
      ["Paid (IST)", (r) => istTime(r.paid_at)],
      ["Rejection reason", (r) => r.rejection_reason],
      ["Failure reason", (r) => r.failure_reason],
    ]);
    return { csv, rows: rows.length };
  }
  const rows = query(
    (w) => `
      SELECT u.*,
        (SELECT pl.name FROM subscriptions s JOIN plans pl ON pl.id = s.plan_id
         WHERE s.user_id = u.id AND s.status IN ('active', 'trialing', 'grace_period')
         ORDER BY s.created_at DESC LIMIT 1) as plan_name
      FROM users u
      ${w} ORDER BY u.created_at DESC LIMIT ?`,
    "u.created_at",
    range,
  );
  const csv = toCsv(rows, [
    ["Joined (IST)", (r) => istTime(r.created_at)],
    ["Name", (r) => r.name],
    ["Email", (r) => r.email],
    ["Phone", (r) => r.phone_number],
    ["Role", (r) => r.role],
    ["Status", (r) => r.status],
    ["Email verified", (r) => (r.email_verified ? "yes" : "no")],
    ["Plan", (r) => r.plan_name ?? "Free"],
    ["Last sign-in (IST)", (r) => istTime(r.last_login_at)],
  ]);
  return { csv, rows: rows.length };
}
