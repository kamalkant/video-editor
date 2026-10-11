import { afterEach, describe, expect, it, vi } from "vitest";
import type { SafeUser } from "@/lib/db/schema";

const auth = vi.hoisted(() => ({ user: null as SafeUser | null }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => auth.user }));

import { jsonRequest, makeUser } from "../admin-helpers";
import { POST as createOrder } from "@/app/api/payments/razorpay/create-order/route";
import { POST as verify } from "@/app/api/payments/razorpay/verify-payment/route";
import { createCoupon } from "@/lib/db/coupons";
import { getPaymentByOrderId } from "@/lib/db/payments";
import { listPlans } from "@/lib/db/plans";
import { getActiveSubscription } from "@/lib/db/subscriptions";
import { setAdminSetting } from "@/lib/db/admin-settings";
import { generateExpectedSignature, razorpayKeyProblem } from "@/lib/payments/razorpay";

const plans = () => listPlans(false).filter((p) => p.price_amount > 0);
const weekly = () => plans().find((p) => p.interval === "weekly")!;
const yearly = () => plans().find((p) => p.interval === "yearly")!;
const order = async (planId: string, couponCode?: string) => (await createOrder(jsonRequest("/api/payments/razorpay/create-order", "POST", { planId, couponCode }))).json();
const verifyWith = (body: object) => verify(jsonRequest("/api/payments/razorpay/verify-payment", "POST", body));
const planOf = (userId: string) => getActiveSubscription(userId)?.plan_id;

afterEach(() => vi.unstubAllEnvs());

describe("payment verification can't be gamed", () => {
  it("a made-up zero-cost order id activates nothing", async () => {
    auth.user = makeUser();
    const res = await verifyWith({ razorpay_order_id: "order_zero_123", planId: yearly().id });
    expect(res.status).toBe(404);
    expect(planOf(auth.user.id)).toBeUndefined();
  });

  it("pays for weekly, asks for yearly: gets weekly (the plan is the order's, not the browser's)", async () => {
    auth.user = makeUser();
    const o = await order(weekly().id);
    expect(o.isSandbox).toBe(true);
    const payId = "pay_x1";
    const res = await verifyWith({
      razorpay_order_id: o.orderId,
      razorpay_payment_id: payId,
      razorpay_signature: generateExpectedSignature(o.orderId, payId),
      planId: yearly().id,
    });
    expect(res.status).toBe(200);
    expect(planOf(auth.user.id)).toBe(weekly().id);
    expect(getPaymentByOrderId(o.orderId)!.status).toBe("captured");
  });

  it("someone else's order: 404", async () => {
    const owner = makeUser();
    auth.user = owner;
    const o = await order(weekly().id);
    auth.user = makeUser();
    const res = await verifyWith({ razorpay_order_id: o.orderId, razorpay_payment_id: "pay_y", razorpay_signature: "sandbox_verified_signature" });
    expect(res.status).toBe(404);
    expect(planOf(auth.user.id)).toBeUndefined();
  });

  it("an order activates once: a replay doesn't extend the plan", async () => {
    auth.user = makeUser();
    const o = await order(weekly().id);
    const body = { razorpay_order_id: o.orderId, razorpay_payment_id: "pay_z", razorpay_signature: "sandbox_verified_signature" };
    expect((await verifyWith(body)).status).toBe(200);
    const end = getActiveSubscription(auth.user.id)!.current_period_end;
    const again = await verifyWith(body);
    expect((await again.json()).message).toBe("Already activated");
    expect(getActiveSubscription(auth.user.id)!.current_period_end).toBe(end);
  });

  it("live mode: a wrong signature is refused", async () => {
    setAdminSetting("razorpay_sandbox_mode", "false");
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_abc123");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "a-real-looking-secret-1234");
    try {
      auth.user = makeUser();
      // (an order recorded as if Razorpay had created it)
      const { createPaymentRecord } = await import("@/lib/db/payments");
      createPaymentRecord({ userId: auth.user.id, razorpayOrderId: "order_live_1", amount: 35282, planId: weekly().id });
      const bad = await verifyWith({ razorpay_order_id: "order_live_1", razorpay_payment_id: "pay_l", razorpay_signature: "sandbox_verified_signature" });
      expect(bad.status).toBe(400);
      expect(planOf(auth.user.id)).toBeUndefined();
      const good = await verifyWith({ razorpay_order_id: "order_live_1", razorpay_payment_id: "pay_l", razorpay_signature: generateExpectedSignature("order_live_1", "pay_l") });
      expect(good.status).toBe(200);
      expect(planOf(auth.user.id)).toBe(weekly().id);
    } finally {
      setAdminSetting("razorpay_sandbox_mode", "true");
    }
  });

  it("a 100% coupon: the free order activates its own plan once, for its owner only", async () => {
    const code = `FREE${Date.now()}`;
    createCoupon({ code, discount_type: "percentage", discount_value: 100 });
    auth.user = makeUser();
    const o = await order(weekly().id, code);
    expect(o.isZeroCost).toBe(true);
    expect((await verifyWith({ razorpay_order_id: o.orderId, planId: yearly().id })).status).toBe(200);
    expect(planOf(auth.user.id)).toBe(weekly().id);
    // another user can't use that free order
    auth.user = makeUser();
    expect((await verifyWith({ razorpay_order_id: o.orderId })).status).toBe(404);
  });
});

describe("Razorpay key check", () => {
  it("spots a missing or masked secret", () => {
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_FakeKeyId0001");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "");
    expect(razorpayKeyProblem()).toMatch(/not set/);
    vi.stubEnv("RAZORPAY_KEY_SECRET", "***********************");
    expect(razorpayKeyProblem()).toMatch(/masked/);
    vi.stubEnv("RAZORPAY_KEY_SECRET", "abcdefghijklmnopqrstuvwx");
    expect(razorpayKeyProblem()).toBeNull();
    vi.stubEnv("RAZORPAY_KEY_ID", "http://localhost:3000");
    expect(razorpayKeyProblem()).toMatch(/KEY_ID/);
  });
});
