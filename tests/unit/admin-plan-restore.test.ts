import { describe, expect, it, vi } from "vitest";
import type { SafeUser } from "@/lib/db/schema";

const auth = vi.hoisted(() => ({ user: null as SafeUser | null }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => auth.user }));

import { jsonRequest, makeUser } from "../admin-helpers";
import { DELETE, POST, PUT } from "@/app/api/admin/plans/route";
import { GET as publicPlans } from "@/app/api/plans/route";
import { listAuditLogs } from "@/lib/db/audit";
import { getPlanById } from "@/lib/db/plans";

const onWebsite = async (id: string) => ((await (await publicPlans()).json()).plans as Array<{ id: string }>).some((p) => p.id === id);

async function newPlan() {
  auth.user = makeUser("super_admin");
  const res = await POST(
    jsonRequest("/api/admin/plans", "POST", { name: "Restore Me", slug: `restore-me-${Date.now()}`, interval: "monthly", currency: "INR", price_amount: 49900, features: ["x"] }),
  );
  return (await res.json()).plan as { id: string };
}

describe("archived plans can be restored", () => {
  it("archive hides a plan from the website; restoring (active + public) brings it back, logged as plan.restored", async () => {
    const plan = await newPlan();
    expect(await onWebsite(plan.id)).toBe(true);

    expect((await DELETE(jsonRequest(`/api/admin/plans?id=${plan.id}`, "DELETE"))).status).toBe(200);
    expect(getPlanById(plan.id)!.is_active).toBe(false);
    expect(await onWebsite(plan.id)).toBe(false);

    // ticking "Publicly visible" alone isn't enough: an archived plan stays off the website
    await PUT(jsonRequest("/api/admin/plans", "PUT", { id: plan.id, is_public: true }));
    expect(await onWebsite(plan.id)).toBe(false);

    const res = await PUT(jsonRequest("/api/admin/plans", "PUT", { id: plan.id, is_active: true, is_public: true }));
    expect(res.status).toBe(200);
    expect(getPlanById(plan.id)).toMatchObject({ is_active: true, is_public: true });
    expect(await onWebsite(plan.id)).toBe(true);
    const actions = listAuditLogs(20, 0, { q: plan.id }).logs.map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(["plan.archived", "plan.restored"]));
  });

  it("only super admins can restore", async () => {
    const plan = await newPlan();
    await DELETE(jsonRequest(`/api/admin/plans?id=${plan.id}`, "DELETE"));
    auth.user = makeUser("admin");
    expect((await PUT(jsonRequest("/api/admin/plans", "PUT", { id: plan.id, is_active: true, is_public: true }))).status).toBe(403);
    expect(getPlanById(plan.id)!.is_active).toBe(false);
  });
});
