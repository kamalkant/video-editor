import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyPassword } from "@/lib/auth/passwords";
import { SCHEMA_SQL } from "@/lib/db/schema";
import { seedDefaultData } from "@/lib/db/seed";

// The database now outlives deploys, so a super admin is no longer re-created at each one:
// the env names one (created if missing), and INITIAL_ADMIN_RESET=1 recovers a lost password
const fresh = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA_SQL);
  return db;
};
const userOf = (db: DatabaseSync, email: string) =>
  db.prepare("SELECT id, role, status, password_hash, password_salt, must_change_password FROM users WHERE email = ?").get(email) as
    | { id: string; role: string; status: string; password_hash: string; password_salt: string; must_change_password: number }
    | undefined;

describe("super admin from INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is created on a database that already has another super admin", () => {
    const db = fresh();
    seedDefaultData(db); // first boot: the default admin
    vi.stubEnv("INITIAL_ADMIN_EMAIL", "Owner@ViPlay.in");
    vi.stubEnv("INITIAL_ADMIN_PASSWORD", "Owner-Pass-2026!");
    seedDefaultData(db);
    const u = userOf(db, "owner@viplay.in")!;
    expect(u).toMatchObject({ role: "super_admin", status: "active", must_change_password: 0 });
    expect(verifyPassword("Owner-Pass-2026!", u.password_hash, u.password_salt)).toBe(true);
  });

  it("an existing account keeps its password unless INITIAL_ADMIN_RESET=1, which sets it (and the role) again", () => {
    const db = fresh();
    vi.stubEnv("INITIAL_ADMIN_EMAIL", "owner@viplay.in");
    vi.stubEnv("INITIAL_ADMIN_PASSWORD", "First-Pass-2026!");
    seedDefaultData(db);
    const id = userOf(db, "owner@viplay.in")!.id;
    db.prepare("UPDATE users SET role = 'user', status = 'suspended' WHERE id = ?").run(id);

    vi.stubEnv("INITIAL_ADMIN_PASSWORD", "Second-Pass-2026!");
    seedDefaultData(db);
    let u = userOf(db, "owner@viplay.in")!;
    expect(verifyPassword("First-Pass-2026!", u.password_hash, u.password_salt)).toBe(true);
    expect(u.role).toBe("user");

    vi.stubEnv("INITIAL_ADMIN_RESET", "1");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    seedDefaultData(db);
    u = userOf(db, "owner@viplay.in")!;
    expect(verifyPassword("Second-Pass-2026!", u.password_hash, u.password_salt)).toBe(true);
    expect(u).toMatchObject({ role: "super_admin", status: "active" });
    const actions = (db.prepare("SELECT action FROM audit_logs WHERE actor_id = ?").all(id) as { action: string }[]).map((a) => a.action);
    expect(actions).toContain("system.admin_reset_from_env");
  });

  it("build workers' throwaway databases are left alone", () => {
    const db = fresh();
    vi.stubEnv("INITIAL_ADMIN_EMAIL", "someone@viplay.in");
    vi.stubEnv("INITIAL_ADMIN_PASSWORD", "Pass-2026!");
    seedDefaultData(db, { throwaway: true });
    // (the first-admin block still makes one admin: the env email, as before)
    expect((db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n).toBe(1);
  });
});
