import { describe, expect, it, vi } from "vitest";
import type { SafeUser } from "@/lib/db/schema";

const auth = vi.hoisted(() => ({ user: null as SafeUser | null }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => auth.user }));

import { idParams, jsonRequest, makeCapturedPayment, makeUser } from "../admin-helpers";
import { GET } from "@/app/api/admin/users/[id]/route";
import { GET as auditGET } from "@/app/api/admin/audit/route";
import { logAudit } from "@/lib/db/audit";
import { deductAICredits, grantAICredits } from "@/lib/db/ai-credits";
import { registerOrUpdateDevice } from "@/lib/db/devices";

describe("admin user 360", () => {
  it("only admins can open it", async () => {
    const target = makeUser();
    auth.user = null;
    expect((await GET(jsonRequest(`/api/admin/users/${target.id}`), idParams(target.id))).status).toBe(401);
    auth.user = makeUser("user");
    expect((await GET(jsonRequest(`/api/admin/users/${target.id}`), idParams(target.id))).status).toBe(403);
  });

  it("unknown user: 404", async () => {
    auth.user = makeUser("admin");
    expect((await GET(jsonRequest("/api/admin/users/nope"), idParams("nope"))).status).toBe(404);
  });

  it("brings payments, credits, devices and the audit trail together; never device session tokens", async () => {
    const admin = makeUser("admin");
    auth.user = admin;
    const u = makeUser();
    makeCapturedPayment(u.id, 99900);
    grantAICredits(u.id, 50, "test grant");
    deductAICredits(u.id, 5, "AI: image");
    registerOrUpdateDevice({ userId: u.id, sessionToken: "secret-session-token-xyz", userAgent: "Mozilla/5.0 (Macintosh) Chrome/120", ipAddress: "1.2.3.4" });
    logAudit({ actorId: admin.id, action: "admin.update_status", target: u.id });
    logAudit({ actorId: u.id, action: "user.login" });
    logAudit({ actorId: admin.id, action: "admin.other", target: "someone-else" });

    const res = await GET(jsonRequest(`/api/admin/users/${u.id}`), idParams(u.id));
    expect(res.status).toBe(200);
    const text = await res.clone().text();
    expect(text).not.toContain("secret-session-token-xyz");
    const { overview } = await res.json();
    expect(overview.user.id).toBe(u.id);
    expect(overview.user.password_hash).toBeUndefined();
    expect(overview.payments).toHaveLength(1);
    expect(overview.payments[0].amount).toBe(99900);
    expect(overview.credits.recent.map((t: { reason: string }) => t.reason)).toContain("AI: image");
    expect(overview.devices.list).toHaveLength(1);
    expect(overview.subscription).toBeNull();
    const actions = overview.audit.map((a: { action: string }) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["admin.update_status", "user.login"]));
    expect(actions).not.toContain("admin.other");
  });

  it("the audit log can be narrowed to one user (?user=)", async () => {
    const admin = makeUser("admin");
    auth.user = admin;
    const u = makeUser();
    logAudit({ actorId: admin.id, action: "admin.reset_password", target: u.id });
    logAudit({ actorId: u.id, action: "user.logout" });
    const res = await auditGET(jsonRequest(`/api/admin/audit?user=${u.id}`));
    const data = await res.json();
    expect(data.logs.map((l: { action: string }) => l.action).sort()).toEqual(["admin.reset_password", "user.logout"]);
  });
});
