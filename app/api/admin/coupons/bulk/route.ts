import { z } from "zod";
import { adminError, parseBody, requireAdmin } from "@/lib/auth/admin-guard";
import { bulkGenerateCoupons } from "@/lib/db/coupons";
import { logAudit } from "@/lib/db/audit";
import { couponTermsShape, couponWindow, refineCouponTerms } from "../schema";

export const runtime = "nodejs";

const Bulk = z
  .object({
    count: z.number().int().min(1).max(500),
    prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,12}$/, "prefix must be 2-12 letters or digits").default("VIPLAY"),
    max_redemptions: z.number().int().min(1).default(1),
    ...couponTermsShape,
  })
  .superRefine(refineCouponTerms);

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  const body = await parseBody(req, Bulk);
  if (body.invalid) return body.invalid;
  const input = body.data;

  try {
    const generated = bulkGenerateCoupons({
      count: input.count,
      prefix: input.prefix,
      discount_type: input.discount_type,
      discount_value: input.discount_value,
      currency: input.currency,
      max_redemptions: input.max_redemptions,
      scope: input.scope,
      n_cycles: input.n_cycles,
      ...couponWindow(input),
      created_by: guard.user.id,
    });

    logAudit({
      actorId: guard.user.id,
      action: "coupons.bulk_generated",
      target: `prefix:${input.prefix}`,
      details: { requested: input.count, generated: generated.length, prefix: input.prefix, type: input.discount_type, value: input.discount_value },
    });

    return Response.json({ ok: true, count: generated.length, requested: input.count, coupons: generated });
  } catch (err: any) {
    return adminError(500, "server_error", err?.message || "Bulk generation failed");
  }
}
