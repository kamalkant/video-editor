import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPlanById } from "@/lib/db/plans";
import { validateCoupon } from "@/lib/db/coupons";
import { createPaymentRecord } from "@/lib/db/payments";
import { createRazorpayOrder, getRazorpayKeys } from "@/lib/payments/razorpay";
import { calculateInvoiceBreakdown } from "@/lib/payments/invoices";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { planId, couponCode } = body || {};

    if (!planId) {
      return NextResponse.json({ ok: false, message: "Plan ID is required" }, { status: 400 });
    }

    const plan = getPlanById(planId);
    if (!plan || !plan.is_active) {
      return NextResponse.json({ ok: false, message: "Selected plan is unavailable" }, { status: 400 });
    }

    let discountAmount = 0;
    let appliedCouponId: string | null = null;

    if (couponCode) {
      const validation = validateCoupon(couponCode, plan.price_amount, user.id, 0, plan.currency);
      if (validation.valid && validation.coupon) {
        discountAmount = validation.discountAmount || 0;
        appliedCouponId = validation.coupon.id;
      }
    }

    const breakdown = calculateInvoiceBreakdown({
      plan,
      discountAmount,
      couponCode,
    });

    if (breakdown.totalAmount <= 0) {
      // nothing to pay (a 100% coupon): verify-payment activates it, once, for this user only
      const mockOrderId = "order_zero_" + randomBytes(8).toString("hex");
      const payment = createPaymentRecord({
        userId: user.id,
        razorpayOrderId: mockOrderId,
        amount: 0,
        currency: plan.currency,
        status: "created",
        planId: plan.id,
        couponId: appliedCouponId,
      });

      return NextResponse.json({
        ok: true,
        orderId: mockOrderId,
        amount: 0,
        currency: plan.currency,
        isZeroCost: true,
        invoiceNumber: payment.invoice_number,
      });
    }

    const receipt = "rcpt_" + Date.now();
    const order = await createRazorpayOrder({
      amount: breakdown.totalAmount,
      currency: plan.currency,
      receipt,
      notes: {
        userId: user.id,
        planId: plan.id,
        couponCode: couponCode || "",
      },
    });

    const payment = createPaymentRecord({
      userId: user.id,
      razorpayOrderId: order.id,
      amount: breakdown.totalAmount,
      currency: plan.currency,
      status: "created",
      // what this order buys: verify-payment activates exactly this
      planId: plan.id,
      couponId: appliedCouponId,
    });

    const keys = getRazorpayKeys();

    return NextResponse.json({
      ok: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      isSandbox: order.isSandbox,
      keyId: keys.keyId,
      invoiceNumber: payment.invoice_number,
      breakdown,
    });
  } catch (err: any) {
    console.error("Create Order Error:", err);
    return NextResponse.json({ ok: false, message: err?.message || "Failed to create order" }, { status: 500 });
  }
}
