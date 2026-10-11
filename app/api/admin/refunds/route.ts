import { z } from "zod";
import { adminError, parseBody, requireSuperAdmin } from "@/lib/auth/admin-guard";
import { beginRefund, completeRefund, failRefund } from "@/lib/db/payments";
import { processRazorpayRefund } from "@/lib/payments/razorpay";
import { reverseRewardForRefund } from "@/lib/referrals/rewards";
import { sendRefundProcessedEmail } from "@/lib/notifications/email-service";
import { createNotification } from "@/lib/db/notifications";
import { getUserById } from "@/lib/db/users";
import { logAudit } from "@/lib/db/audit";

export const runtime = "nodejs";

const RefundRequest = z.object({
  paymentId: z.string().min(1),
  // smallest currency unit (paise); omit for a full refund of whatever is still refundable
  amount: z.number().int("amount must be a whole number of paise").positive("amount must be greater than 0").optional(),
  reason: z.string().trim().min(3, "a reason is required").max(500),
});

export async function POST(req: Request) {
  const guard = await requireSuperAdmin();
  if (guard.denied) return guard.denied;
  const body = await parseBody(req, RefundRequest);
  if (body.invalid) return body.invalid;
  const { paymentId, amount, reason } = body.data;
  const user = guard.user;

  // 1. reserve the amount (validates status and the refundable balance atomically)
  const claim = beginRefund({ paymentId, amount, reason, createdBy: user.id });
  if (!claim.ok) return adminError(claim.status, claim.status === 404 ? "not_found" : "conflict", claim.error);
  const { refund, payment } = claim;

  // 2. ask the gateway; on failure release the reservation so the admin can retry safely
  let gatewayRefundId: string;
  try {
    const rzp = await processRazorpayRefund(payment.razorpay_payment_id || payment.razorpay_order_id, refund.amount, { reason });
    gatewayRefundId = rzp.id;
  } catch (err: any) {
    failRefund(refund.id);
    logAudit({ actorId: user.id, action: "payment.refund_failed", target: payment.id, details: { amount: refund.amount, reason, error: err?.message } });
    return adminError(502, "gateway_error", err?.message || "Refund was rejected by the payment gateway");
  }

  // 3. the money has moved: from here on, never report failure for the refund itself
  const { fullyRefunded } = completeRefund(refund.id, gatewayRefundId);
  logAudit({
    actorId: user.id,
    action: "payment.refunded",
    target: payment.id,
    details: { amount: refund.amount, reason, refundId: refund.id, gatewayRefundId, fullyRefunded },
  });

  if (fullyRefunded) {
    try {
      reverseRewardForRefund(payment.id, "Payment refunded by admin");
    } catch (err) {
      console.error("Referral reward reversal failed:", err);
    }
  }

  const targetUser = getUserById(payment.user_id);
  if (targetUser?.email) {
    sendRefundProcessedEmail({
      toEmail: targetUser.email,
      userName: targetUser.name || "Creator",
      amount: refund.amount,
      currency: payment.currency,
      reason,
    }).catch((err) => console.error("Refund email error:", err));

    try {
      createNotification({
        userId: targetUser.id,
        title: "Refund Processed",
        message: `A refund of ${payment.currency === "INR" ? "₹" : "$"}${(refund.amount / 100).toFixed(2)} has been processed.`,
        type: "billing",
      });
    } catch (err) {
      console.error("Refund notification error:", err);
    }
  }

  return Response.json({ ok: true, refund: { ...refund, status: "processed", razorpay_refund_id: gatewayRefundId }, fullyRefunded });
}
