import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SafeUser } from "@/lib/db/schema";

const auth = vi.hoisted(() => ({ user: null as SafeUser | null }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => auth.user }));

// capture outgoing email; `refuse` makes the provider reject messages to those addresses
const mail = vi.hoisted(() => ({ sent: [] as Array<{ to: string; subject: string; html?: string }>, refuse: new Set<string>() }));
vi.mock("@/lib/auth/email", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth/email")>();
  return {
    ...real,
    sendEmail: async (msg: { to: string; subject: string; text: string; html?: string }) => {
      if (mail.refuse.has(msg.to)) return false;
      mail.sent.push({ to: msg.to, subject: msg.subject, html: msg.html });
      return true;
    },
  };
});

import { jsonRequest, makeUser } from "../admin-helpers";
import { getCampaignById, getCampaignRecipients, renderCampaignEmail } from "@/lib/notifications/campaign-engine";

let POST: typeof import("@/app/api/admin/notifications/campaigns/route").POST;
let admin: SafeUser;
let root: SafeUser;

beforeAll(async () => {
  POST = (await import("@/app/api/admin/notifications/campaigns/route")).POST;
  admin = makeUser("admin");
  root = makeUser("super_admin");
});
beforeEach(() => {
  mail.sent = [];
  mail.refuse.clear();
});

const call = async (actor: SafeUser, body: unknown) => {
  auth.user = actor;
  const res = await POST(jsonRequest("/api/admin/notifications/campaigns", "POST", body));
  return { res, data: await res.json() };
};

describe("campaign dispatch", () => {
  it("direct send completes (the final status update used to throw after delivering)", async () => {
    const user = makeUser();
    const { res, data } = await call(admin, {
      action: "direct_send",
      userId: user.id,
      title: "Hello",
      message: "Your export is ready",
      channels: ["in_app", "email"],
    });
    expect(res.status).toBe(200);
    expect(getCampaignById(data.result.campaignId)!.status).toBe("completed");
    expect(mail.sent.map((m) => m.to)).toEqual([user.email]);
  });

  it("a completed campaign cannot be dispatched again", async () => {
    const a = makeUser();
    const b = makeUser();
    const { data: created } = await call(admin, {
      action: "create",
      name: "Two users",
      title: "Release notes",
      message: "New editor features",
      channels: ["email"],
      audienceFilter: { type: "users", userIds: [a.id, b.id] },
    });
    const first = await call(admin, { action: "dispatch", campaignId: created.campaign.id });
    expect(first.res.status).toBe(200);
    expect(mail.sent).toHaveLength(2);

    const second = await call(admin, { action: "dispatch", campaignId: created.campaign.id });
    expect(second.res.status).toBe(409);
    expect(mail.sent).toHaveLength(2);
  });

  it("a refused email is recorded as failed, and Retry really re-sends it", async () => {
    const ok = makeUser();
    const bounced = makeUser();
    mail.refuse.add(bounced.email!);
    const { data: created } = await call(admin, {
      action: "create",
      name: "Retry check",
      title: "Billing update",
      message: "Please update your card",
      channels: ["in_app", "email"],
      audienceFilter: { type: "users", userIds: [ok.id, bounced.id] },
      sendImmediately: true,
    });
    expect(created.dispatchResult).toMatchObject({ total: 2, delivered: 1, failed: 1 });
    const failedRow = getCampaignRecipients(created.campaign.id).find((r) => r.status === "failed")!;
    expect(failedRow.email).toBe(bounced.email);
    // the in-app copy went out the first time; only the email is missing
    expect(JSON.parse(failedRow.channels_sent)).toEqual(["in_app"]);

    mail.refuse.clear();
    mail.sent = [];
    const retry = await call(admin, { action: "retry_failed", campaignId: created.campaign.id });
    expect(retry.data.retriedCount).toBe(1);
    expect(mail.sent.map((m) => m.to)).toEqual([bounced.email]);
    const rows = getCampaignRecipients(created.campaign.id);
    expect(rows.every((r) => r.status === "delivered")).toBe(true);
    expect(getCampaignById(created.campaign.id)!.failed_recipients).toBe(0);
  });

  it("only super admins may send to all users; anyone can preview the count first", async () => {
    const preview = await call(admin, { action: "preview_audience", audienceFilter: { type: "all" } });
    expect(preview.res.status).toBe(200);
    expect(preview.data.count).toBeGreaterThan(0);

    const denied = await call(admin, {
      action: "create",
      name: "Everyone",
      title: "Hi all",
      message: "Hello",
      channels: ["in_app"],
      audienceFilter: { type: "all" },
      sendImmediately: true,
    });
    expect(denied.res.status).toBe(403);

    // a plain admin may save it as a draft, but not dispatch it
    const draft = await call(admin, {
      action: "create",
      name: "Everyone (draft)",
      title: "Hi all",
      message: "Hello",
      channels: ["in_app"],
      audienceFilter: { type: "all" },
    });
    expect(draft.res.status).toBe(200);
    expect((await call(admin, { action: "dispatch", campaignId: draft.data.campaign.id })).res.status).toBe(403);
    expect((await call(root, { action: "dispatch", campaignId: draft.data.campaign.id })).res.status).toBe(200);
  });

  it("rejects bad input instead of storing it", async () => {
    const base = { action: "create", name: "x", title: "t", message: "m", audienceFilter: { type: "users", userIds: [] } };
    expect((await call(admin, { ...base, channels: [] })).res.status).toBe(400);
    expect((await call(admin, { ...base, channels: ["fax"] })).res.status).toBe(400);
    expect((await call(admin, { ...base, channels: ["email"], ctaUrl: "javascript:alert(1)" })).res.status).toBe(400);
    expect((await call(admin, { ...base, channels: ["email"], scheduledFor: 1_700_000_000 })).res.status).toBe(400);
  });
});

describe("campaign email rendering", () => {
  it("includes the call-to-action button (it was always dropped) and escapes admin text", () => {
    const { html, text } = renderCampaignEmail({
      message: 'Hi <b>there</b> & "friends"',
      ctaLabel: "Open <Studio>",
      ctaUrl: "https://vdo.studio/editor?a=1&b=2",
    });
    expect(html).toContain("Hi &lt;b&gt;there&lt;/b&gt; &amp; &quot;friends&quot;");
    expect(html).toContain('href="https://vdo.studio/editor?a=1&amp;b=2"');
    expect(html).toContain("Open &lt;Studio&gt;");
    expect(text).toContain("Open <Studio>: https://vdo.studio/editor?a=1&b=2");
  });

  it("drops a non-http(s) link instead of rendering it", () => {
    const { html } = renderCampaignEmail({ message: "Hi", ctaLabel: "Click", ctaUrl: "javascript:alert(1)" });
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<a ");
  });
});
