import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { SafeUser } from "@/lib/db/schema";

// who the route handlers think is signed in
const auth = vi.hoisted(() => ({ user: null as SafeUser | null }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => auth.user }));

// the gateway refund can be made to fail on demand; reward reversal is observed
const gateway = vi.hoisted(() => ({ failRefund: false, refundCalls: 0 }));
vi.mock("@/lib/payments/razorpay", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/payments/razorpay")>();
  return {
    ...real,
    processRazorpayRefund: async (paymentId: string, amount: number, notes?: Record<string, string>) => {
      gateway.refundCalls++;
      if (gateway.failRefund) throw new Error("Razorpay refund failed: 400 BAD_REQUEST_ERROR");
      return real.processRazorpayRefund(paymentId, amount, notes);
    },
  };
});
const rewards = vi.hoisted(() => ({ reversed: [] as string[] }));
vi.mock("@/lib/referrals/rewards", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/referrals/rewards")>();
  return {
    ...real,
    reverseRewardForRefund: (paymentId: string, reason?: string) => {
      rewards.reversed.push(paymentId);
      return real.reverseRewardForRefund(paymentId, reason);
    },
  };
});

import { errorMessage, jsonRequest, makeCapturedPayment, makePayoutRequest, makeUser, walletOf } from "../admin-helpers";
import { getPaymentById, getRefundedTotal } from "@/lib/db/payments";
import { setAdminSetting } from "@/lib/db/admin-settings";
import { getDb } from "@/lib/db";
import {
  approvePayout,
  bulkRejectPayouts,
  getPayoutRequestById,
  processGatewayPayout,
  processManualPayout,
  rejectPayout,
} from "@/lib/referrals/payouts";
import { validateCoupon } from "@/lib/db/coupons";
import { parseCouponDate } from "@/app/api/admin/coupons/schema";

let refundPOST: typeof import("@/app/api/admin/refunds/route").POST;
let payoutsPATCH: typeof import("@/app/api/admin/payouts/route").PATCH;
let couponsPOST: typeof import("@/app/api/admin/coupons/route").POST;
let superAdmin: SafeUser;
let admin: SafeUser;

beforeAll(async () => {
  refundPOST = (await import("@/app/api/admin/refunds/route")).POST;
  payoutsPATCH = (await import("@/app/api/admin/payouts/route")).PATCH;
  couponsPOST = (await import("@/app/api/admin/coupons/route")).POST;
  superAdmin = makeUser("super_admin");
  admin = makeUser("admin");
  setAdminSetting("razorpay_sandbox_mode", "true");
});

afterEach(() => {
  gateway.failRefund = false;
  setAdminSetting("razorpay_sandbox_mode", "true");
});

const refund = (body: unknown) => refundPOST(jsonRequest("/api/admin/refunds", "POST", body));

describe("admin refunds", () => {
  it("records a full refund (the SQL used to throw after the gateway had already paid out)", async () => {
    auth.user = superAdmin;
    const customer = makeUser();
    const payment = makeCapturedPayment(customer.id, 99_900);

    const res = await refund({ paymentId: payment.id, reason: "Customer request" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.fullyRefunded).toBe(true);
    expect(data.refund.amount).toBe(99_900);
    expect(getPaymentById(payment.id)!.status).toBe("refunded");
    expect(getRefundedTotal(payment.id)).toBe(99_900);
    expect(rewards.reversed).toContain(payment.id);
  });

  it("supports partial refunds and never lets the total exceed what was paid", async () => {
    auth.user = superAdmin;
    const payment = makeCapturedPayment(makeUser().id, 100_000);

    const first = await refund({ paymentId: payment.id, amount: 30_000, reason: "Partial goodwill" });
    expect(first.status).toBe(200);
    expect(getPaymentById(payment.id)!.status).toBe("partially_refunded");

    const tooMuch = await refund({ paymentId: payment.id, amount: 70_001, reason: "Over the remaining amount" });
    expect(tooMuch.status).toBe(400);
    expect(await errorMessage(tooMuch)).toMatch(/between 1 and 70000/);

    const rest = await refund({ paymentId: payment.id, amount: 70_000, reason: "Remaining amount" });
    expect(rest.status).toBe(200);
    expect(getPaymentById(payment.id)!.status).toBe("refunded");

    const again = await refund({ paymentId: payment.id, reason: "Second full refund" });
    expect(again.status).toBe(409);
    expect(getRefundedTotal(payment.id)).toBe(100_000);
  });

  it.each([
    ["zero", 0],
    ["negative", -500],
    ["fractional paise", 10.5],
    ["text", "abc"],
  ])("rejects a %s amount instead of refunding everything", async (_label, amount) => {
    auth.user = superAdmin;
    const payment = makeCapturedPayment(makeUser().id, 50_000);
    const res = await refund({ paymentId: payment.id, amount, reason: "Bad amount" });
    expect(res.status).toBe(400);
    expect(getRefundedTotal(payment.id)).toBe(0);
    expect(getPaymentById(payment.id)!.status).toBe("captured");
  });

  it("two simultaneous full refunds of one payment: exactly one goes to the gateway", async () => {
    auth.user = superAdmin;
    const payment = makeCapturedPayment(makeUser().id, 40_000);
    const callsBefore = gateway.refundCalls;
    const [a, b] = await Promise.all([
      refund({ paymentId: payment.id, reason: "Double click 1" }),
      refund({ paymentId: payment.id, reason: "Double click 2" }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(gateway.refundCalls - callsBefore).toBe(1);
    expect(getRefundedTotal(payment.id)).toBe(40_000);
  });

  it("refuses payments that were never captured", async () => {
    auth.user = superAdmin;
    const customer = makeUser();
    const payment = makeCapturedPayment(customer.id, 10_000);
    getDb().prepare("UPDATE payments SET status = 'failed' WHERE id = ?").run(payment.id);
    const res = await refund({ paymentId: payment.id, reason: "Should not refund" });
    expect(res.status).toBe(409);
  });

  it("a gateway failure releases the reservation so the refund can be retried", async () => {
    auth.user = superAdmin;
    const payment = makeCapturedPayment(makeUser().id, 25_000);
    gateway.failRefund = true;
    const failed = await refund({ paymentId: payment.id, reason: "Gateway down" });
    expect(failed.status).toBe(502);
    expect(getRefundedTotal(payment.id)).toBe(0);
    expect(getPaymentById(payment.id)!.status).toBe("captured");

    gateway.failRefund = false;
    const retried = await refund({ paymentId: payment.id, reason: "Gateway back" });
    expect(retried.status).toBe(200);
    expect(getPaymentById(payment.id)!.status).toBe("refunded");
  });

  it("is reserved for super admins", async () => {
    const payment = makeCapturedPayment(makeUser().id, 10_000);
    auth.user = admin;
    expect((await refund({ paymentId: payment.id, reason: "Not allowed" })).status).toBe(403);
    auth.user = makeUser();
    expect((await refund({ paymentId: payment.id, reason: "Not allowed" })).status).toBe(403);
    auth.user = null;
    expect((await refund({ paymentId: payment.id, reason: "Not allowed" })).status).toBe(401);
    expect(getRefundedTotal(payment.id)).toBe(0);
  });
});

describe("payout state machine", () => {
  it("rejecting twice credits the wallet only once", () => {
    const { user, request } = makePayoutRequest(superAdmin.id);
    expect(walletOf(user.id).available_balance).toBe(500_000);

    rejectPayout(request.id, "Invalid UPI", admin.id);
    expect(walletOf(user.id).available_balance).toBe(1_500_000);
    expect(() => rejectPayout(request.id, "Again", admin.id)).toThrow(/Cannot reject a payout that is rejected/);
    expect(walletOf(user.id).available_balance).toBe(1_500_000);
  });

  it("bulk reject over a mixed selection (incl. duplicates and already-rejected) refunds each request once", () => {
    const a = makePayoutRequest(superAdmin.id);
    const b = makePayoutRequest(superAdmin.id);
    rejectPayout(b.request.id, "Already handled", admin.id);
    const res = bulkRejectPayouts([a.request.id, a.request.id, b.request.id], "Batch reject", admin.id);
    expect(res).toEqual({ rejected: 1, failed: 1 });
    expect(walletOf(a.user.id).available_balance).toBe(1_500_000);
    expect(walletOf(b.user.id).available_balance).toBe(1_500_000);
  });

  it("a rejected payout can never be marked paid (user would get the cash and the refund)", () => {
    const { request } = makePayoutRequest(superAdmin.id);
    rejectPayout(request.id, "Fraud check", admin.id);
    expect(() => processManualPayout(request.id, "UTR123456", superAdmin.id)).toThrow(/Cannot mark as paid a payout that is rejected/);
  });

  it("a payout must be approved before it is paid", () => {
    const { user, request } = makePayoutRequest(superAdmin.id);
    expect(() => processManualPayout(request.id, "UTR123456", superAdmin.id)).toThrow(/requested/);
    approvePayout(request.id, admin.id);
    processManualPayout(request.id, "UTR123456", superAdmin.id);
    expect(getPayoutRequestById(request.id)!.status).toBe("paid");
    expect(walletOf(user.id).total_withdrawn).toBe(1_000_000);
    expect(() => rejectPayout(request.id, "Too late", admin.id)).toThrow(/paid/);
  });

  it("two simultaneous gateway dispatches send the money once", async () => {
    const { user, request } = makePayoutRequest(superAdmin.id);
    approvePayout(request.id, admin.id);
    const results = await Promise.allSettled([
      processGatewayPayout(request.id, superAdmin.id),
      processGatewayPayout(request.id, superAdmin.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(getPayoutRequestById(request.id)!.status).toBe("paid");
    expect(walletOf(user.id).total_withdrawn).toBe(1_000_000);
  });

  it("in live mode an unconfigured RazorpayX fails instead of marking the payout paid with a fake UTR", async () => {
    setAdminSetting("razorpay_sandbox_mode", "false");
    const { user, request } = makePayoutRequest(superAdmin.id);
    approvePayout(request.id, admin.id);
    const res = await processGatewayPayout(request.id, superAdmin.id);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not configured/);
    const after = getPayoutRequestById(request.id)!;
    expect(after.status).toBe("approved"); // approval kept, can be retried or paid manually
    expect(after.failure_reason).toMatch(/not configured/);
    expect(walletOf(user.id).total_withdrawn).toBe(0);
  });

  it("disbursing (mark paid / gateway) is super-admin only; approving is any admin", async () => {
    const { request } = makePayoutRequest(superAdmin.id);
    auth.user = admin;
    const approve = await payoutsPATCH(jsonRequest("/api/admin/payouts", "PATCH", { action: "approve", requestId: request.id }));
    expect(approve.status).toBe(200);
    const pay = await payoutsPATCH(
      jsonRequest("/api/admin/payouts", "PATCH", { action: "mark_paid", requestId: request.id, reference: "UTR998877" })
    );
    expect(pay.status).toBe(403);
    auth.user = superAdmin;
    const pay2 = await payoutsPATCH(
      jsonRequest("/api/admin/payouts", "PATCH", { action: "mark_paid", requestId: request.id, reference: "UTR998877" })
    );
    expect(pay2.status).toBe(200);
    const again = await payoutsPATCH(
      jsonRequest("/api/admin/payouts", "PATCH", { action: "reject", requestId: request.id, reason: "late" })
    );
    expect(again.status).toBe(409);
  });
});

describe("coupons", () => {
  const create = (body: Record<string, unknown>) => couponsPOST(jsonRequest("/api/admin/coupons", "POST", body));
  const code = () => "T" + Math.random().toString(36).slice(2, 10).toUpperCase();

  it("a ₹100 fixed coupon (sent as 10000 paise by the page) takes ₹100 off, not ₹1", async () => {
    auth.user = admin;
    const c = code();
    const res = await create({ code: c, discount_type: "fixed", discount_value: 10_000, currency: "INR" });
    expect(res.status).toBe(200);
    const v = validateCoupon(c, 99_900, undefined, 0, "INR");
    expect(v.valid).toBe(true);
    expect(v.discountAmount).toBe(10_000);
    expect(v.finalAmount).toBe(89_900);
  });

  it("a fixed INR coupon does not apply to a USD plan", async () => {
    auth.user = admin;
    const c = code();
    await create({ code: c, discount_type: "fixed", discount_value: 10_000, currency: "INR" });
    expect(validateCoupon(c, 2_000, undefined, 0, "USD").valid).toBe(false);
  });

  it.each([
    ["percentage over 100", { discount_type: "percentage", discount_value: 150 }],
    ["zero discount", { discount_type: "percentage", discount_value: 0 }],
    ["negative fixed", { discount_type: "fixed", discount_value: -100 }],
    ["max redemptions 0 (used to mean unlimited)", { discount_type: "percentage", discount_value: 10, max_redemptions: 0 }],
    ["expiry in the past", { discount_type: "percentage", discount_value: 10, valid_until: "2020-01-01" }],
    ["unknown scope", { discount_type: "percentage", discount_value: 10, scope: "forever" }],
  ])("rejects %s", async (_label, body) => {
    auth.user = admin;
    const res = await create({ code: code(), ...body });
    expect(res.status).toBe(400);
  });

  it("a duplicate code is a 409, not a raw database error", async () => {
    auth.user = admin;
    const c = code();
    expect((await create({ code: c, discount_type: "percentage", discount_value: 10 })).status).toBe(200);
    const dup = await create({ code: c.toLowerCase(), discount_type: "percentage", discount_value: 20 });
    expect(dup.status).toBe(409);
  });

  it("a date-only expiry lasts until the end of that day in India", () => {
    const end = parseCouponDate("2030-01-31", "end");
    // 23:59:59.999 IST == 18:29:59.999 UTC
    expect(new Date(end).toISOString()).toBe("2030-01-31T18:29:59.999Z");
    expect(new Date(parseCouponDate("2030-01-31", "start")).toISOString()).toBe("2030-01-30T18:30:00.000Z");
  });
});
