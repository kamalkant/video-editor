import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// its own storage (never the real one)
const tmp = mkdtempSync(join(tmpdir(), "VDO-heal-"));
process.env.VDO_STORAGE = join(tmp, "storage");
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("starter sounds", () => {
  it("come back if the storage folder was cleared while the editor runs", async () => {
    const lib = await import("@/lib/library");
    await lib.ensureStarter();
    const dir = join(tmp, "storage", "library-starter");
    expect(existsSync(join(dir, "whoosh.m4a"))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
    // adding one (the Audio panel's "+") makes them again instead of failing
    const c = await lib.copyForImport("starter-whoosh", join(tmp, "copy"));
    expect(c && existsSync(c.path)).toBe(true);
    expect(existsSync(join(dir, "whoosh.m4a"))).toBe(true);
  }, 120_000);
});
