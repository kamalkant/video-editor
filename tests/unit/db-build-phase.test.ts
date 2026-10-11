import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// `next build` prerenders in parallel worker processes: on a server with no database yet (a fresh deploy)
// they all raced to seed data/VDO.db and the build failed with "UNIQUE constraint failed: users.email"
describe("database during next build", () => {
  const saved = { phase: process.env.NEXT_PHASE, path: process.env.VDO_DB_PATH };
  afterEach(() => {
    process.env.NEXT_PHASE = saved.phase;
    process.env.VDO_DB_PATH = saved.path;
    if (saved.phase === undefined) delete process.env.NEXT_PHASE;
    vi.resetModules();
  });

  it("each build worker gets its own throwaway database, seeded, and the real one is left alone", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    delete process.env.VDO_DB_PATH;
    vi.resetModules();
    const real = join(process.cwd(), "data", "VDO.db");
    const existedBefore = existsSync(real);

    const { getDb, DB_FILE } = await import("@/lib/db");
    expect(DB_FILE).toBe(":memory:");
    const db = getDb();
    expect(db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin'").get()).toEqual({ n: 1 });
    expect((db.prepare("SELECT COUNT(*) AS n FROM plans").get() as { n: number }).n).toBeGreaterThan(0);
    expect(existsSync(real)).toBe(existedBefore);
  });

  it("an explicit VDO_DB_PATH is still used during a build", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    vi.resetModules();
    const { DB_FILE } = await import("@/lib/db");
    expect(DB_FILE).toBe(saved.path);
  });
});
