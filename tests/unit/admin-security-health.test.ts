import { describe, expect, it, vi } from "vitest";
import type { SafeUser } from "@/lib/db/schema";

const auth = vi.hoisted(() => ({ user: null as SafeUser | null, token: "" }));
vi.mock("@/lib/auth/session", () => ({
  SESSION_COOKIE_NAME: "VDO_session",
  getCurrentUser: async () => auth.user,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "VDO_session" && auth.token ? { value: auth.token } : undefined) }),
}));

import { jsonRequest, makeUser } from "../admin-helpers";
import { POST as changePassword } from "@/app/api/auth/change-password/route";
import { GET as healthGET } from "@/app/api/admin/health/route";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { verifyPassword } from "@/lib/auth/passwords";
import { getDb } from "@/lib/db";
import { SEED_ADMIN_PASSWORD } from "@/lib/db/seed";
import { createSession } from "@/lib/db/sessions";
import { getSafeUserById, getUserById, updateUserPassword } from "@/lib/db/users";
import { adminsOnSeedPassword } from "@/lib/admin/health";

const flag = (id: string) => getDb().prepare("UPDATE users SET must_change_password = 1 WHERE id = ?").run(id);
const sessionsOf = (id: string) => (getDb().prepare("SELECT token FROM sessions WHERE user_id = ?").all(id) as Array<{ token: string }>).map((s) => s.token);

describe("seeded admin password", () => {
  it("the seeded super admin must change the password before anything in admin works", async () => {
    const seeded = getDb().prepare("SELECT id FROM users WHERE email = 'admin@vdo.local'").get() as { id: string };
    expect(getSafeUserById(seeded.id)!.must_change_password).toBe(1);
    auth.user = getSafeUserById(seeded.id);
    const g = await requireAdmin();
    expect(g.denied?.status).toBe(403);
    expect((await g.denied!.json()).error.code).toBe("password_change_required");
    expect(adminsOnSeedPassword().map((a) => a.id)).toContain(seeded.id);
  });

  it("change password: needs the current one, refuses the public one, clears the flag, signs out other devices", async () => {
    const u = makeUser("super_admin", "active", "Secret#123");
    flag(u.id);
    auth.user = getSafeUserById(u.id);
    const keep = createSession(u.id).token;
    const other = createSession(u.id).token;
    auth.token = keep;

    const wrong = await changePassword(jsonRequest("/api/auth/change-password", "POST", { currentPassword: "nope", newPassword: "Brand#New123" }));
    expect(wrong.status).toBe(400);
    const pub = await changePassword(jsonRequest("/api/auth/change-password", "POST", { currentPassword: "Secret#123", newPassword: SEED_ADMIN_PASSWORD }));
    expect((await pub.json()).error.code).toBe("weak_password");
    const short = await changePassword(jsonRequest("/api/auth/change-password", "POST", { currentPassword: "Secret#123", newPassword: "short" }));
    expect(short.status).toBe(400);

    const ok = await changePassword(jsonRequest("/api/auth/change-password", "POST", { currentPassword: "Secret#123", newPassword: "Brand#New123" }));
    expect(ok.status).toBe(200);
    const after = getUserById(u.id)!;
    expect(after.must_change_password).toBe(0);
    expect(verifyPassword("Brand#New123", after.password_hash!, after.password_salt!)).toBe(true);
    expect(sessionsOf(u.id)).toEqual([keep]);
    expect(sessionsOf(u.id)).not.toContain(other);

    auth.user = getSafeUserById(u.id);
    expect((await requireAdmin()).denied).toBeUndefined();
  });

  it("signed out: 401", async () => {
    auth.user = null;
    expect((await changePassword(jsonRequest("/api/auth/change-password", "POST", { newPassword: "Brand#New123" }))).status).toBe(401);
  });

  it("an admin resetting the password also clears the flag", () => {
    const u = makeUser();
    flag(u.id);
    updateUserPassword(u.id, "Another#Pass1");
    expect(getUserById(u.id)!.must_change_password).toBe(0);
  });
});

describe("system health", () => {
  it("admins only; lists every check without secret values", async () => {
    auth.user = makeUser("user");
    expect((await healthGET(jsonRequest("/api/admin/health"))).status).toBe(403);
    auth.user = makeUser("admin");
    const res = await healthGET(jsonRequest("/api/admin/health"));
    expect(res.status).toBe(200);
    const data = await res.json();
    const ids = data.checks.map((c: { id: string }) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["ffmpeg", "database", "storage", "queue", "gemini", "razorpay", "email", "admin-password", "encryption"]));
    for (const c of data.checks) expect(["ok", "warn", "error"]).toContain(c.level);
    const pw = data.checks.find((c: { id: string }) => c.id === "admin-password");
    expect(pw.level).toBe("error"); // the seeded admin in the test database
    const text = JSON.stringify(data);
    if (process.env.GEMINI_API_KEY) expect(text).not.toContain(process.env.GEMINI_API_KEY);
  }, 30_000);
});
