import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SafeUser, User } from "@/lib/db/schema";

const auth = vi.hoisted(() => ({ user: null as SafeUser | null }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => auth.user }));

import { errorMessage, jsonRequest, makeCapturedPayment, makeUser } from "../admin-helpers";
import { getDb } from "@/lib/db";
import { getUserById, softDeleteUsers } from "@/lib/db/users";
import { createSession, getSessionWithUser } from "@/lib/db/sessions";
import { getPaymentById } from "@/lib/db/payments";

let POST: typeof import("@/app/api/admin/users/bulk-delete/route").POST;
beforeAll(async () => {
  POST = (await import("@/app/api/admin/users/bulk-delete/route")).POST;
});

const bulk = (actor: SafeUser, ids: unknown) => {
  auth.user = actor;
  return POST(jsonRequest("/api/admin/users/bulk-delete", "POST", { ids }));
};

describe("bulk delete (Admin › Users)", () => {
  it("a super admin soft-deletes the selected users: data scrubbed, payments kept, sessions gone", async () => {
    const boss = makeUser("super_admin");
    const a = makeUser("user");
    const b = makeUser("admin");
    const pay = makeCapturedPayment(a.id, 49_900);
    const session = createSession(a.id);

    const res = await bulk(boss, [a.id, b.id]);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.deleted.sort()).toEqual([a.id, b.id].sort());
    expect(data.skipped).toEqual([]);
    expect(data.message).toMatch(/2 users deleted/);

    for (const u of [a, b]) {
      const row = getUserById(u.id)!;
      expect(row.status).toBe("deleted");
      expect(row.email).toBe(`deleted+${u.id}@deleted.invalid`);
      expect(row.name).toBe("Deleted user");
    }
    expect(getPaymentById(pay.id)).not.toBeNull();
    expect(getSessionWithUser(session.token)).toBeNull();
  });

  it("only a super admin may bulk-delete", async () => {
    const admin = makeUser("admin");
    const victim = makeUser("user");
    const res = await bulk(admin, [victim.id]);
    expect(res.status).toBe(403);
    expect(getUserById(victim.id)!.status).toBe("active");
  });

  it("skips your own account and users that are already deleted or unknown, and says why", async () => {
    const boss = makeUser("super_admin");
    const ok = makeUser("user");
    const gone = makeUser("user");
    await bulk(boss, [gone.id]);
    const res = await bulk(boss, [boss.id, ok.id, gone.id, "no-such-user"]);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.deleted).toEqual([ok.id]);
    expect(data.skipped.map((s: { id: string; reason: string }) => [s.id, s.reason])).toEqual([
      [boss.id, "self"],
      [gone.id, "not_found"],
      ["no-such-user", "not_found"],
    ]);
    expect(data.message).toMatch(/Skipped 3/);
    expect(getUserById(boss.id)!.status).toBe("active");
  });

  it("refuses an empty selection or more than 100 users at once", async () => {
    const boss = makeUser("super_admin");
    expect((await bulk(boss, [])).status).toBe(400);
    expect(await errorMessage(await bulk(boss, Array.from({ length: 101 }, (_, i) => `id-${i}`)))).toMatch(/at most 100/);
    expect((await bulk(boss, "not-a-list")).status).toBe(400);
  });

  it("writes one audit entry per deleted user and one for the whole action", async () => {
    const boss = makeUser("super_admin");
    const a = makeUser("user");
    await bulk(boss, [a.id]);
    const rows = getDb().prepare("SELECT action, target, details FROM audit_logs WHERE actor_id = ? ORDER BY created_at").all(boss.id) as { action: string; target: string | null; details: string }[];
    expect(rows.find((r) => r.action === "admin.delete_user" && r.target === a.id)?.details).toMatch(/"bulk":true/);
    expect(rows.some((r) => r.action === "admin.bulk_delete_users")).toBe(true);
  });

  it("never deletes the last active super admin, even when every one is selected", () => {
    const db = getDb();
    makeUser("super_admin");
    makeUser("super_admin");
    const before = db.prepare("SELECT * FROM users WHERE role = 'super_admin' AND status = 'active'").all() as User[];
    try {
      // (an actor outside the selection: e.g. a Super Admin whose own account is no longer active)
      const { deleted, skipped } = softDeleteUsers(
        before.map((u) => u.id),
        "outside-actor",
      );
      expect(deleted.length).toBe(before.length - 1);
      expect(skipped).toEqual([expect.objectContaining({ reason: "last_super_admin" })]);
      expect((db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin' AND status = 'active'").get() as { n: number }).n).toBe(1);
    } finally {
      // (the other tests of this run share the database: the super admins come back)
      const put = db.prepare("UPDATE users SET status = ?, email = ?, name = ?, password_hash = ?, password_salt = ?, phone_number = ?, phone_verified = ?, email_verified = ? WHERE id = ?");
      for (const u of before) put.run(u.status, u.email, u.name, u.password_hash, u.password_salt, u.phone_number ?? null, u.phone_verified ?? 0, u.email_verified ?? 0, u.id);
    }
  });
});
