import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPlanById } from "@/lib/db/plans";
import { recordCouponRedemption } from "@/lib/db/coupons";
import { claimPaymentActivation, getPaymentByOrderId, releasePaymentActivation, updatePaymentStatus } from "@/lib/db/payments";
import { activateSubscription } from "@/lib/db/subscriptions";
import { verifyPaymentSignature } from "@/lib/payments/razorpay";
import { createNotification } from "@/lib/db/notifications";
import { sendPaymentSuccessEmail } from "@/lib/notifications/email-service";
import { processQualifyingPurchaseReward } from "@/lib/referrals/rewards";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body || {};

    if (typeof razorpay_order_id !== "string" || !razorpay_order_id) {
      return NextResponse.json({ ok: false, message: "Missing required verification parameters" }, { status: 400 });
    }

    // The order must be one this user created. What it activates is the plan and coupon saved
    // with the order at checkout: never a plan id sent by the browser.
    const order = getPaymentByOrderId(razorpay_order_id);
    if (!order || order.user_id !== user.id) {
      return NextResponse.json({ ok: false, message: "Order not found" }, { status: 404 });
    }
    if (!order.plan_id) {
      return NextResponse.json({ ok: false, message: "This order is from an older checkout. Please start the checkout again." }, { status: 409 });
    }
    if (order.idempotency_key) {
      // already used to activate the plan (a retry, or a second tab): nothing more to do
      return NextResponse.json({ ok: true, subscriptionId: order.subscription_id, invoiceNumber: order.invoice_number, message: "Already activated" });
    }

    const zeroCost = razorpay_order_id.startsWith("order_zero_") && order.amount === 0;
    if (!zeroCost) {
      if (typeof razorpay_payment_id !== "string" || typeof razorpay_signature !== "string" || !razorpay_payment_id || !razorpay_signature) {
        return NextResponse.json({ ok: false, message: "Payment details missing" }, { status: 400 });
      }

      // Strict server-side HMAC signature verification
      const isValid = verifyPaymentSignature({
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
      });

      if (!isValid) {
        updatePaymentStatus(razorpay_order_id, "failed", {
          errorCode: "SIGNATURE_VERIFICATION_FAILED",
          errorDescription: "Client signature does not match computed gateway HMAC signature",
        });
        return NextResponse.json({ ok: false, message: "Payment signature verification failed" }, { status: 400 });
      }
    }

    const plan = getPlanById(order.plan_id);
    if (!plan) throw new Error("Plan not found: " + order.plan_id);
    const appliedCouponId = order.coupon_id;

    if (!claimPaymentActivation(razorpay_order_id)) {
      const again = getPaymentByOrderId(razorpay_order_id);
      return NextResponse.json({ ok: true, subscriptionId: again?.subscription_id ?? null, invoiceNumber: again?.invoice_number, message: "Already activated" });
    }

    // Activate subscription
    let sub;
    try {
      sub = activateSubscription({
        userId: user.id,
        planId: plan.id,
        appliedCouponId,
      });
    } catch (err) {
      releasePaymentActivation(razorpay_order_id);
      throw err;
    }

    // Update payment record to captured
    const payment = updatePaymentStatus(razorpay_order_id, "captured", {
      razorpayPaymentId: zeroCost ? undefined : razorpay_payment_id,
      subscriptionId: sub.id,
    });

    // Record coupon redemption
    if (appliedCouponId && payment) {
      const discountAmount = Math.max(plan.price_amount - payment.amount, 0);
      recordCouponRedemption({
        couponId: appliedCouponId,
        userId: user.id,
        subscriptionId: sub.id,
        paymentId: payment.id,
        discountAmount,
      });
    }

    // Process referral reward for qualifying conversion
    if (payment) {
      try {
        processQualifyingPurchaseReward(payment);
      } catch (refErr) {
        console.error("Referral reward error:", refErr);
      }
    }

    // Create in-app notification
    createNotification({
      userId: user.id,
      title: "Plan Activated!",
      message: `Your ${plan.name} plan is now active. All features and AI credits are unlocked.`,
      type: "billing",
    });

    // Send confirmation email
    if (user.email && payment) {
      sendPaymentSuccessEmail({
        toEmail: user.email,
        userName: user.name || "Creator",
        invoiceNumber: payment.invoice_number || `INV-${Date.now()}`,
        planName: plan.name,
        amount: payment.amount,
        currency: payment.currency,
      }).catch((err) => console.error("Async email dispatch error:", err));
    }

    return NextResponse.json({
      ok: true,
      subscriptionId: sub.id,
      invoiceNumber: payment?.invoice_number,
      message: "Subscription successfully activated",
    });
  } catch (err: any) {
    console.error("Payment Verification Error:", err);
    return NextResponse.json({ ok: false, message: err?.message || "Failed to verify payment" }, { status: 500 });
  }
}
