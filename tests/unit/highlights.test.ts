import { describe, expect, it } from "vitest";
import { fakeHighlights } from "@/lib/ai/fake";
import { extractHighlights, type HighlightItem } from "@/lib/ai/highlights";
import { featureById } from "@/lib/roadmap";

describe("video highlights & transcript extraction (lib/ai/highlights & lib/roadmap)", () => {
  it("highlights feature is registered in roadmap as ready AI tool", () => {
    const f = featureById("highlights");
    expect(f).toBeDefined();
    expect(f?.name).toBe("Auto Highlights & Recap");
    expect(f?.area).toBe("ai");
    expect(f?.status).toBe("ready");
    expect(f?.cloud).toBe(true);
  });

  it("fakeHighlights generates structured moments within video bounds", () => {
    const duration = 120; // 2 minutes video
    const highlights = fakeHighlights(duration);

    expect(highlights.length).toBeGreaterThanOrEqual(3);
    for (const h of highlights) {
      expect(h.id).toBeDefined();
      expect(h.title.length).toBeGreaterThan(0);
      expect(h.start).toBeGreaterThanOrEqual(0);
      expect(h.end).toBeGreaterThan(h.start);
      expect(h.end).toBeLessThanOrEqual(duration);
      expect(h.duration).toBeCloseTo(h.end - h.start, 1);
      expect(h.viralityScore).toBeGreaterThanOrEqual(60);
      expect(h.viralityScore).toBeLessThanOrEqual(100);
      expect(["hook", "insight", "story", "climax", "reaction", "qa"]).toContain(h.category);
      expect(h.quote.length).toBeGreaterThan(0);
    }
  });

  it("fakeHighlights scales properly for short and long clips", () => {
    const shortHighlights = fakeHighlights(20);
    expect(shortHighlights[0].end).toBeLessThanOrEqual(20);

    const longHighlights = fakeHighlights(600);
    expect(longHighlights[longHighlights.length - 1].end).toBeLessThanOrEqual(600);
  });

  it("extractHighlights throws not_found for non-existent video", async () => {
    await expect(
      extractHighlights("non-existent-media-id-12345", { goal: "viral-shorts" }),
    ).rejects.toThrow("This file is no longer here.");
  });
});
