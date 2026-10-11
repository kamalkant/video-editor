import { z } from "zod";
import { adminError, parseBody, requireAdmin } from "@/lib/auth/admin-guard";
import { isSuperAdmin } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/db/audit";
import {
  createCampaign,
  listCampaigns,
  getCampaignById,
  getCampaignRecipients,
  dispatchCampaign,
  retryFailedCampaignRecipients,
  listNotificationRules,
  updateNotificationRule,
  checkAndTriggerLifecycleNotifications,
  sendDirectNotification,
  listAllRecipients,
  resolveAudience,
  isSafeCtaUrl,
} from "@/lib/notifications/campaign-engine";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;

  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get("campaignId");

  if (campaignId) {
    const campaign = getCampaignById(campaignId);
    if (!campaign) return adminError(404, "not_found", "Campaign not found.");
    const recipients = getCampaignRecipients(campaignId);
    return Response.json({ ok: true, campaign, recipients });
  }

  const campaigns = listCampaigns();
  const rules = listNotificationRules();
  const isEmailLive = !!(process.env.RESEND_API_KEY || process.env.SMTP_HOST);
  const emailConfig = {
    provider: process.env.EMAIL_PROVIDER || (process.env.RESEND_API_KEY ? "resend" : process.env.SMTP_HOST ? "smtp" : "dev_console"),
    isLive: isEmailLive,
    from: process.env.EMAIL_FROM || "ViPlay Studio <noreply@viplay.in>",
  };

  const recentRecipients = listAllRecipients(100);
  return Response.json({ ok: true, campaigns, rules, emailConfig, recentRecipients, canBroadcastAll: isSuperAdmin(guard.user) });
}

const channels = z.array(z.enum(["in_app", "email", "push"])).min(1, "pick at least one channel");
const ctaUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => v === "" || isSafeCtaUrl(v), "CTA link must be an http(s) URL")
  .nullable()
  .optional();

const audienceFilter = z.object({
  type: z.enum(["all", "plan", "csv", "users", "single_user", "single_email"]),
  planSlug: z.string().optional(),
  userIds: z.array(z.string()).max(10000).optional(),
  userId: z.string().optional(),
  userEmail: z.string().optional(),
  emails: z.array(z.string()).max(10000).optional(),
  email: z.string().optional(),
});

const Action = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().trim().min(1, "campaign name is required").max(200),
    title: z.string().trim().min(1, "title is required").max(200),
    message: z.string().trim().min(1, "message is required").max(10000),
    imageUrl: z.string().nullable().optional(),
    ctaLabel: z.string().trim().max(80).nullable().optional(),
    ctaUrl,
    channels: channels.default(["in_app"]),
    priority: z.enum(["normal", "high", "urgent"]).default("normal"),
    audienceFilter: audienceFilter.default({ type: "all" }),
    scheduledFor: z.number().int().nullable().optional(),
    sendImmediately: z.boolean().optional(),
  }),
  z.object({ action: z.literal("preview_audience"), audienceFilter }),
  z.object({ action: z.literal("dispatch"), campaignId: z.string().min(1) }),
  z.object({
    action: z.literal("direct_send"),
    userId: z.string().nullable().optional(),
    email: z.string().trim().email("invalid email").nullable().optional().or(z.literal("")),
    title: z.string().trim().min(1, "title is required").max(200),
    message: z.string().trim().min(1, "message is required").max(10000),
    ctaLabel: z.string().trim().max(80).nullable().optional(),
    ctaUrl,
    channels: channels.default(["in_app", "email"]),
    priority: z.enum(["normal", "high", "urgent"]).default("normal"),
  }),
  z.object({
    action: z.literal("test_send"),
    campaignId: z.string().min(1),
    testEmail: z.string().trim().email("invalid test email").optional().or(z.literal("")),
    testUserId: z.string().optional(),
  }),
  z.object({ action: z.literal("retry_failed"), campaignId: z.string().min(1) }),
  z.object({
    action: z.literal("update_rule"),
    id: z.string().min(1),
    isEnabled: z.boolean(),
    channels: z.array(z.enum(["in_app", "email", "push"])).default(["in_app", "email"]),
    templateTitle: z.string().trim().min(1).max(200),
    templateBody: z.string().trim().min(1).max(10000),
  }),
  z.object({ action: z.literal("trigger_lifecycle") }),
]);

const ALL_AUDIENCE_DENIED = "Only a Super Admin can send to all users.";

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  const body = await parseBody(request, Action);
  if (body.invalid) return body.invalid;
  const input = body.data;
  const actor = guard.user;

  try {
    if (input.action === "preview_audience") {
      return Response.json({ ok: true, count: resolveAudience(input.audienceFilter).length });
    }

    if (input.action === "create") {
      if (input.audienceFilter.type === "all" && input.sendImmediately && !isSuperAdmin(actor)) {
        return adminError(403, "forbidden", ALL_AUDIENCE_DENIED);
      }
      if (input.scheduledFor != null && input.scheduledFor <= Date.now()) {
        return adminError(400, "bad_request", "scheduledFor must be a future time (epoch milliseconds).");
      }
      const campaign = createCampaign({
        ...input,
        ctaUrl: input.ctaUrl || null,
        ctaLabel: input.ctaLabel || null,
        createdBy: actor.id,
      });
      logAudit({
        actorId: actor.id,
        action: "notification_campaign.created",
        target: campaign.id,
        details: { name: input.name, audience: input.audienceFilter.type, channels: input.channels, sendImmediately: !!input.sendImmediately },
      });

      if (input.sendImmediately) {
        const dispatchResult = await dispatchCampaign(campaign.id, { actorId: actor.id });
        return Response.json({ ok: true, campaign, dispatchResult });
      }
      return Response.json({ ok: true, campaign });
    }

    if (input.action === "dispatch") {
      const campaign = getCampaignById(input.campaignId);
      if (!campaign) return adminError(404, "not_found", "Campaign not found.");
      const filter = JSON.parse(campaign.audience_filter || "{}");
      if ((!filter.type || filter.type === "all") && !isSuperAdmin(actor)) {
        return adminError(403, "forbidden", ALL_AUDIENCE_DENIED);
      }
      const result = await dispatchCampaign(input.campaignId, { actorId: actor.id });
      return Response.json({ ok: true, result });
    }

    if (input.action === "direct_send") {
      if (!input.userId && !input.email) {
        return adminError(400, "bad_request", "A target user account or email is required.");
      }
      const result = await sendDirectNotification({
        target: { userId: input.userId || undefined, email: input.email || undefined },
        title: input.title,
        message: input.message,
        ctaLabel: input.ctaLabel || null,
        ctaUrl: input.ctaUrl || null,
        channels: input.channels,
        priority: input.priority,
        senderId: actor.id,
      });
      return Response.json({ ok: true, result });
    }

    if (input.action === "test_send") {
      const campaign = getCampaignById(input.campaignId);
      if (!campaign) return adminError(404, "not_found", "Campaign not found.");
      // a custom test address gets the email only; the admin's own account is used otherwise
      const result = await dispatchCampaign(input.campaignId, {
        isTest: true,
        testEmail: input.testEmail || actor.email || "test@viplay.in",
        testUserId: input.testEmail ? undefined : input.testUserId || actor.id,
      });
      logAudit({ actorId: actor.id, action: "notification_campaign.test_sent", target: input.campaignId, details: { to: input.testEmail || actor.email } });
      return Response.json({ ok: true, result });
    }

    if (input.action === "retry_failed") {
      const retriedCount = await retryFailedCampaignRecipients(input.campaignId);
      logAudit({ actorId: actor.id, action: "notification_campaign.retried", target: input.campaignId, details: { retriedCount } });
      return Response.json({ ok: true, retriedCount });
    }

    if (input.action === "update_rule") {
      const updated = updateNotificationRule({
        id: input.id,
        isEnabled: input.isEnabled,
        channels: input.channels,
        templateTitle: input.templateTitle,
        templateBody: input.templateBody,
      });
      if (!updated) return adminError(404, "not_found", "Rule not found.");
      logAudit({ actorId: actor.id, action: "notification_rule.updated", target: input.id, details: { isEnabled: input.isEnabled, channels: input.channels } });
      return Response.json({ ok: true });
    }

    const result = await checkAndTriggerLifecycleNotifications();
    logAudit({ actorId: actor.id, action: "notification_lifecycle.triggered", target: "lifecycle", details: result });
    return Response.json({ ok: true, result });
  } catch (err: any) {
    const msg = err?.message || "Failed to process request.";
    const conflict = /^Campaign is already/.test(msg);
    return adminError(conflict ? 409 : 500, conflict ? "conflict" : "internal_error", msg);
  }
}
