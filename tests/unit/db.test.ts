import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { SCHEMA_SQL } from "@/lib/db/schema";
import { seedDefaultData } from "@/lib/db/seed";
import { getDb } from "@/lib/db/index";
import {
  createUser,
  getUserByEmail,
  getSafeUserById,
  getUserStats,
  listUsers,
  updateUserPassword,
  updateUserRole,
  updateUserStatus,
} from "@/lib/db/users";
import {
  createSession,
  deleteSession,
  deleteUserSessions,
  getSessionWithUser,
} from "@/lib/db/sessions";
import {
  getAllFeatureFlags,
  getComputedFeaturesForRole,
  getComputedFeaturesForUser,
  getFeatureFlag,
  getUserFeatureOverrides,
  isToolEnabledForRole,
  isToolEnabledForUser,
  setUserFeatureOverride,
  updateFeatureFlag,
} from "@/lib/db/features";
import { listAuditLogs, logAudit } from "@/lib/db/audit";
import { hashPassword, verifyPassword } from "@/lib/auth/passwords";
import { isAdmin, isSuperAdmin } from "@/lib/auth/permissions";

describe("Database & RBAC Layer", () => {
  it("initializes SQLite database with default seeded super admin and features", () => {
    const db = getDb();
    expect(db).toBeDefined();

    // Verify default super admin exists
    const admin = getUserByEmail("admin@VDO.local");
    expect(admin).not.toBeNull();
    expect(admin?.role).toBe("super_admin");
    expect(admin?.status).toBe("active");

    // Verify password matches default
    const isPwCorrect = verifyPassword(
      "Admin@12345",
      admin!.password_hash,
      admin!.password_salt,
    );
    expect(isPwCorrect).toBe(true);

    // Verify feature flags exist
    const features = getAllFeatureFlags();
    expect(features.length).toBeGreaterThanOrEqual(10);
    expect(features.some((f) => f.tool_id === "library")).toBe(true);
    expect(features.some((f) => f.tool_id === "ai")).toBe(true);
  });

  it("creates, retrieves, and updates users", () => {
    const testEmail = `test_${Date.now()}@example.com`;
    const user = createUser({
      email: testEmail,
      name: "Test Editor",
      password: "SecretPassword123",
      role: "user",
    });

    expect(user.id).toBeTruthy();
    expect(user.email).toBe(testEmail);
    expect(user.role).toBe("user");
    expect(user.status).toBe("active");

    // Retrieve
    const fetched = getUserByEmail(testEmail);
    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe("Test Editor");

    // Update Role
    const updatedRole = updateUserRole(user.id, "admin");
    expect(updatedRole?.role).toBe("admin");

    // Update Status
    const updatedStatus = updateUserStatus(user.id, "suspended");
    expect(updatedStatus?.status).toBe("suspended");

    // Update Password
    const pwUpdated = updateUserPassword(user.id, "NewPassword456");
    expect(pwUpdated).toBe(true);
    const reFetched = getUserByEmail(testEmail);
    expect(
      verifyPassword(
        "NewPassword456",
        reFetched!.password_hash,
        reFetched!.password_salt,
      ),
    ).toBe(true);
  });

  it("handles sessions and token authentication", () => {
    const testEmail = `session_test_${Date.now()}@example.com`;
    const user = createUser({
      email: testEmail,
      name: "Session User",
      password: "Password123",
      role: "user",
    });

    // Create session
    const session = createSession(user.id);
    expect(session.token).toBeTruthy();
    expect(session.expires_at).toBeGreaterThan(Date.now());

    // Validate active session
    const valid = getSessionWithUser(session.token);
    expect(valid).not.toBeNull();
    expect(valid?.user.id).toBe(user.id);
    expect(valid?.user.email).toBe(testEmail);

    // Invalidate session
    const deleted = deleteSession(session.token);
    expect(deleted).toBe(true);
    expect(getSessionWithUser(session.token)).toBeNull();
  });

  it("enforces tool customization and role permissions", () => {
    // Check initial state
    const aiFlag = getFeatureFlag("ai");
    expect(aiFlag).not.toBeNull();
    expect(aiFlag?.enabled_global).toBe(true);

    // Super admin can access
    expect(isToolEnabledForRole("ai", "super_admin")).toBe(true);

    // Update feature flag: restrict to admin only
    updateFeatureFlag("ai", {
      allowed_roles: ["super_admin", "admin"],
      updated_by: "test",
    });

    expect(isToolEnabledForRole("ai", "user")).toBe(false);
    expect(isToolEnabledForRole("ai", "admin")).toBe(true);
    expect(isToolEnabledForRole("ai", "super_admin")).toBe(true);

    // Globally disable a tool
    updateFeatureFlag("templates", {
      enabled_global: false,
      updated_by: "test",
    });

    expect(isToolEnabledForRole("templates", "user")).toBe(false);
    expect(isToolEnabledForRole("templates", "admin")).toBe(false);
    // Super admin can still preview
    expect(isToolEnabledForRole("templates", "super_admin")).toBe(true);

    // Reset back
    updateFeatureFlag("ai", {
      allowed_roles: ["super_admin", "admin", "user"],
      enabled_global: true,
    });
    updateFeatureFlag("templates", {
      enabled_global: true,
      allowed_roles: ["super_admin", "admin", "user"],
    });
  });

  it("computes role feature flags dictionary accurately", () => {
    const userFeatures = getComputedFeaturesForRole("user");
    expect(typeof userFeatures.library).toBe("boolean");
    expect(typeof userFeatures.elements).toBe("boolean");
    expect(userFeatures.library).toBe(true);
  });

  it("records and lists audit logs", () => {
    logAudit({
      actorId: null,
      action: "unit_test.event",
      target: "test_target",
      details: { foo: "bar" },
    });

    const { logs, total } = listAuditLogs(5, 0);
    expect(total).toBeGreaterThan(0);
    expect(logs.some((l) => l.action === "unit_test.event")).toBe(true);
  });

  it("supports per-user feature overrides independently of role defaults", () => {
    const userA = createUser({
      email: `user_a_${Date.now()}@example.com`,
      name: "User Alpha",
      password: "Password123",
      role: "user",
    });

    const userB = createUser({
      email: `user_b_${Date.now()}@example.com`,
      name: "User Beta",
      password: "Password123",
      role: "user",
    });

    // Baseline: by default both have role defaults (library=true)
    expect(isToolEnabledForUser("library", userA)).toBe(true);
    expect(isToolEnabledForUser("library", userB)).toBe(true);

    // Override User A: revoke library
    setUserFeatureOverride(userA.id, "library", false, "admin");
    // Override User B: grant explicitly
    setUserFeatureOverride(userB.id, "library", true, "admin");

    // Check specific user access
    expect(isToolEnabledForUser("library", userA)).toBe(false);
    expect(isToolEnabledForUser("library", userB)).toBe(true);

    // Verify computed feature dictionary
    const computedA = getComputedFeaturesForUser(userA);
    const computedB = getComputedFeaturesForUser(userB);
    expect(computedA.library).toBe(false);
    expect(computedB.library).toBe(true);

    // Verify overrides map
    const overridesA = getUserFeatureOverrides(userA.id);
    expect(overridesA.library).toBe(false);

    // Reset override for User A back to role default (null)
    setUserFeatureOverride(userA.id, "library", null, "admin");
    expect(isToolEnabledForUser("library", userA)).toBe(true);
    const resetOverridesA = getUserFeatureOverrides(userA.id);
    expect(resetOverridesA.library).toBeUndefined();
  });

  it("paginates users with limit and offset", () => {
    const baseTotal = listUsers().total;
    const page1 = listUsers({ limit: 2, offset: 0 });
    expect(page1.total).toBe(baseTotal);
    expect(page1.users.length).toBeLessThanOrEqual(2);

    if (baseTotal > 2) {
      const page2 = listUsers({ limit: 2, offset: 2 });
      expect(page2.total).toBe(baseTotal);
      expect(page2.users.length).toBeGreaterThan(0);
      expect(page2.users[0].id).not.toBe(page1.users[0].id);
    }
  });

  it("boots a brand-new database: schema plus first-run seed (super admin, plans, settings)", () => {
    // the seed's INSERT once used unquoted 'super_admin'/'active', which crashed every fresh install
    const fresh = new DatabaseSync(":memory:");
    fresh.exec("PRAGMA foreign_keys = ON;");
    fresh.exec(SCHEMA_SQL);
    expect(() => seedDefaultData(fresh)).not.toThrow();
    const admin = fresh.prepare("SELECT role, status FROM users WHERE role = 'super_admin'").get() as { role: string; status: string };
    expect(admin).toEqual({ role: "super_admin", status: "active" });
    const plans = fresh.prepare("SELECT COUNT(*) as n FROM plans").get() as { n: number };
    expect(plans.n).toBeGreaterThan(0);
    // running it again (every boot does) must be harmless
    expect(() => seedDefaultData(fresh)).not.toThrow();
    const admins = fresh.prepare("SELECT COUNT(*) as n FROM users WHERE role = 'super_admin'").get() as { n: number };
    expect(admins.n).toBe(1);
  });
});
