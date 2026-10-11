import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SafeUser } from "@/lib/db/schema";

const auth = vi.hoisted(() => ({ user: null as SafeUser | null }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => auth.user }));

import { idParams, jsonRequest, makeUser } from "../admin-helpers";
import { setAdminSetting } from "@/lib/db/admin-settings";
import { listAuditLogs } from "@/lib/db/audit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- route handlers take differently shaped contexts
type Handler = (req: Request, ctx: any) => Promise<Response>;
type MinRole = "admin" | "super_admin";

/**
 * Every admin endpoint with the lowest role allowed to use it. Each call is built so an
 * allowed caller gets a harmless 2xx/4xx (bad body, unknown id) and never changes real data.
 */
const ROUTES: Array<{ name: string; min: MinRole; load: () => Promise<Handler>; req: () => Request; ctx?: unknown }> = [
  { name: "GET settings", min: "admin", load: async () => (await import("@/app/api/admin/settings/route")).GET as Handler, req: () => jsonRequest("/api/admin/settings") },
  { name: "POST settings", min: "super_admin", load: async () => (await import("@/app/api/admin/settings/route")).POST, req: () => jsonRequest("/api/admin/settings", "POST", {}) },
  { name: "GET referral settings", min: "admin", load: async () => (await import("@/app/api/admin/referrals/settings/route")).GET as Handler, req: () => jsonRequest("/api/admin/referrals/settings") },
  { name: "PATCH referral settings", min: "super_admin", load: async () => (await import("@/app/api/admin/referrals/settings/route")).PATCH, req: () => jsonRequest("/api/admin/referrals/settings", "PATCH", { rewardType: "bogus" }) },
  { name: "GET referrals", min: "admin", load: async () => (await import("@/app/api/admin/referrals/route")).GET, req: () => jsonRequest("/api/admin/referrals") },
  { name: "POST refunds", min: "super_admin", load: async () => (await import("@/app/api/admin/refunds/route")).POST, req: () => jsonRequest("/api/admin/refunds", "POST", {}) },
  { name: "GET payments", min: "admin", load: async () => (await import("@/app/api/admin/payments/route")).GET, req: () => jsonRequest("/api/admin/payments") },
  { name: "GET payouts", min: "admin", load: async () => (await import("@/app/api/admin/payouts/route")).GET, req: () => jsonRequest("/api/admin/payouts") },
  { name: "PATCH payouts", min: "admin", load: async () => (await import("@/app/api/admin/payouts/route")).PATCH, req: () => jsonRequest("/api/admin/payouts", "PATCH", {}) },
  { name: "POST payouts (bulk)", min: "admin", load: async () => (await import("@/app/api/admin/payouts/route")).POST, req: () => jsonRequest("/api/admin/payouts", "POST", {}) },
  { name: "GET plans", min: "admin", load: async () => (await import("@/app/api/admin/plans/route")).GET as Handler, req: () => jsonRequest("/api/admin/plans") },
  { name: "POST plans", min: "super_admin", load: async () => (await import("@/app/api/admin/plans/route")).POST, req: () => jsonRequest("/api/admin/plans", "POST", {}) },
  { name: "PUT plans", min: "super_admin", load: async () => (await import("@/app/api/admin/plans/route")).PUT, req: () => jsonRequest("/api/admin/plans", "PUT", {}) },
  { name: "DELETE plans", min: "super_admin", load: async () => (await import("@/app/api/admin/plans/route")).DELETE, req: () => jsonRequest("/api/admin/plans", "DELETE") },
  { name: "GET coupons", min: "admin", load: async () => (await import("@/app/api/admin/coupons/route")).GET as Handler, req: () => jsonRequest("/api/admin/coupons") },
  { name: "POST coupons", min: "admin", load: async () => (await import("@/app/api/admin/coupons/route")).POST, req: () => jsonRequest("/api/admin/coupons", "POST", {}) },
  { name: "POST coupons bulk", min: "admin", load: async () => (await import("@/app/api/admin/coupons/bulk/route")).POST, req: () => jsonRequest("/api/admin/coupons/bulk", "POST", {}) },
  { name: "GET subscriptions", min: "admin", load: async () => (await import("@/app/api/admin/subscriptions/route")).GET, req: () => jsonRequest("/api/admin/subscriptions") },
  { name: "POST subscriptions", min: "admin", load: async () => (await import("@/app/api/admin/subscriptions/route")).POST, req: () => jsonRequest("/api/admin/subscriptions", "POST", {}) },
  { name: "GET users", min: "admin", load: async () => (await import("@/app/api/admin/users/route")).GET, req: () => jsonRequest("/api/admin/users") },
  { name: "POST users", min: "admin", load: async () => (await import("@/app/api/admin/users/route")).POST, req: () => jsonRequest("/api/admin/users", "POST", {}) },
  { name: "PATCH users/[id]", min: "admin", load: async () => (await import("@/app/api/admin/users/[id]/route")).PATCH, req: () => jsonRequest("/api/admin/users/nope", "PATCH", {}), ctx: idParams("nope") },
  { name: "DELETE users/[id]", min: "super_admin", load: async () => (await import("@/app/api/admin/users/[id]/route")).DELETE, req: () => jsonRequest("/api/admin/users/nope", "DELETE"), ctx: idParams("nope") },
  { name: "GET users/[id]/credits", min: "admin", load: async () => (await import("@/app/api/admin/users/[id]/credits/route")).GET, req: () => jsonRequest("/api/admin/users/nope/credits"), ctx: idParams("nope") },
  { name: "POST users/[id]/credits", min: "admin", load: async () => (await import("@/app/api/admin/users/[id]/credits/route")).POST, req: () => jsonRequest("/api/admin/users/nope/credits", "POST", { amount: 5 }), ctx: idParams("nope") },
  { name: "GET users/[id]/devices", min: "admin", load: async () => (await import("@/app/api/admin/users/[id]/devices/route")).GET, req: () => jsonRequest("/api/admin/users/nope/devices"), ctx: idParams("nope") },
  { name: "POST users/[id]/devices", min: "admin", load: async () => (await import("@/app/api/admin/users/[id]/devices/route")).POST, req: () => jsonRequest("/api/admin/users/nope/devices", "POST", {}), ctx: idParams("nope") },
  { name: "GET users/[id]/features", min: "admin", load: async () => (await import("@/app/api/admin/users/[id]/features/route")).GET, req: () => jsonRequest("/api/admin/users/nope/features"), ctx: idParams("nope") },
  { name: "PATCH users/[id]/features", min: "admin", load: async () => (await import("@/app/api/admin/users/[id]/features/route")).PATCH, req: () => jsonRequest("/api/admin/users/nope/features", "PATCH", {}), ctx: idParams("nope") },
  { name: "GET features", min: "admin", load: async () => (await import("@/app/api/admin/features/route")).GET as Handler, req: () => jsonRequest("/api/admin/features") },
  { name: "PATCH features", min: "admin", load: async () => (await import("@/app/api/admin/features/route")).PATCH, req: () => jsonRequest("/api/admin/features", "PATCH", {}) },
  { name: "GET devices", min: "admin", load: async () => (await import("@/app/api/admin/devices/route")).GET, req: () => jsonRequest("/api/admin/devices") },
  { name: "POST devices", min: "admin", load: async () => (await import("@/app/api/admin/devices/route")).POST, req: () => jsonRequest("/api/admin/devices", "POST", {}) },
  { name: "GET bulk-jobs", min: "admin", load: async () => (await import("@/app/api/admin/bulk-jobs/route")).GET as Handler, req: () => jsonRequest("/api/admin/bulk-jobs") },
  { name: "POST bulk-jobs", min: "admin", load: async () => (await import("@/app/api/admin/bulk-jobs/route")).POST, req: () => jsonRequest("/api/admin/bulk-jobs", "POST", {}) },
  { name: "POST bulk-jobs/[id]/execute", min: "admin", load: async () => (await import("@/app/api/admin/bulk-jobs/[id]/execute/route")).POST, req: () => jsonRequest("/api/admin/bulk-jobs/nope/execute", "POST"), ctx: idParams("nope") },
  { name: "POST bulk-jobs/[id]/retry", min: "admin", load: async () => (await import("@/app/api/admin/bulk-jobs/[id]/retry/route")).POST, req: () => jsonRequest("/api/admin/bulk-jobs/nope/retry", "POST"), ctx: idParams("nope") },
  { name: "GET bulk-jobs export", min: "admin", load: async () => (await import("@/app/api/admin/bulk-jobs/export/route")).GET, req: () => jsonRequest("/api/admin/bulk-jobs/export") },
  { name: "GET campaigns", min: "admin", load: async () => (await import("@/app/api/admin/notifications/campaigns/route")).GET, req: () => jsonRequest("/api/admin/notifications/campaigns") },
  { name: "POST campaigns", min: "admin", load: async () => (await import("@/app/api/admin/notifications/campaigns/route")).POST, req: () => jsonRequest("/api/admin/notifications/campaigns", "POST", {}) },
  { name: "POST broadcast", min: "super_admin", load: async () => (await import("@/app/api/admin/notifications/broadcast/route")).POST, req: () => jsonRequest("/api/admin/notifications/broadcast", "POST", {}) },
  { name: "GET audit", min: "admin", load: async () => (await import("@/app/api/admin/audit/route")).GET, req: () => jsonRequest("/api/admin/audit") },
  { name: "GET email-logs", min: "admin", load: async () => (await import("@/app/api/admin/email-logs/route")).GET as Handler, req: () => jsonRequest("/api/admin/email-logs") },
  { name: "GET stats", min: "admin", load: async () => (await import("@/app/api/admin/stats/route")).GET as Handler, req: () => jsonRequest("/api/admin/stats") },
  { name: "GET dashboard stats", min: "admin", load: async () => (await import("@/app/api/admin/dashboard/stats/route")).GET as Handler, req: () => jsonRequest("/api/admin/dashboard/stats") },
  { name: "GET ai-assignments", min: "admin", load: async () => (await import("@/app/api/admin/ai-assignments/route")).GET as Handler, req: () => jsonRequest("/api/admin/ai-assignments") },
  { name: "POST ai-assignments", min: "super_admin", load: async () => (await import("@/app/api/admin/ai-assignments/route")).POST, req: () => jsonRequest("/api/admin/ai-assignments", "POST", {}) },
  { name: "DELETE ai-assignments", min: "super_admin", load: async () => (await import("@/app/api/admin/ai-assignments/route")).DELETE, req: () => jsonRequest("/api/admin/ai-assignments", "DELETE") },
];

const people = {} as Record<"user" | "admin" | "super_admin", SafeUser>;
beforeAll(() => {
  people.user = makeUser("user");
  people.admin = makeUser("admin");
  people.super_admin = makeUser("super_admin");
});

const rank = { anonymous: 0, user: 1, admin: 2, super_admin: 3 } as const;

describe("admin API permission matrix", () => {
  for (const route of ROUTES) {
    it(`${route.name} requires ${route.min}`, async () => {
      const handler = await route.load();
      for (const who of ["anonymous", "user", "admin", "super_admin"] as const) {
        auth.user = who === "anonymous" ? null : people[who];
        const res = await handler(route.req(), route.ctx ?? {});
        const allowed = rank[who] >= rank[route.min];
        if (allowed) {
          expect([401, 403], `${who} should be allowed on ${route.name} (got ${res.status})`).not.toContain(res.status);
        } else if (who === "anonymous") {
          expect([401, 403], `anonymous on ${route.name}`).toContain(res.status);
        } else {
          expect(res.status, `${who} on ${route.name}`).toBe(403);
        }
      }
    });
  }
});

describe("secrets never leave the server", () => {
  it("settings GET masks credentials and is closed to regular users", async () => {
    setAdminSetting("razorpayx_key_secret", "rzpx_live_SUPERSECRET_9876");
    const { GET } = await import("@/app/api/admin/settings/route");
    auth.user = people.user;
    expect((await GET()).status).toBe(403);
    auth.user = people.admin;
    const body = await (await GET()).json();
    expect(JSON.stringify(body)).not.toContain("SUPERSECRET");
    expect(body.settings.razorpayx_key_secret).toBe("••••9876");
    expect(body.canEdit).toBe(false);
  });

  it("referral settings never return the RazorpayX secret, and a blank secret keeps the saved one", async () => {
    setAdminSetting("razorpayx_key_secret", "rzpx_live_SUPERSECRET_9876");
    const { GET, PATCH } = await import("@/app/api/admin/referrals/settings/route");
    auth.user = people.admin;
    const read = await (await GET()).json();
    expect(JSON.stringify(read)).not.toContain("SUPERSECRET");
    expect(read.config.razorpayxKeySecret).toBe("");
    expect(read.config.razorpayxKeySecretHint).toBe("••••9876");

    // the page posts the whole config back with the blank secret: nothing may be wiped
    auth.user = people.super_admin;
    const saved = await PATCH(jsonRequest("/api/admin/referrals/settings", "PATCH", { ...read.config, razorpayxKeySecretHint: undefined }));
    expect(saved.status).toBe(200);
    const after = await (await GET()).json();
    expect(after.config.razorpayxKeySecretHint).toBe("••••9876");

    // a new secret is saved but never written to the audit log
    await PATCH(jsonRequest("/api/admin/referrals/settings", "PATCH", { razorpayxKeySecret: "rzpx_live_NEWSECRET_1111" }));
    const { logs } = listAuditLogs(20, 0, { action: "admin.referral_config_updated" });
    expect(JSON.stringify(logs)).not.toContain("NEWSECRET");
    expect(JSON.stringify(logs)).not.toContain("SUPERSECRET");
  });

  it("settings POST accepts only known keys with valid values, and logs only what changed", async () => {
    const { POST } = await import("@/app/api/admin/settings/route");
    auth.user = people.super_admin;
    const post = (body: unknown) => POST(jsonRequest("/api/admin/settings", "POST", body));
    expect((await post({ razorpayx_key_secret: "x" })).status).toBe(400); // not settable here
    expect((await post({ default_tax_rate_percent: "-5" })).status).toBe(400);
    expect((await post({ grace_period_days: "45" })).status).toBe(400);
    expect((await post({ expiry_notification_days: "7, three" })).status).toBe(400);
    const ok = await post({ grace_period_days: "7" });
    expect(ok.status).toBe(200);
    expect((await ok.json()).changed).toEqual(["grace_period_days"]);
    await post({ grace_period_days: "5" });
  });
});
