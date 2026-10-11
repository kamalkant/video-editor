import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newUuid } from "@/lib/storage/uuid";

describe("browser-safe storage helpers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("newUuid makes a v4 UUID even where crypto.randomUUID is missing (a plain-http LAN page)", () => {
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => real.getRandomValues(a) });
    const ids = new Set(Array.from({ length: 50 }, newUuid));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  // the client bundle (AuthContext → these files) can't hold node: modules: the production build uses webpack,
  // which refuses them (Hostinger's build can't run Turbopack's CSS worker)
  it.each(["lib/storage/account.ts", "lib/storage/workspace.ts", "lib/storage/hash.ts", "lib/storage/VDO/importer.ts", "lib/storage/uuid.ts"])(
    "%s imports no node: module",
    (file) => expect(readFileSync(file, "utf8")).not.toMatch(/["']node:/),
  );
});
