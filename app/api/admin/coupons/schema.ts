import { z } from "zod";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * A date input as epoch ms. A bare "YYYY-MM-DD" (what <input type="date"> sends) means that
 * calendar day in India: the start of it for valid_from, the very end of it for valid_until,
 * so a coupon "valid until 31 Oct" works all of 31 Oct IST instead of expiring at 05:30.
 */
export function parseCouponDate(value: string | number, edge: "start" | "end"): number {
  if (typeof value === "number") return value;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
    const utc = edge === "start" ? Date.UTC(y, mo, d, 0, 0, 0, 0) : Date.UTC(y, mo, d, 23, 59, 59, 999);
    return utc - IST_OFFSET_MS;
  }
  return new Date(value).getTime();
}

const dateInput = z.union([z.string().min(1), z.number().int().positive()]);

/** Fields shared by a single coupon and a bulk batch. Fixed amounts are in paise. */
export const couponTermsShape = {
    discount_type: z.enum(["percentage", "fixed"]),
    discount_value: z.number().finite().positive("discount must be greater than 0"),
    currency: z.enum(["INR", "USD"]).default("INR"),
    scope: z.enum(["first_payment", "first_n_cycles", "every_renewal"]).default("first_payment"),
    n_cycles: z.number().int().min(1).max(120).default(1),
    valid_from: dateInput.optional(),
    valid_until: dateInput.nullable().optional(),
};

type Terms = {
  discount_type: "percentage" | "fixed";
  discount_value: number;
  valid_from?: string | number;
  valid_until?: string | number | null;
};

/** Cross-field rules (percent cap, whole paise, a sane validity window); use with .superRefine. */
export function refineCouponTerms(c: Terms, ctx: z.RefinementCtx): void {
  if (c.discount_type === "percentage" && c.discount_value > 100) {
      ctx.addIssue({ code: "custom", path: ["discount_value"], message: "a percentage discount cannot exceed 100" });
    }
    if (c.discount_type === "fixed" && !Number.isInteger(c.discount_value)) {
      ctx.addIssue({ code: "custom", path: ["discount_value"], message: "a fixed discount must be a whole number of paise" });
    }
    const from = c.valid_from !== undefined ? parseCouponDate(c.valid_from, "start") : Date.now();
    if (!Number.isFinite(from)) ctx.addIssue({ code: "custom", path: ["valid_from"], message: "invalid date" });
    if (c.valid_until != null) {
      const until = parseCouponDate(c.valid_until, "end");
      if (!Number.isFinite(until)) ctx.addIssue({ code: "custom", path: ["valid_until"], message: "invalid date" });
      else if (until <= Date.now()) ctx.addIssue({ code: "custom", path: ["valid_until"], message: "expiry must be in the future" });
      else if (until <= from) ctx.addIssue({ code: "custom", path: ["valid_until"], message: "expiry must be after the start date" });
    }
}

export function couponWindow(c: { valid_from?: string | number; valid_until?: string | number | null }) {
  return {
    valid_from: c.valid_from !== undefined ? parseCouponDate(c.valid_from, "start") : Date.now(),
    valid_until: c.valid_until != null ? parseCouponDate(c.valid_until, "end") : null,
  };
}
