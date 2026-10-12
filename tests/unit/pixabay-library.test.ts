import { describe, expect, it } from "vitest";
import { GET as getStockSearch } from "@/app/api/stock/search/route";
import { GET as getStockPhotos } from "@/app/api/stock/photos/route";
import { aiKey } from "@/lib/ai/keys";

describe("Pixabay search & Curated isolation", () => {
  it("provides pixabay API key by default on live/clean deployments", () => {
    // When no env variable is set, aiKey("pixabay") still resolves
    const key = aiKey("pixabay");
    expect(key).toBeTruthy();
    expect(key).toBe("57835309-8e2bffe05b5c64657f5a335d8");
  });

  it("stock search (/api/stock/search) excludes curated assets from general search", async () => {
    const res = await getStockSearch(new Request("http://localhost/api/stock/search?q=nature&provider=all"));
    const data = await res.json();
    expect(res.status).toBe(200);
    // Should never contain curated assets
    const curated = (data.items || []).filter((i: any) => i.provider === "curated");
    expect(curated.length).toBe(0);
  });

  it("stock photos (/api/stock/photos) resolves Pixabay stock photos", async () => {
    const res = await getStockPhotos(new Request("http://localhost/api/stock/photos?q=mountain"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.items.some((i: any) => i.source === "pixabay")).toBe(true);
  });
});
