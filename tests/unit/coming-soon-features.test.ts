import { describe, expect, it } from "vitest";
import { FEATURES, featureById } from "@/lib/roadmap";
import { docSchema, emptyDoc } from "@/lib/edit/doc";

describe("Coming soon shipped features verification", () => {
  it("verifies detach-audio is marked as ready in roadmap", () => {
    const f = featureById("detach-audio");
    expect(f).toBeDefined();
    expect(f?.status).toBe("ready");
    expect(f?.area).toBe("edit");
  });

  it("verifies markers feature is marked as ready and markers schema works", () => {
    const f = featureById("markers");
    expect(f).toBeDefined();
    expect(f?.status).toBe("ready");
    expect(f?.area).toBe("edit");

    const base = emptyDoc();
    const doc = docSchema.parse({
      ...base,
      markers: [{ id: "m1", t: 3.5, label: "Intro", color: "purple" }],
    });
    expect(doc.markers).toBeDefined();
    expect(doc.markers?.[0]?.color).toBe("purple");
  });

  it("verifies multi brand-kits is marked as ready", () => {
    const f = featureById("brand-kits");
    expect(f).toBeDefined();
    expect(f?.status).toBe("ready");
    expect(f?.area).toBe("brand");
  });

  it("verifies glow-grain and fx-blur are marked as ready", () => {
    const glow = featureById("glow-grain");
    expect(glow).toBeDefined();
    expect(glow?.status).toBe("ready");
    expect(glow?.area).toBe("effects");

    const blur = featureById("fx-blur");
    expect(blur).toBeDefined();
    expect(blur?.status).toBe("ready");
    expect(blur?.area).toBe("effects");
  });

  it("verifies export size estimate is marked as ready", () => {
    const est = featureById("estimate");
    expect(est).toBeDefined();
    expect(est?.status).toBe("ready");
    expect(est?.area).toBe("export");
  });
});
