import { z } from "zod";
import { adminError, pageParams, parseBody, requireAdmin } from "@/lib/auth/admin-guard";
import {
  listSubscriptions,
  adminCancelSubscription,
  adminExtendSubscription,
  evaluateGracePeriods,
  downgradeExpiredSubscriptions,
} from "@/lib/db/subscriptions";
import { getNumberSetting } from "@/lib/db/admin-settings";
import { logAudit } from "@/lib/db/audit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "all";
    const data = listSubscriptions({ status, ...pageParams(searchParams) });
    return Response.json({ ok: true, ...data });
  } catch (err: any) {
    return adminError(500, "server_error", err?.message || "Failed to fetch subscriptions");
  }
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("evaluate_grace") }),
  z.object({ action: z.literal("cancel"), subscriptionId: z.string().min(1) }),
  z.object({ action: z.literal("renew"), subscriptionId: z.string().min(1) }),
]);

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  const body = await parseBody(req, Action);
  if (body.invalid) return body.invalid;
  const input = body.data;
  const actorId = guard.user.id;

  try {
    if (input.action === "evaluate_grace") {
      const graceDays = getNumberSetting("grace_period_days", 5);
      const graceCount = evaluateGracePeriods(graceDays);
      const expiredCount = downgradeExpiredSubscriptions();
      logAudit({ actorId, action: "subscription.grace_evaluated", target: "subscriptions", details: { graceDays, graceCount, expiredCount } });
      return Response.json({ ok: true, graceCount, expiredCount, message: `Updated ${graceCount} in grace period, ${expiredCount} expired` });
    }

    if (input.action === "cancel") {
      const res = adminCancelSubscription(input.subscriptionId, actorId);
      if (!res.ok) return adminError(409, "conflict", res.error);
      return Response.json({ ok: true, message: "Subscription cancelled" });
    }

    const res = adminExtendSubscription(input.subscriptionId, actorId);
    if (!res.ok) return adminError(409, "conflict", res.error);
    return Response.json({ ok: true, subscription: res.subscription, message: "Subscription extended by one period (complimentary)" });
  } catch (err: any) {
    return adminError(500, "server_error", err?.message || "Action failed");
  }
}
