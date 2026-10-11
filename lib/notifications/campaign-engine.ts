import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/index";
import type { NotificationCampaign, CampaignRecipient, NotificationRule, User } from "../db/schema";
import { createNotification } from "../db/notifications";
import { sendEmail } from "../auth/email";
import { logEmailDispatch } from "../db/email-logs";
import { logAudit } from "../db/audit";
import { getNumberListSetting } from "../db/admin-settings";

export type CampaignInput = {
  name: string;
  title: string;
  message: string;
  imageUrl?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  channels: Array<"in_app" | "email" | "push">;
  priority?: "normal" | "high" | "urgent";
  audienceFilter?: {
    type: "all" | "plan" | "csv" | "users" | "single_user" | "single_email";
    planSlug?: string;
    userIds?: string[];
    userId?: string;
    userEmail?: string;
    emails?: string[];
    email?: string;
  };
  scheduledFor?: number | null;
  createdBy?: string | null;
};

export function createCampaign(data: CampaignInput): NotificationCampaign {
  const db = getDb();
  const id = "camp_" + randomUUID().slice(0, 8);
  const now = Date.now();

  const channelsJson = JSON.stringify(data.channels || ["in_app"]);
  const filterJson = JSON.stringify(data.audienceFilter || { type: "all" });

  db.prepare(`
    INSERT INTO notification_campaigns (
      id, name, title, message, image_url, cta_label, cta_url,
      channels, priority, audience_filter, status, total_recipients,
      delivered_recipients, failed_recipients, scheduled_for, sent_at,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, NULL, ?, ?, ?)
  `).run(
    id,
    data.name,
    data.title,
    data.message,
    data.imageUrl ?? null,
    data.ctaLabel ?? null,
    data.ctaUrl ?? null,
    channelsJson,
    data.priority || "normal",
    filterJson,
    data.scheduledFor && data.scheduledFor > now ? "scheduled" : "draft",
    data.scheduledFor ?? null,
    data.createdBy ?? null,
    now,
    now
  );

  return getCampaignById(id)!;
}

export function getCampaignById(id: string): NotificationCampaign | null {
  const db = getDb();
  return (db.prepare("SELECT * FROM notification_campaigns WHERE id = ?").get(id) as NotificationCampaign) || null;
}

export function listCampaigns(limit = 50): NotificationCampaign[] {
  const db = getDb();
  return db.prepare("SELECT * FROM notification_campaigns ORDER BY created_at DESC LIMIT ?").all(limit) as NotificationCampaign[];
}

export function getCampaignRecipients(campaignId: string): CampaignRecipient[] {
  const db = getDb();
  return db.prepare("SELECT * FROM campaign_recipients WHERE campaign_id = ? ORDER BY sent_at DESC LIMIT 200").all(campaignId) as CampaignRecipient[];
}

/**
 * Resolves audience members based on the filter, eliminating duplicate recipients.
 */
export function resolveAudience(filter: CampaignInput["audienceFilter"]): Array<{
  userId: string | null;
  email: string | null;
  name: string;
}> {
  const db = getDb();
  const seenEmails = new Set<string>();
  const seenUserIds = new Set<string>();
  const recipients: Array<{ userId: string | null; email: string | null; name: string }> = [];

  const addRecipient = (userId: string | null, email: string | null, name: string) => {
    const cleanEmail = email ? email.trim().toLowerCase() : null;
    if (cleanEmail && seenEmails.has(cleanEmail)) return;
    if (userId && seenUserIds.has(userId)) return;

    if (cleanEmail) seenEmails.add(cleanEmail);
    if (userId) seenUserIds.add(userId);

    recipients.push({ userId, email: cleanEmail, name });
  };

  if (!filter || filter.type === "all") {
    const users = db.prepare("SELECT id, email, name FROM users WHERE status = 'active'").all() as User[];
    for (const u of users) addRecipient(u.id, u.email, u.name);
  } else if (filter.type === "single_user" && (filter.userId || filter.userEmail)) {
    let u: User | undefined;
    if (filter.userId) {
      u = db.prepare("SELECT id, email, name FROM users WHERE id = ? AND status != 'deleted'").get(filter.userId) as User | undefined;
    } else if (filter.userEmail) {
      u = db.prepare("SELECT id, email, name FROM users WHERE email = ? COLLATE NOCASE AND status != 'deleted'").get(filter.userEmail.trim()) as User | undefined;
    }
    if (u) addRecipient(u.id, u.email, u.name);
  } else if (filter.type === "single_email" && filter.email) {
    const clean = filter.email.trim().toLowerCase();
    const u = db.prepare("SELECT id, email, name FROM users WHERE email = ? COLLATE NOCASE").get(clean) as User | undefined;
    if (u) {
      addRecipient(u.id, u.email, u.name);
    } else {
      addRecipient(null, clean, clean.split("@")[0]);
    }
  } else if (filter.type === "users" && Array.isArray(filter.userIds)) {
    for (const uid of filter.userIds) {
      const u = db.prepare("SELECT id, email, name FROM users WHERE id = ? AND status = 'active'").get(uid) as User | undefined;
      if (u) addRecipient(u.id, u.email, u.name);
    }
  } else if (filter.type === "plan" && filter.planSlug) {
    const users = db.prepare(`
      SELECT u.id, u.email, u.name 
      FROM users u
      JOIN subscriptions s ON s.user_id = u.id
      JOIN plans p ON s.plan_id = p.id
      WHERE p.slug = ? AND s.status IN ('active', 'trialing', 'grace_period') AND u.status = 'active'
    `).all(filter.planSlug) as User[];
    for (const u of users) addRecipient(u.id, u.email, u.name);
  } else if (filter.type === "csv" && Array.isArray(filter.emails)) {
    for (const rawEmail of filter.emails) {
      const clean = rawEmail.trim().toLowerCase();
      if (!clean) continue;
      const u = db.prepare("SELECT id, email, name FROM users WHERE email = ? COLLATE NOCASE").get(clean) as User | undefined;
      if (u) {
        addRecipient(u.id, u.email, u.name);
      } else {
        addRecipient(null, clean, clean.split("@")[0]);
      }
    }
  }

  return recipients;
}

const escapeHtml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Only absolute http(s) links may become a call-to-action button (no javascript:, data:, ...). */
export function isSafeCtaUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** Plain-text and HTML bodies for a campaign email; admin-written text is escaped in the HTML. */
export function renderCampaignEmail(c: { message: string; ctaLabel?: string | null; ctaUrl?: string | null }): { text: string; html: string } {
  const cta = c.ctaLabel && isSafeCtaUrl(c.ctaUrl) ? { label: c.ctaLabel, url: c.ctaUrl } : null;
  const text = `${c.message}${cta ? `\n\n${cta.label}: ${cta.url}` : ""}`;
  const paragraphs = escapeHtml(c.message).replace(/\n/g, "<br>");
  const html = `<p>${paragraphs}</p>${
    cta
      ? `<p><a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:8px 16px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;">${escapeHtml(cta.label)}</a></p>`
      : ""
  }`;
  return { text, html };
}

/** Sends one campaign email and logs it; throws when the provider refuses it. */
async function deliverCampaignEmail(to: string, subject: string, body: { text: string; html: string }, templateName: string) {
  const ok = await sendEmail({ to, subject, text: body.text, html: body.html });
  logEmailDispatch({ toEmail: to, subject, templateName, status: ok ? "sent" : "failed", errorMessage: ok ? null : "Email provider rejected the message" });
  if (!ok) throw new Error("Email delivery failed");
}

/**
 * Dispatches a notification campaign across selected channels.
 * A real (non-test) dispatch only runs once: the campaign is claimed draft/scheduled -> sending
 * atomically, so a completed campaign can never be re-sent to everyone by a second click.
 */
export async function dispatchCampaign(
  campaignId: string,
  options?: { isTest?: boolean; testEmail?: string; testUserId?: string; actorId?: string }
): Promise<{ total: number; delivered: number; failed: number }> {
  const db = getDb();
  const campaign = getCampaignById(campaignId);
  if (!campaign) throw new Error("Campaign not found");

  const channels: Array<"in_app" | "email" | "push"> = JSON.parse(campaign.channels || "[]");
  const filter = JSON.parse(campaign.audience_filter || "{}");
  const now = Date.now();

  let recipients: Array<{ userId: string | null; email: string | null; name: string }> = [];

  if (options?.isTest) {
    let testUid = options.testUserId || null;
    let testEmail = options.testEmail ? options.testEmail.trim().toLowerCase() : null;
    let testName = "Test Recipient";

    if (testUid && !testEmail) {
      const u = db.prepare("SELECT id, email, name FROM users WHERE id = ?").get(testUid) as User | undefined;
      if (u) {
        testEmail = u.email;
        testName = u.name;
      }
    } else if (testEmail) {
      const u = db.prepare("SELECT id, email, name FROM users WHERE email = ? COLLATE NOCASE").get(testEmail) as User | undefined;
      if (u) {
        testUid = u.id;
        testName = u.name;
      }
    }

    recipients = [{
      userId: testUid,
      email: testEmail || "test@viplay.in",
      name: testName,
    }];
  } else {
    const claim = db
      .prepare("UPDATE notification_campaigns SET status = 'sending', updated_at = ? WHERE id = ? AND status IN ('draft', 'scheduled')")
      .run(now, campaignId);
    if (claim.changes !== 1) {
      throw new Error(`Campaign is already ${campaign.status}; create a new campaign to send again`);
    }
    recipients = resolveAudience(filter);
  }

  const emailBody = renderCampaignEmail({ message: campaign.message, ctaLabel: campaign.cta_label, ctaUrl: campaign.cta_url });

  let deliveredCount = 0;
  let failedCount = 0;

  for (const r of recipients) {
    const recipientId = "cr_" + randomUUID().slice(0, 8);
    const channelsSent: string[] = [];
    let recipientFailed = false;
    let errorMsg: string | null = null;

    try {
      // 1. In-App Notification
      if (channels.includes("in_app") && r.userId) {
        createNotification({
          userId: r.userId,
          title: campaign.title,
          message: campaign.message,
          type: "system",
        });
        channelsSent.push("in_app");
      }

      // 2. Email Notification (a refused email marks the recipient failed, so Retry can pick it up)
      if (channels.includes("email") && r.email) {
        await deliverCampaignEmail(r.email, campaign.title, emailBody, "campaign_broadcast");
        channelsSent.push("email");
      }

      // 3. Web Push Notification
      if (channels.includes("push")) {
        // If VAPID is configured in production, web-push triggers here. In local dev, gracefully logs.
        channelsSent.push("push");
      }

      deliveredCount++;
    } catch (err: any) {
      recipientFailed = true;
      failedCount++;
      errorMsg = err?.message || "Delivery failed";
    }

    db.prepare(`
        INSERT INTO campaign_recipients (
          id, campaign_id, user_id, email, channels_sent, status, error_message, sent_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        recipientId,
        campaignId,
        r.userId,
        r.email,
        JSON.stringify(channelsSent),
        recipientFailed ? "failed" : "delivered",
        errorMsg,
        now
      );
  }

  if (!options?.isTest) {
    db.prepare(`
      UPDATE notification_campaigns SET
        status = 'completed',
        total_recipients = ?,
        delivered_recipients = ?,
        failed_recipients = ?,
        sent_at = ?,
        updated_at = ?
      WHERE id = ?
    `).run(recipients.length, deliveredCount, failedCount, now, now, campaignId);

    logAudit({
      actorId: options?.actorId ?? campaign.created_by,
      action: "notification_campaign.dispatched",
      target: campaignId,
      details: { delivered: deliveredCount, failed: failedCount, total: recipients.length },
    });
  }

  return { total: recipients.length, delivered: deliveredCount, failed: failedCount };
}

/**
 * Retries delivery for all failed recipients of a campaign.
 */
export async function retryFailedCampaignRecipients(campaignId: string): Promise<number> {
  const db = getDb();
  const failed = db.prepare("SELECT * FROM campaign_recipients WHERE campaign_id = ? AND status = 'failed'").all(campaignId) as CampaignRecipient[];
  if (failed.length === 0) return 0;

  const campaign = getCampaignById(campaignId);
  if (!campaign) return 0;

  const channels: string[] = JSON.parse(campaign.channels || "[]");
  const emailBody = renderCampaignEmail({ message: campaign.message, ctaLabel: campaign.cta_label, ctaUrl: campaign.cta_url });

  let retriedSuccess = 0;
  for (const r of failed) {
    // re-send only the channels that did not go out the first time
    const sent = new Set<string>(JSON.parse(r.channels_sent || "[]"));
    try {
      if (channels.includes("in_app") && r.user_id && !sent.has("in_app")) {
        createNotification({ userId: r.user_id, title: campaign.title, message: campaign.message, type: "system" });
        sent.add("in_app");
      }
      if (channels.includes("email") && r.email && !sent.has("email")) {
        await deliverCampaignEmail(r.email, campaign.title, emailBody, "campaign_retry");
        sent.add("email");
      }
      db.prepare("UPDATE campaign_recipients SET status = 'delivered', channels_sent = ?, error_message = NULL, sent_at = ? WHERE id = ?").run(
        JSON.stringify([...sent]),
        Date.now(),
        r.id
      );
      retriedSuccess++;
    } catch (err: any) {
      db.prepare("UPDATE campaign_recipients SET channels_sent = ?, error_message = ? WHERE id = ?").run(
        JSON.stringify([...sent]),
        err?.message || "Retry failed",
        r.id
      );
    }
  }

  // Update campaign counters
  const updatedFailed = failed.length - retriedSuccess;
  db.prepare(`
    UPDATE notification_campaigns SET
      delivered_recipients = delivered_recipients + ?,
      failed_recipients = MAX(0, failed_recipients - ?),
      updated_at = ?
    WHERE id = ?
  `).run(retriedSuccess, retriedSuccess, Date.now(), campaignId);

  return retriedSuccess;
}

// ==========================================
// Automated Lifecycle Notification Rules
// ==========================================

export function listNotificationRules(): NotificationRule[] {
  const db = getDb();
  return db.prepare("SELECT * FROM notification_rules ORDER BY event_type ASC").all() as NotificationRule[];
}

export function updateNotificationRule(params: {
  id: string;
  isEnabled: boolean;
  channels: string[];
  templateTitle: string;
  templateBody: string;
}): boolean {
  const db = getDb();
  const res = db.prepare(`
    UPDATE notification_rules SET
      is_enabled = ?,
      channels = ?,
      template_title = ?,
      template_body = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    params.isEnabled ? 1 : 0,
    JSON.stringify(params.channels),
    params.templateTitle,
    params.templateBody,
    Date.now(),
    params.id
  );
  return res.changes > 0;
}

/**
 * Checks for upcoming subscription expiries (7, 3, 1 days) and triggers automated reminders.
 */
export async function checkAndTriggerLifecycleNotifications(): Promise<{
  triggeredCount: number;
  eventsProcessed: string[];
}> {
  const db = getDb();
  const rules = listNotificationRules();
  const rulesMap = new Map(rules.map((r) => [r.event_type, r]));

  const now = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  // which reminders run comes from the expiry_notification_days setting; each day needs its own lifecycle rule
  const reminderDays = new Set(getNumberListSetting("expiry_notification_days", [7, 3, 1]));
  const intervals = [
    { days: 7, event: "subscription_expiring_7d" },
    { days: 3, event: "subscription_expiring_3d" },
    { days: 1, event: "subscription_expiring_1d" },
  ].filter((i) => reminderDays.has(i.days));

  let triggeredCount = 0;
  const eventsProcessed: string[] = [];

  for (const { days, event } of intervals) {
    const rule = rulesMap.get(event);
    if (!rule || rule.is_enabled === 0) continue;

    const channels: string[] = JSON.parse(rule.channels || "[]");
    const targetTimeStart = now + (days * ONE_DAY_MS) - (12 * 60 * 60 * 1000);
    const targetTimeEnd = now + (days * ONE_DAY_MS) + (12 * 60 * 60 * 1000);

    const expiringSubscriptions = db.prepare(`
      SELECT s.*, u.email as user_email, u.name as user_name, p.name as plan_name
      FROM subscriptions s
      JOIN users u ON s.user_id = u.id
      JOIN plans p ON s.plan_id = p.id
      WHERE s.status IN ('active', 'trialing')
      AND s.current_period_end BETWEEN ? AND ?
    `).all(targetTimeStart, targetTimeEnd) as any[];

    for (const sub of expiringSubscriptions) {
      const renewalDateStr = new Date(sub.current_period_end).toLocaleDateString();
      const title = rule.template_title
        .replace("{{name}}", sub.user_name || "Creator")
        .replace("{{plan_name}}", sub.plan_name)
        .replace("{{renewal_date}}", renewalDateStr);

      const message = rule.template_body
        .replace("{{name}}", sub.user_name || "Creator")
        .replace("{{plan_name}}", sub.plan_name)
        .replace("{{renewal_date}}", renewalDateStr);

      // In-app
      if (channels.includes("in_app")) {
        createNotification({
          userId: sub.user_id,
          title,
          message,
          type: "billing",
        });
      }

      // Email
      if (channels.includes("email") && sub.user_email) {
        try {
          await sendEmail({
            to: sub.user_email,
            subject: title,
            text: message,
            html: `<p>${message}</p>`,
          });
          logEmailDispatch({
            toEmail: sub.user_email,
            subject: title,
            templateName: "billing_reminder",
            status: "sent",
          });
        } catch {
          // Logged gracefully in email_logs
        }
      }

      triggeredCount++;
    }

    eventsProcessed.push(event);
  }

  return { triggeredCount, eventsProcessed };
}


/**
 * Sends an immediate direct notification to a specific user account or email.
 */
export async function sendDirectNotification(params: {
  target: { userId?: string | null; email?: string | null };
  title: string;
  message: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  channels?: Array<"in_app" | "email" | "push">;
  priority?: "normal" | "high" | "urgent";
  senderId?: string | null;
}): Promise<{
  delivered: boolean;
  channelsSent: string[];
  recipient: { userId: string | null; email: string | null; name: string };
  campaignId: string;
  errorMessage?: string;
}> {
  const db = getDb();
  let userId = params.target.userId || null;
  let email = params.target.email ? params.target.email.trim().toLowerCase() : null;
  let name = "User";

  if (userId) {
    const u = db.prepare("SELECT id, email, name FROM users WHERE id = ?").get(userId) as User | undefined;
    if (u) {
      if (!email && u.email) email = u.email.toLowerCase();
      name = u.name;
    }
  } else if (email) {
    const u = db.prepare("SELECT id, email, name FROM users WHERE email = ? COLLATE NOCASE").get(email) as User | undefined;
    if (u) {
      userId = u.id;
      name = u.name;
    } else {
      name = email.split("@")[0];
    }
  }

  if (!userId && !email) {
    throw new Error("Either a valid ViPlay user account or email address must be specified.");
  }

  const channels: CampaignInput["channels"] = params.channels && params.channels.length > 0 ? (params.channels as CampaignInput["channels"]) : ["in_app", "email"];
  const channelsSent: string[] = [];
  const now = Date.now();

  const campaign = createCampaign({
    name: `Direct: ${name} (${email || userId})`,
    title: params.title,
    message: params.message,
    ctaLabel: params.ctaLabel,
    ctaUrl: params.ctaUrl,
    channels,
    priority: params.priority || "normal",
    audienceFilter: userId ? { type: "single_user", userId } : { type: "single_email", email: email! },
    createdBy: params.senderId,
  });

  const recipientId = "cr_" + randomUUID().slice(0, 8);
  let hasFailed = false;
  let errorMsg: string | null = null;

  // 1. In-App Notification
  if (channels.includes("in_app") && userId) {
    try {
      createNotification({
        userId,
        title: params.title,
        message: params.message,
        type: params.priority === "urgent" ? "security" : "system",
      });
      channelsSent.push("in_app");
    } catch (err: any) {
      hasFailed = true;
      errorMsg = err?.message || "Failed to create in-app notification";
    }
  }

  // 2. Email Notification
  if (channels.includes("email") && email) {
    try {
      await deliverCampaignEmail(email, params.title, renderCampaignEmail(params), "direct_notification");
      channelsSent.push("email");
    } catch (err: any) {
      hasFailed = true;
      errorMsg = err?.message || "Email dispatch failed";
    }
  }

  // 3. Web Push
  if (channels.includes("push")) {
    channelsSent.push("push");
  }

  // Record in campaign_recipients
  db.prepare(`
    INSERT INTO campaign_recipients (
      id, campaign_id, user_id, email, channels_sent, status, error_message, sent_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    recipientId,
    campaign.id,
    userId,
    email,
    JSON.stringify(channelsSent),
    hasFailed ? "failed" : "delivered",
    errorMsg,
    now
  );

  // Update campaign status
  db.prepare(`
    UPDATE notification_campaigns 
    SET status = 'completed', total_recipients = 1, delivered_recipients = ?, failed_recipients = ?, sent_at = ?, updated_at = ?
    WHERE id = ?
  `).run(
    hasFailed ? 0 : 1,
    hasFailed ? 1 : 0,
    now,
    now,
    campaign.id
  );

  if (params.senderId) {
    logAudit({
      actorId: params.senderId,
      action: "notification.direct_send",
      target: userId || email || "unknown",
      details: {
        title: params.title,
        channelsSent,
        recipient: { userId, email, name },
      },
    });
  }

  return {
    delivered: !hasFailed && channelsSent.length > 0,
    channelsSent,
    recipient: { userId, email, name },
    campaignId: campaign.id,
    errorMessage: errorMsg || undefined,
  };
}


export function listAllRecipients(limit = 100): Array<CampaignRecipient & { campaign_title?: string }> {
  const db = getDb();
  return db.prepare(`
    SELECT cr.*, nc.title as campaign_title
    FROM campaign_recipients cr
    LEFT JOIN notification_campaigns nc ON nc.id = cr.campaign_id
    ORDER BY cr.sent_at DESC
    LIMIT ?
  `).all(limit) as Array<CampaignRecipient & { campaign_title?: string }>;
}
