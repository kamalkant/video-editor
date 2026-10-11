import { z } from "zod";
import { adminError, parseBody, requireAdmin, requireSuperAdmin } from "@/lib/auth/admin-guard";
import { isSuperAdmin } from "@/lib/auth/permissions";
import { getReferralProgramConfig, updateReferralProgramConfig, type ReferralProgramConfig } from "@/lib/referrals/config";
import { maskSecret } from "@/lib/db/admin-settings";
import { logAudit } from "@/lib/db/audit";

export const runtime = "nodejs";

/** The config as the browser may see it: the RazorpayX secret is never sent back, only a hint. */
function publicConfig(config: ReferralProgramConfig) {
  return {
    ...config,
    razorpayxKeySecret: "",
    razorpayxKeySecretHint: maskSecret(config.razorpayxKeySecret),
  };
}

const ConfigPatch = z
  .object({
    enabled: z.boolean(),
    rewardType: z.enum(["percentage", "fixed"]),
    rewardValue: z.number().finite().positive(),
    holdingPeriodDays: z.number().int().min(0).max(365),
    minWithdrawalThreshold: z.number().int().min(100),
    maxWithdrawalPerRequest: z.number().int().min(100),
    minQualifyingPurchase: z.number().int().min(0),
    attributionWindowDays: z.number().int().min(1).max(365),
    currency: z.enum(["INR", "USD"]),
    payoutMode: z.enum(["manual_and_gateway", "manual_only", "gateway_only"]),
    razorpayxKeyId: z.string().trim().max(200),
    razorpayxKeySecret: z.string().trim().max(200),
    razorpayxAccountNumber: z.string().trim().max(64),
  })
  .partial();

export async function GET() {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  try {
    return Response.json({ ok: true, config: publicConfig(getReferralProgramConfig()), canEdit: isSuperAdmin(guard.user) });
  } catch (err: any) {
    return adminError(500, "server_error", err?.message || "Failed to load settings");
  }
}

export async function PATCH(req: Request) {
  const guard = await requireSuperAdmin();
  if (guard.denied) return guard.denied;
  const body = await parseBody(req, ConfigPatch);
  if (body.invalid) return body.invalid;
  const updates = body.data;

  const current = getReferralProgramConfig();
  const rewardType = updates.rewardType ?? current.rewardType;
  const rewardValue = updates.rewardValue ?? current.rewardValue;
  if (rewardType === "percentage" && rewardValue > 100) {
    return adminError(400, "bad_request", "rewardValue: a percentage reward cannot exceed 100.");
  }
  const min = updates.minWithdrawalThreshold ?? current.minWithdrawalThreshold;
  const max = updates.maxWithdrawalPerRequest ?? current.maxWithdrawalPerRequest;
  if (min > max) {
    return adminError(400, "bad_request", "minWithdrawalThreshold cannot exceed maxWithdrawalPerRequest.");
  }

  try {
    const updated = updateReferralProgramConfig(updates, guard.user.id);
    const { razorpayxKeySecret, ...loggable } = updates;
    logAudit({
      actorId: guard.user.id,
      action: "admin.referral_config_updated",
      target: "referral_program",
      details: { ...loggable, ...(razorpayxKeySecret ? { razorpayxKeySecret: "[changed]" } : {}) },
    });
    return Response.json({
      ok: true,
      config: publicConfig(updated),
      canEdit: true,
      message: "Referral & Payout program configurations updated successfully",
    });
  } catch (err: any) {
    console.error("Referral settings update error:", err);
    return adminError(500, "server_error", err?.message || "Failed to update settings");
  }
}
