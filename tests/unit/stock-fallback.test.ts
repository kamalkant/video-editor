import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/stock/search/route";

// viplay.in has no Pexels / Pixabay key: the library's STOCK VIDEOS section was empty
describe("/api/stock/search without a stock key", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns the built-in broadcast loops and says a key would add more", async () => {
    vi.stubEnv("PEXELS_API_KEY", "");
    vi.stubEnv("PIXABAY_API_KEY", "");
    vi.stubEnv("IMPORT_FAKE", "");
    const body = await (await GET(new Request("http://x/api/stock/search?q=&provider=all&aspectRatio=16:9"))).json();
    expect(body.needsKey).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((i: { provider: string }) => i.provider === "curated")).toBe(true);
  });
});
