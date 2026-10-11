import "server-only";
import type { Payment, Plan } from "@/lib/db/schema";
import { getSubscriptionById } from "@/lib/db/subscriptions";
import { getPlanById } from "@/lib/db/plans";
import { getCouponById } from "@/lib/db/coupons";

export type InvoiceData = {
  invoiceNumber: string;
  date: string;
  userName: string;
  userEmail: string;
  planName: string;
  interval: string;
  currency: string;
  baseAmount: number; // in lowest currency unit (paise/cents)
  discountAmount: number;
  couponCode?: string | null;
  taxPercent: number;
  taxAmount: number;
  totalAmount: number;
  paymentId: string;
  status: string;
};

export function calculateInvoiceBreakdown(params: {
  plan: Plan;
  discountAmount?: number;
  couponCode?: string | null;
}): {
  baseAmount: number;
  discountAmount: number;
  subtotal: number;
  taxPercent: number;
  taxAmount: number;
  totalAmount: number;
} {
  const baseAmount = params.plan.price_amount;
  const discountAmount = params.discountAmount || 0;
  const discountedBase = Math.max(baseAmount - discountAmount, 0);

  // Inclusive or exclusive tax: in India GST is typically calculated on the taxable value
  const taxPercent = params.plan.tax_rate_percent || 18.0;
  // Subtotal before tax
  const taxAmount = Math.round((discountedBase * taxPercent) / 100);
  const totalAmount = discountedBase + taxAmount;

  return {
    baseAmount,
    discountAmount,
    subtotal: discountedBase,
    taxPercent,
    taxAmount,
    totalAmount,
  };
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Headers for serving an invoice page: nothing in it may run (names and coupons come from users). */
export const INVOICE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
  "X-Content-Type-Options": "nosniff",
};

export function generateInvoiceHtml(raw: InvoiceData): string {
  // (every text value is escaped: a user's name could hold markup)
  const data = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, typeof v === "string" ? esc(v) : v]),
  ) as InvoiceData;
  const formatMoney = (val: number, cur: string) => {
    const units = (val / 100).toFixed(2);
    return cur === "INR" ? `₹${units}` : `$${units}`;
  };

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Receipt - ${data.invoiceNumber}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px 20px; margin: 0; }
    .card { max-width: 640px; margin: 0 auto; background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 36px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 24px; margin-bottom: 24px; }
    .logo { font-size: 20px; font-weight: 800; color: #38bdf8; display: flex; align-items: center; gap: 8px; }
    .inv-num { font-size: 14px; font-weight: 600; color: #94a3b8; }
    .details { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; font-size: 13px; color: #94a3b8; margin-bottom: 30px; }
    .details strong { color: #f8fafc; display: block; font-size: 14px; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 30px; }
    th { text-align: left; color: #94a3b8; border-bottom: 1px solid #334155; padding: 10px 0; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
    td { padding: 14px 0; border-bottom: 1px solid #334155/50; color: #f8fafc; }
    .text-right { text-align: right; }
    .total-row { font-size: 18px; font-weight: 800; color: #38bdf8; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .footer { text-align: center; color: #64748b; font-size: 12px; border-top: 1px solid #334155; padding-top: 24px; margin-top: 20px; }
    @media print { body { background: #fff; color: #000; padding: 0; } .card { border: none; box-shadow: none; padding: 0; color: #000; background: #fff; } td, th, .details strong, .total-row { color: #000; } }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="logo">
        <span>ViPlay Studio</span>
      </div>
      <div>
        <span class="badge">${data.status}</span>
        <div class="inv-num" style="margin-top:6px;">${data.invoiceNumber}</div>
      </div>
    </div>

    <div class="details">
      <div>
        <span>Billed To</span>
        <strong>${data.userName}</strong>
        <div>${data.userEmail}</div>
      </div>
      <div style="text-align: right;">
        <span>Receipt Date</span>
        <strong>${data.date}</strong>
        <div>Payment ID: ${data.paymentId}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Cycle</th>
          <th class="text-right">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${data.planName} Plan</td>
          <td style="text-transform: capitalize;">${data.interval}</td>
          <td class="text-right">${formatMoney(data.baseAmount, data.currency)}</td>
        </tr>
        ${data.discountAmount > 0 ? `
        <tr style="color: #34d399;">
          <td>Discount Applied ${data.couponCode ? `(${data.couponCode})` : ""}</td>
          <td>-</td>
          <td class="text-right">-${formatMoney(data.discountAmount, data.currency)}</td>
        </tr>
        ` : ""}
        <tr>
          <td>GST / Applicable Taxes (${data.taxPercent}%)</td>
          <td>-</td>
          <td class="text-right">${formatMoney(data.taxAmount, data.currency)}</td>
        </tr>
        <tr class="total-row">
          <td colspan="2">Total Paid</td>
          <td class="text-right">${formatMoney(data.totalAmount, data.currency)}</td>
        </tr>
      </tbody>
    </table>

    <div class="footer">
      <p>Thank you for choosing ViPlay Studio. If you have questions about this invoice, reach out to billing@viplay.in.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * The invoice for one payment. The amount paid includes GST, so the taxable value and the tax are
 * worked back from it at the plan's rate; a coupon shows as the gap between the plan price and that.
 */
export function invoiceDataForPayment(
  payment: Payment,
  customer: { name: string | null; email: string | null },
  plan: Pick<Plan, "name" | "interval" | "price_amount" | "tax_rate_percent"> | null,
  couponCode?: string | null,
): InvoiceData {
  const taxPercent = plan?.tax_rate_percent ?? 18;
  const taxable = Math.round((payment.amount * 100) / (100 + taxPercent));
  const base = plan && plan.price_amount >= taxable ? plan.price_amount : taxable;
  return {
    invoiceNumber: payment.invoice_number || `INV-${payment.id.slice(0, 8)}`,
    date: new Date(payment.created_at).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }),
    userName: customer.name || "Creator",
    userEmail: customer.email || "",
    planName: plan?.name ?? "ViPlay Studio",
    interval: plan?.interval ?? "",
    currency: payment.currency,
    baseAmount: base,
    discountAmount: base - taxable,
    couponCode: base > taxable ? couponCode ?? null : null,
    taxPercent,
    taxAmount: payment.amount - taxable,
    totalAmount: payment.amount,
    paymentId: payment.razorpay_payment_id || payment.razorpay_order_id,
    status: payment.status.toUpperCase(),
  };
}

/** The invoice page for a payment, with its plan and coupon looked up from the subscription it paid for. */
export function invoiceHtmlForPayment(payment: Payment, customer: { name: string | null; email: string | null }): string {
  const sub = payment.subscription_id ? getSubscriptionById(payment.subscription_id) : null;
  const plan = sub ? getPlanById(sub.plan_id) : null;
  const coupon = sub?.applied_coupon_id ? getCouponById(sub.applied_coupon_id) : null;
  return generateInvoiceHtml(invoiceDataForPayment(payment, customer, plan, coupon?.code));
}

/** "INV-2026-0001.html": a safe file name for the download. */
export const invoiceFileName = (payment: Payment) => `${(payment.invoice_number || `receipt-${payment.id.slice(0, 8)}`).replace(/[^\w.-]/g, "_")}.html`;
