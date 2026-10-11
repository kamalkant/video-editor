import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SafeUser } from "@/lib/db/schema";

const auth = vi.hoisted(() => ({ user: null as SafeUser | null }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => auth.user }));

import { errorMessage, idParams, jsonRequest, makeCapturedPayment, makeUser } from "../admin-helpers";
import { getDb } from "@/lib/db";
import { countOtherActiveSuperAdmins, getUserByEmail, getUserById, listUsers } from "@/lib/db/users";
import { createSession, getSessionWithUser } from "@/lib/db/sessions";
import { createCoupon, recordCouponRedemption } from "@/lib/db/coupons";
import { getPaymentById } from "@/lib/db/payments";
import { getRevenueByCurrency } from "@/lib/db/admin-stats";

let PATCH: typeof import("@/app/api/admin/users/[id]/route").PATCH;
let DELETE: typeof import("@/app/api/admin/users/[id]/route").DELETE;
let CREATE: typeof import("@/app/api/admin/users/route").POST;
let LIST: typeof import("@/app/api/admin/users/route").GET;

beforeAll(async () => {
  const one = await import("@/app/api/admin/users/[id]/route");
  PATCH = one.PATCH;
  DELETE = one.DELETE;
  const many = await import("@/app/api/admin/users/route");
  CREATE = many.POST;
  LIST = many.GET;
});

const patch = (actor: SafeUser, target: SafeUser, body: unknown) => {
  auth.user = actor;
  return PATCH(jsonRequest(`/api/admin/users/${target.id}`, "PATCH", body), idParams(target.id));
};
const remove = (actor: SafeUser, target: SafeUser) => {
  auth.user = actor;
  return DELETE(jsonRequest(`/api/admin/users/${target.id}`, "DELETE"), idParams(target.id));
};

describe("role hierarchy", () => {
  it("a plain admin manages regular users but not other admins", async () => {
    const admin = makeUser("admin");
    const peer = makeUser("admin");
    const user = makeUser("user");

    expect((await patch(admin, user, { status: "suspended" })).status).toBe(200);
    expect(getUserById(user.id)!.status).toBe("suspended");

    // resetting a peer admin's password would be an account takeover
    const takeover = await patch(admin, peer, { password: "NewPass#2024" });
    expect(takeover.status).toBe(403);
    expect((await patch(admin, peer, { status: "suspended" })).status).toBe(403);
    expect(getUserById(peer.id)!.status).toBe("active");
  });

  it("a plain admin cannot grant staff roles or create staff accounts", async () => {
    const admin = makeUser("admin");
    const user = makeUser("user");
    expect((await patch(admin, user, { role: "admin" })).status).toBe(403);
    expect(getUserById(user.id)!.role).toBe("user");

    auth.user = admin;
    const res = await CREATE(
      jsonRequest("/api/admin/users", "POST", { email: `staff-${Date.now()}@test.local`, name: "Staff", password: "Secret#123", role: "admin" })
    );
    expect(res.status).toBe(403);
  });

  it("a super admin can promote and demote, but not their own role", async () => {
    const root = makeUser("super_admin");
    const user = makeUser("user");
    expect((await patch(root, user, { role: "admin" })).status).toBe(200);
    expect(getUserById(user.id)!.role).toBe("admin");
    expect((await patch(root, root, { role: "user" })).status).toBe(400);
    expect(getUserById(root.id)!.role).toBe("super_admin");
  });

  it("a super admin can never remove their own access (so the last one cannot lock everyone out)", async () => {
    const root = makeUser("super_admin");
    expect((await patch(root, root, { role: "admin" })).status).toBe(400);
    expect((await patch(root, root, { status: "suspended" })).status).toBe(400);
    expect((await remove(root, root)).status).toBe(400);
    expect(getUserById(root.id)!.role).toBe("super_admin");
    expect(getUserById(root.id)!.status).toBe("active");
  });

  it("counts the other active super admins used by the last-super-admin guard", () => {
    const a = makeUser("super_admin");
    const before = countOtherActiveSuperAdmins(a.id);
    const b = makeUser("super_admin");
    expect(countOtherActiveSuperAdmins(a.id)).toBe(before + 1);
    getDb().prepare("UPDATE users SET status = 'suspended' WHERE id = ?").run(b.id);
    expect(countOtherActiveSuperAdmins(a.id)).toBe(before);
  });
});

describe("input validation", () => {
  it("rejects unknown roles and statuses instead of storing them", async () => {
    const root = makeUser("super_admin");
    const user = makeUser("user");
    expect((await patch(root, user, { role: "god" })).status).toBe(400);
    expect((await patch(root, user, { status: "banned" })).status).toBe(400);
    expect(getUserById(user.id)!.role).toBe("user");
    expect(getUserById(user.id)!.status).toBe("active");
  });

  it("rejects a short password instead of silently ignoring it", async () => {
    const root = makeUser("super_admin");
    const user = makeUser("user");
    const res = await patch(root, user, { password: "abc" });
    expect(res.status).toBe(400);
    expect(await errorMessage(res)).toMatch(/at least 8/);
  });

  it("applies nothing when any part of the request is refused", async () => {
    const root = makeUser("super_admin");
    // role change is valid, but suspending yourself is not: the role must not change either
    const other = makeUser("user");
    const res = await patch(root, root, { role: "admin", status: "suspended" });
    expect(res.status).toBe(400);
    expect(getUserById(root.id)!.role).toBe("super_admin");
    expect((await patch(root, other, { role: "admin", status: "deleted" })).status).toBe(400);
    expect(getUserById(other.id)!.role).toBe("user");
  });

  it("clamps list paging instead of returning everything or erroring on NaN", async () => {
    auth.user = makeUser("admin");
    const res = await LIST(jsonRequest("/api/admin/users?limit=abc&offset=-5"));
    expect(res.status).toBe(200);
    const big = await (await LIST(jsonRequest("/api/admin/users?limit=100000"))).json();
    expect(big.users.length).toBeLessThanOrEqual(100);
  });
});

describe("soft delete", () => {
  it("keeps payments and revenue, scrubs personal data, frees the email and kills sessions", async () => {
    const root = makeUser("super_admin");
    const user = makeUser("user");
    const email = user.email!;
    const payment = makeCapturedPayment(user.id, 49_900);
    const session = createSession(user.id);
    const revenueBefore = getRevenueByCurrency().find((r) => r.currency === "INR")!.net;

    const res = await remove(root, user);
    expect(res.status).toBe(200);

    const row = getUserById(user.id)!;
    expect(row.status).toBe("deleted");
    expect(row.email).not.toBe(email);
    expect(row.name).toBe("Deleted user");
    expect(getUserByEmail(email)).toBeNull(); // the address can sign up again
    expect(getSessionWithUser(session.token)).toBeNull();
    expect(getPaymentById(payment.id)).not.toBeNull();
    expect(getRevenueByCurrency().find((r) => r.currency === "INR")!.net).toBe(revenueBefore);
    expect(listUsers({ search: user.id }).users.find((u) => u.id === user.id)).toBeUndefined();
    expect(listUsers({ status: "deleted", limit: 100 }).users.some((u) => u.id === user.id)).toBe(true);
  });

  it("works for a user who redeemed a coupon (a hard delete used to fail on the foreign key)", async () => {
    const root = makeUser("super_admin");
    const user = makeUser("user");
    const coupon = createCoupon({ code: "DEL" + Date.now(), discount_type: "percentage", discount_value: 10 });
    recordCouponRedemption({ couponId: coupon.id, userId: user.id, discountAmount: 100 });
    expect((await remove(root, user)).status).toBe(200);
    expect(getUserById(user.id)!.status).toBe("deleted");
  });

  it("only super admins delete, never themselves, and a deleted user cannot be edited", async () => {
    const root = makeUser("super_admin");
    const admin = makeUser("admin");
    const user = makeUser("user");
    expect((await remove(admin, user)).status).toBe(403);
    expect((await remove(root, root)).status).toBe(400);
    expect((await remove(root, user)).status).toBe(200);
    expect((await remove(root, user)).status).toBe(404);
    expect((await patch(root, user, { status: "active" })).status).toBe(404);
  });
});
