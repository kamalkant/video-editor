import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { getDb } from "./index";
import type { Coupon, CouponDiscountType, CouponRedemption, CouponScope } from "./schema";

export function listCoupons(includeInactive = false): Coupon[] {
  const db = getDb();
  const query = includeInactive
    ? "SELECT * FROM coupons ORDER BY created_at DESC"
    : "SELECT * FROM coupons WHERE is_active = 1 ORDER BY created_at DESC";
  return db.prepare(query).all() as Coupon[];
}

export function getCouponById(id: string): Coupon | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM coupons WHERE id = ?").get(id) as Coupon | undefined;
  return row ?? null;
}

export function getCouponByCode(code: string): Coupon | null {
  if (!code) return null;
  const db = getDb();
  const row = db.prepare("SELECT * FROM coupons WHERE code = ? COLLATE NOCASE").get(code.trim()) as Coupon | undefined;
  return row ?? null;
}

export type CouponValidationResult = {
  valid: boolean;
  coupon?: Coupon;
  discountAmount?: number;
  finalAmount?: number;
  error?: string;
};

export function validateCoupon(
  code: string,
  baseAmount: number, // in smallest unit (e.g. paise)
  userId?: string,
  renewalIndex = 0, // 0 = first payment, 1 = first renewal, etc.
  currency?: string // the plan's currency: a fixed-amount coupon only applies in its own currency
): CouponValidationResult {
  const coupon = getCouponByCode(code);
  if (!coupon) {
    return { valid: false, error: "Invalid coupon code." };
  }

  if (!coupon.is_active) {
    return { valid: false, error: "This coupon is no longer active." };
  }

  const now = Date.now();
  if (coupon.valid_from && now < coupon.valid_from) {
    return { valid: false, error: "This coupon is not yet valid." };
  }

  if (coupon.valid_until && now > coupon.valid_until) {
    return { valid: false, error: "This coupon has expired." };
  }

  if (coupon.max_redemptions !== null && coupon.redemption_count >= coupon.max_redemptions) {
    return { valid: false, error: "This coupon has reached its maximum redemption limit." };
  }

  // Check coupon scope applicability
  if (coupon.scope === "first_payment" && renewalIndex > 0) {
    return { valid: false, error: "This coupon is only valid for the initial payment." };
  }

  if (coupon.scope === "first_n_cycles" && renewalIndex >= (coupon.n_cycles || 1)) {
    return { valid: false, error: `This coupon is only valid for the first ${coupon.n_cycles} billing cycles.` };
  }

  if (coupon.discount_type === "fixed" && currency && coupon.currency && coupon.currency !== currency) {
    return { valid: false, error: `This coupon only applies to ${coupon.currency} plans.` };
  }

  // Calculate discount amount
  let discount = 0;
  if (coupon.discount_type === "percentage") {
    discount = Math.round((baseAmount * coupon.discount_value) / 100);
  } else {
    // fixed discount
    discount = Math.round(coupon.discount_value);
  }

  // Cap discount at base amount
  discount = Math.min(discount, baseAmount);
  discount = Math.max(discount, 0);

  const finalAmount = Math.max(baseAmount - discount, 0);

  return {
    valid: true,
    coupon,
    discountAmount: discount,
    finalAmount,
  };
}

export function recordCouponRedemption(data: {
  couponId: string;
  userId: string;
  subscriptionId?: string | null;
  paymentId?: string | null;
  discountAmount: number;
}): CouponRedemption {
  const db = getDb();
  const id = "crd_" + randomUUID().slice(0, 8);
  const now = Date.now();

  const insertStmt = db.prepare(`
    INSERT INTO coupon_redemptions (id, coupon_id, user_id, subscription_id, payment_id, discount_amount, redeemed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertStmt.run(id, data.couponId, data.userId, data.subscriptionId ?? null, data.paymentId ?? null, data.discountAmount, now);

  const updateStmt = db.prepare("UPDATE coupons SET redemption_count = redemption_count + 1 WHERE id = ?");
  updateStmt.run(data.couponId);

  return {
    id,
    coupon_id: data.couponId,
    user_id: data.userId,
    subscription_id: data.subscriptionId ?? null,
    payment_id: data.paymentId ?? null,
    discount_amount: data.discountAmount,
    redeemed_at: now,
  };
}

export function createCoupon(data: {
  code: string;
  discount_type: CouponDiscountType;
  discount_value: number;
  currency?: string;
  max_redemptions?: number | null;
  scope?: CouponScope;
  n_cycles?: number;
  valid_from?: number;
  valid_until?: number | null;
  is_active?: boolean;
  created_by?: string | null;
}): Coupon {
  const db = getDb();
  const id = "cpn_" + randomUUID().slice(0, 8);
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO coupons (
      id, code, discount_type, discount_value, currency, max_redemptions,
      redemption_count, scope, n_cycles, valid_from, valid_until, is_active,
      created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    data.code.trim().toUpperCase(),
    data.discount_type,
    data.discount_value,
    data.currency || "INR",
    data.max_redemptions ?? null,
    data.scope || "first_payment",
    data.n_cycles ?? 1,
    data.valid_from ?? now,
    data.valid_until ?? null,
    data.is_active === false ? 0 : 1,
    data.created_by ?? null,
    now
  );

  return getCouponById(id)!;
}

export function bulkGenerateCoupons(params: {
  count: number;
  prefix?: string;
  discount_type: CouponDiscountType;
  discount_value: number;
  currency?: string;
  max_redemptions?: number;
  scope?: CouponScope;
  n_cycles?: number;
  valid_from?: number;
  valid_until?: number | null;
  created_by?: string | null;
}): Coupon[] {
  const db = getDb();
  const prefix = (params.prefix || "VIPLAY").trim().toUpperCase();
  const generated: Coupon[] = [];
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO coupons (
      id, code, discount_type, discount_value, currency, max_redemptions,
      redemption_count, scope, n_cycles, valid_from, valid_until, is_active,
      created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 1, ?, ?)
  `);

  for (let i = 0; i < params.count; i++) {
    const id = "cpn_" + randomUUID().slice(0, 8);
    // 6 random uppercase chars/digits
    const randomSuffix = randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
    const code = `${prefix}-${randomSuffix}`;

    try {
      stmt.run(
        id,
        code,
        params.discount_type,
        params.discount_value,
        params.currency || "INR",
        params.max_redemptions ?? 1,
        params.scope || "first_payment",
        params.n_cycles ?? 1,
        params.valid_from ?? now,
        params.valid_until ?? null,
        params.created_by ?? null,
        now
      );
      const cpn = getCouponById(id);
      if (cpn) generated.push(cpn);
    } catch {
      // Ignore rare unique code collision and continue
    }
  }

  return generated;
}

export function toggleCouponActive(id: string, active: boolean): boolean {
  const db = getDb();
  const stmt = db.prepare("UPDATE coupons SET is_active = ? WHERE id = ?");
  const res = stmt.run(active ? 1 : 0, id);
  return res.changes > 0;
}
