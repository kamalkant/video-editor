import { afterEach, describe, expect, it, vi } from "vitest";

// the session the login sets (no browser here): kept to sign the next requests in as that user
const jar = vi.hoisted(() => ({ token: null as string | null }));
vi.mock("@/lib/auth/session", async (orig) => {
  const real = await orig<typeof import("@/lib/auth/session")>();
  const { getSessionWithUser } = await import("@/lib/db/sessions");
  return {
    ...real,
    setSessionCookie: async (t: string) => void (jar.token = t),
    getCurrentUser: async () => (jar.token ? (getSessionWithUser(jar.token)?.user ?? null) : null),
  };
});

import { POST as login } from "@/app/api/auth/login/route";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { getDb } from "@/lib/db";
import { seedDefaultData } from "@/lib/db/seed";
import { createSession, getSessionWithUser } from "@/lib/db/sessions";
import { createUser, getUserByEmail } from "@/lib/db/users";

const signIn = (email: string, password: string) =>
  login(new Request("http://x/api/auth/login", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.1` }, body: JSON.stringify({ email, password }) }));

// viplay.in: the database was re-made at every deploy (it lived in the deploy folder), so the super admin's
// sign-in stopped working. The database now persists; the admin named in the env is provisioned or, with
// INITIAL_ADMIN_RESET=1, given the env password again; existing users stay as they are.
describe("super admin recovery from the env (end to end: seed → login → admin access)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    jar.token = null;
  });

  it("an existing account (e.g. signed up as a user) becomes the super admin and can use the admin area", async () => {
    const email = `owner-${Date.now()}@viplay.in`;
    createUser({ email, name: "Owner", password: "Old-Pass-123!" } as never);
    const other = createUser({ email: `someone-${Date.now()}@example.com`, name: "Someone", password: "Their-Pass-1!" } as never);
    const oldSession = createSession(getUserByEmail(email)!.id);

    vi.stubEnv("INITIAL_ADMIN_EMAIL", email);
    vi.stubEnv("INITIAL_ADMIN_PASSWORD", "New-Strong-Pass-2026!");
    // without the reset flag, nothing changes for an existing account
    seedDefaultData(getDb());
    expect(getUserByEmail(email)?.role).toBe("user");

    vi.stubEnv("INITIAL_ADMIN_RESET", "1");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    seedDefaultData(getDb());
    // the log names the account, never the password
    expect(warn.mock.calls.flat().join(" ")).not.toContain("New-Strong-Pass-2026!");
    expect(getUserByEmail(email)?.role).toBe("super_admin");
    expect(getSessionWithUser(oldSession.token)).toBeNull(); // old sign-ins end

    expect((await signIn(email, "Old-Pass-123!")).status).toBe(401);
    const res = await signIn(email, "New-Strong-Pass-2026!");
    expect(res.status).toBe(200);
    const g = await requireSuperAdmin();
    expect("user" in g && g.user.email).toBe(email);

    // everyone else is untouched
    expect(getUserByEmail(other.email)?.role).toBe("user");
  });

  it("no password in the logs when the env doesn't name one (production)", async () => {
    const { DatabaseSync } = await import("node:sqlite");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const db = new DatabaseSync(":memory:");
    db.exec(SCHEMA_SQL);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INITIAL_ADMIN_PASSWORD", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    seedDefaultData(db);
    expect(warn.mock.calls.flat().join(" ")).toMatch(/without a known password/);
    expect(warn.mock.calls.flat().join(" ")).not.toMatch(/password: \S+/);
  });
});
