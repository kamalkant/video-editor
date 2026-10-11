import { z } from "zod";
import { adminError, parseBody, requireAdmin, requireSuperAdmin } from "@/lib/auth/admin-guard";
import { isSuperAdmin } from "@/lib/auth/permissions";
import { listPlans, createPlan, updatePlan, archivePlan, getPlanById, getPlanBySlug } from "@/lib/db/plans";
import { getAdminSetting, getNumberSetting } from "@/lib/db/admin-settings";
import { logAudit } from "@/lib/db/audit";

export const runtime = "nodejs";

export async function GET() {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  try {
    return Response.json({ ok: true, plans: listPlans(true), canEdit: isSuperAdmin(guard.user) });
  } catch (err: any) {
    return adminError(500, "server_error", err?.message || "Failed to fetch plans");
  }
}

// prices are in the smallest currency unit (paise / cents)
const planFields = {
  name: z.string().trim().min(1, "name is required").max(80),
  description: z.string().trim().max(500).nullable().optional(),
  interval: z.enum(["weekly", "monthly", "yearly"]),
  currency: z.enum(["INR", "USD"]),
  price_amount: z.number().int("price must be a whole number of paise").min(0),
  tax_rate_percent: z.number().min(0).max(100),
  trial_days: z.number().int().min(0).max(365),
  ai_credits_monthly: z.number().int().min(0).max(1_000_000),
  device_limit: z.number().int().min(1).max(100),
  features: z.array(z.string().trim().min(1).max(200)).max(50),
  is_active: z.boolean(),
  is_public: z.boolean(),
  /** export limit by the short side, and the Free-plan logo mark */
  max_export_height: z.union([z.literal(720), z.literal(1080), z.literal(1440), z.literal(2160)]),
  watermark: z.boolean(),
};

const CreatePlan = z.object({
  ...planFields,
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase letters, digits and dashes"),
  currency: planFields.currency.optional(),
  tax_rate_percent: planFields.tax_rate_percent.optional(),
  trial_days: planFields.trial_days.default(0),
  ai_credits_monthly: planFields.ai_credits_monthly.default(50),
  device_limit: planFields.device_limit.default(2),
  features: planFields.features.default([]),
  is_active: planFields.is_active.default(true),
  is_public: planFields.is_public.default(true),
  max_export_height: planFields.max_export_height.default(2160),
  watermark: planFields.watermark.default(false),
});

const UpdatePlan = z
  .object({ id: z.string().min(1), bumpVersion: z.boolean().optional(), ...planFields })
  .partial()
  .required({ id: true });

export async function POST(req: Request) {
  const guard = await requireSuperAdmin();
  if (guard.denied) return guard.denied;
  const body = await parseBody(req, CreatePlan);
  if (body.invalid) return body.invalid;
  const input = body.data;

  if (getPlanBySlug(input.slug)) {
    return adminError(409, "conflict", `A plan with slug "${input.slug}" already exists`);
  }

  try {
    const plan = createPlan({
      ...input,
      description: input.description ?? undefined,
      // unset tax / currency fall back to the system defaults from Settings
      currency: input.currency ?? (getAdminSetting("default_currency", "INR") === "USD" ? "USD" : "INR"),
      tax_rate_percent: input.tax_rate_percent ?? getNumberSetting("default_tax_rate_percent", 18),
    });
    logAudit({
      actorId: guard.user.id,
      action: "plan.created",
      target: plan.id,
      details: { name: plan.name, slug: plan.slug, price: plan.price_amount, currency: plan.currency },
    });
    return Response.json({ ok: true, plan });
  } catch (err: any) {
    return adminError(500, "server_error", err?.message || "Failed to create plan");
  }
}

export async function PUT(req: Request) {
  const guard = await requireSuperAdmin();
  if (guard.denied) return guard.denied;
  const body = await parseBody(req, UpdatePlan);
  if (body.invalid) return body.invalid;
  const { id, ...data } = body.data;

  const before = getPlanById(id);
  if (!before) return adminError(404, "not_found", "Plan not found");

  try {
    const updated = updatePlan(id, data);
    if (!updated) return adminError(404, "not_found", "Plan not found");
    const changed = Object.fromEntries(
      Object.entries(data).filter(([k, v]) => JSON.stringify((before as any)[k]) !== JSON.stringify(v))
    );
    // archived → active again is its own audit entry (easy to find next to "plan.archived")
    const restored = !before.is_active && data.is_active === true;
    logAudit({ actorId: guard.user.id, action: restored ? "plan.restored" : "plan.updated", target: id, details: changed });
    return Response.json({ ok: true, plan: updated });
  } catch (err: any) {
    return adminError(500, "server_error", err?.message || "Failed to update plan");
  }
}

export async function DELETE(req: Request) {
  const guard = await requireSuperAdmin();
  if (guard.denied) return guard.denied;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return adminError(400, "bad_request", "Plan ID required");

  try {
    const archived = archivePlan(id);
    if (!archived) return adminError(404, "not_found", "Plan not found");
    logAudit({ actorId: guard.user.id, action: "plan.archived", target: id });
    return Response.json({ ok: true });
  } catch (err: any) {
    return adminError(500, "server_error", err?.message || "Failed to archive plan");
  }
}
