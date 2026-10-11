import { z } from "zod";
import { adminError, parseBody, requireAdmin } from "@/lib/auth/admin-guard";
import { listCoupons, createCoupon, getCouponByCode, getCouponById, toggleCouponActive } from "@/lib/db/coupons";
import { logAudit } from "@/lib/db/audit";
import { couponTermsShape, couponWindow, refineCouponTerms } from "./schema";

export const runtime = "nodejs";

export async function GET() {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  try {
    return Response.json({ ok: true, coupons: listCoupons(true) });
  } catch (err: any) {
    return adminError(500, "server_error", err?.message || "Failed to fetch coupons");
  }
}

const Toggle = z.object({ action: z.literal("toggle"), id: z.string().min(1), active: z.boolean() });

const Create = z
  .object({
    action: z.literal("create").optional(),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/, "code must be 3-32 letters, digits, - or _"),
    max_redemptions: z.number().int().min(1, "max redemptions must be at least 1 (leave empty for unlimited)").nullable().optional(),
    is_active: z.boolean().optional(),
    ...couponTermsShape,
  })
  .superRefine(refineCouponTerms);

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  const body = await parseBody(req, z.union([Toggle, Create]));
  if (body.invalid) return body.invalid;
  const input = body.data;
  const user = guard.user;

  try {
    if (input.action === "toggle") {
      const coupon = getCouponById(input.id);
      if (!coupon) return adminError(404, "not_found", "Coupon not found");
      toggleCouponActive(input.id, input.active);
      logAudit({ actorId: user.id, action: input.active ? "coupon.enabled" : "coupon.disabled", target: input.id, details: { code: coupon.code } });
      return Response.json({ ok: true });
    }

    if (getCouponByCode(input.code)) {
      return adminError(409, "conflict", `A coupon with code ${input.code} already exists`);
    }

    const coupon = createCoupon({
      code: input.code,
      discount_type: input.discount_type,
      discount_value: input.discount_value,
      currency: input.currency,
      max_redemptions: input.max_redemptions ?? null,
      scope: input.scope,
      n_cycles: input.n_cycles,
      ...couponWindow(input),
      is_active: input.is_active !== false,
      created_by: user.id,
    });

    logAudit({
      actorId: user.id,
      action: "coupon.created",
      target: coupon.id,
      details: { code: coupon.code, type: coupon.discount_type, value: coupon.discount_value, currency: coupon.currency, scope: coupon.scope },
    });

    return Response.json({ ok: true, coupon });
  } catch (err: any) {
    return adminError(500, "server_error", err?.message || "Failed to create coupon");
  }
}
