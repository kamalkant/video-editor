import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/stock/search/route";

// Curated broadcast loops are isolated and excluded from general STOCK VIDEOS search
describe("/api/stock/search", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("does not return curated loops in general provider=all search when stock keys are empty", async () => {
    vi.stubEnv("PEXELS_API_KEY", "");
    vi.stubEnv("PIXABAY_API_KEY", "");
    vi.stubEnv("IMPORT_FAKE", "");
    const body = await (await GET(new Request("http://x/api/stock/search?q=&provider=all&aspectRatio=16:9"))).json();
    expect(body.needsKey).toBe(true);
    expect(body.items.some((i: { provider: string }) => i.provider === "curated")).toBe(false);
  });

  it("returns curated broadcast loops only when explicitly requested with provider=curated", async () => {
    const body = await (await GET(new Request("http://x/api/stock/search?q=&provider=curated&aspectRatio=16:9"))).json();
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((i: { provider: string }) => i.provider === "curated")).toBe(true);
  });
});
