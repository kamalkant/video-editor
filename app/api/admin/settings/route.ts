import { z } from "zod";
import { adminError, parseBody, requireAdmin, requireSuperAdmin } from "@/lib/auth/admin-guard";
import { isSuperAdmin } from "@/lib/auth/permissions";
import { getAllAdminSettings, redactSettings, setMultipleAdminSettings } from "@/lib/db/admin-settings";
import { logAudit } from "@/lib/db/audit";
import { AI_TOOLS } from "@/lib/ai/costs";

export const runtime = "nodejs";

const dayList = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\s*,\s*\d{1,3})*$/, "use comma-separated whole numbers, e.g. 7,3,1");

/** The system settings this page may write. Referral/payout keys go through /api/admin/referrals/settings. */
const SystemSettings = z
  .object({
    razorpay_sandbox_mode: z.enum(["true", "false"]),
    default_currency: z.enum(["INR", "USD"]),
    default_tax_rate_percent: z.coerce.number().min(0).max(100).transform(String),
    grace_period_days: z.coerce.number().int().min(0).max(30).transform(String),
    default_device_limit: z.coerce.number().int().min(1).max(50).transform(String),
    expiry_notification_days: dayList,
    retry_schedule_hours: dayList,
    admin_notification_email: z.string().trim().email(),
    // the note shown over the editor ("" = none)
    announcement_message: z.string().trim().max(300, "The editor announcement can be at most 300 characters"),
    announcement_tone: z.enum(["info", "warning"]),
    // AI credit price per tool, as JSON ({"video": 20, …}); only known tools, whole numbers 0–1000
    ai_credit_costs: z
      .string()
      .refine((v) => {
        try {
          const o = JSON.parse(v) as Record<string, unknown>;
          return !!o && typeof o === "object" && Object.entries(o).every(([k, n]) => (AI_TOOLS as string[]).includes(k) && Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 1000);
        } catch {
          return false;
        }
      }, "AI credit costs must be whole numbers from 0 to 1000 for known tools"),
  })
  .partial()
  .strict();

export async function GET() {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  try {
    return Response.json({ ok: true, settings: redactSettings(getAllAdminSettings()), canEdit: isSuperAdmin(guard.user) });
  } catch (err: any) {
    return adminError(500, "server_error", err?.message || "Failed to fetch settings");
  }
}

export async function POST(req: Request) {
  const guard = await requireSuperAdmin();
  if (guard.denied) return guard.denied;
  const body = await parseBody(req, SystemSettings);
  if (body.invalid) return body.invalid;

  const before = getAllAdminSettings();
  const changed: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.data)) {
    if (v !== undefined && before[k] !== v) changed[k] = v;
  }
  if (Object.keys(changed).length === 0) {
    return Response.json({ ok: true, message: "No changes to save", changed: [] });
  }

  try {
    setMultipleAdminSettings(changed, guard.user.id);
    logAudit({
      actorId: guard.user.id,
      action: "settings.updated",
      target: "admin_settings",
      details: redactSettings(
        Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, { from: before[k] ?? null, to: v }]))
      ),
    });
    return Response.json({ ok: true, message: "Settings updated successfully", changed: Object.keys(changed) });
  } catch (err: any) {
    return adminError(500, "server_error", err?.message || "Failed to update settings");
  }
}
