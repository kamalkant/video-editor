import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/payments/razorpay";
import { getPaymentByOrderId, updatePaymentStatus, recordRefund } from "@/lib/db/payments";
import { renewSubscription, cancelSubscription } from "@/lib/db/subscriptions";
import { createNotification } from "@/lib/db/notifications";
import { logAudit } from "@/lib/db/audit";
import { processQualifyingPurchaseReward, reverseRewardForRefund } from "@/lib/referrals/rewards";
import { getDb } from "@/lib/db";
import type { Payment } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature") || "";

    const isValid = verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      console.warn("Unauthorized webhook attempt: invalid signature");
      return NextResponse.json({ ok: false, message: "Invalid signature" }, { status: 400 });
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;
    const entity = payload.payload?.payment?.entity || payload.payload?.subscription?.entity || {};

    logAudit({
      actorId: null,
      action: `webhook.${event}`,
      target: entity.id || null,
      details: { event },
    });

    if (event === "payment.captured") {
      const orderId = entity.order_id;
      if (orderId) {
        const payment = updatePaymentStatus(orderId, "captured", {
          razorpayPaymentId: entity.id,
        });
        if (payment) {
          try {
            processQualifyingPurchaseReward(payment);
          } catch (refErr) {
            console.error("Webhook referral reward error:", refErr);
          }
        }
      }
    } else if (event === "payment.failed") {
      const orderId = entity.order_id;
      if (orderId) {
        updatePaymentStatus(orderId, "failed", {
          errorCode: entity.error_code,
          errorDescription: entity.error_description,
        });
      }
    } else if (event === "subscription.charged") {
      const subId = entity.id;
      // Renew subscription if matched
    } else if (event === "subscription.cancelled") {
      // Cancel subscription
    } else if (event === "refund.processed") {
      const paymentId = entity.payment_id;
      if (paymentId) {
        try {
          const db = getDb();
          const pay = db
            .prepare("SELECT * FROM payments WHERE razorpay_payment_id = ? OR id = ?")
            .get(paymentId, paymentId) as Payment | undefined;
          if (pay) {
            reverseRewardForRefund(pay.id, "Refund processed via webhook");
          }
        } catch (refErr) {
          console.error("Webhook refund reversal error:", refErr);
        }
      }
    }

    return NextResponse.json({ ok: true, received: true });
  } catch (err: any) {
    console.error("Webhook processing error:", err);
    return NextResponse.json({ ok: false, message: "Webhook error" }, { status: 500 });
  }
}
