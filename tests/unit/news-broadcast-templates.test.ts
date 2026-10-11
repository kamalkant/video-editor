import { describe, expect, it } from "vitest";
import { BROADCAST_TEMPLATES, BROADCAST_TEMPLATES_BY_ID } from "@/lib/templates/newsTemplates";
import { ALL_TEMPLATE_CATEGORIES } from "@/lib/templates/types";
import { renderProceduralMotion, type MotionEngineKind } from "@/lib/templates/motionEngine";
import { CuratedBroadcastProvider } from "@/lib/media/stockProvider";
import { videoClipSchema } from "@/lib/edit/doc";

describe("News & Broadcast Template System", () => {
  it("contains at least 20 specialized broadcast templates", () => {
    expect(BROADCAST_TEMPLATES.length).toBeGreaterThanOrEqual(20);
  });

  it("has valid metadata and unique IDs for all templates", () => {
    const ids = new Set<string>();
    for (const t of BROADCAST_TEMPLATES) {
      expect(ids.has(t.id)).toBe(false);
      ids.add(t.id);

      expect(t.name.trim().length).toBeGreaterThan(0);
      expect(ALL_TEMPLATE_CATEGORIES).toContain(t.category);
      expect(["16:9", "9:16", "1:1"]).toContain(t.aspectRatio);
      expect(["4K", "HD"]).toContain(t.resolution);
      expect(t.duration).toBeGreaterThan(0);
      expect(t.slots.length).toBeGreaterThan(0);
      expect(t.tags.length).toBeGreaterThan(0);
    }
  });

  it("builds valid TimelineDoc with tracks for all templates", () => {
    for (const t of BROADCAST_TEMPLATES) {
      const doc = t.build();
      expect(doc).toBeDefined();
      expect(doc.canvas).toBeDefined();
      expect(doc.canvas.width).toBeGreaterThan(0);
      expect(doc.canvas.height).toBeGreaterThan(0);
      expect(doc.tracks.length).toBeGreaterThan(0);

      // Verify aspect ratio dimensions
      if (t.aspectRatio === "16:9") {
        expect(doc.canvas.width).toBe(1920);
        expect(doc.canvas.height).toBe(1080);
      } else if (t.aspectRatio === "9:16") {
        expect(doc.canvas.width).toBe(1080);
        expect(doc.canvas.height).toBe(1920);
      } else if (t.aspectRatio === "1:1") {
        expect(doc.canvas.width).toBe(1080);
        expect(doc.canvas.height).toBe(1080);
      }

      // Verify presence of overlay or main clips (texts, elements, backdrops)
      const totalClips = doc.tracks.reduce((acc, tr) => acc + tr.clips.length, 0);
      expect(totalClips).toBeGreaterThan(0);
    }
  });

  it("customizes template layers when build(customizations) is supplied", () => {
    const studioTemplate = BROADCAST_TEMPLATES_BY_ID.get("modern-news-studio")!;
    expect(studioTemplate).toBeDefined();

    const customName = "Vikram Aditya\nSenior Editor";
    const customTicker = "Breaking: Live stock index surges to historic high";

    const customizedDoc = studioTemplate.build({
      presenterName: customName,
      tickerText: customTicker,
      primaryColor: "#059669",
    });

    const hasCustomName = customizedDoc.tracks.some((tr) =>
      tr.clips.some((c) => c.type === "text" && c.text.includes("Vikram Aditya")),
    );
    expect(hasCustomName).toBe(true);

    const hasCustomTicker = customizedDoc.tracks.some((tr) =>
      tr.clips.some((c) => c.type === "element" && (c.el as any).text?.includes("historic high")),
    );
    expect(hasCustomTicker).toBe(true);
  });

  it("renders procedural motion engines without error on canvas", () => {
    const cv = {
      width: 640,
      height: 360,
      getContext: () => ({
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createLinearGradient: () => ({ addColorStop: () => {} }),
        fillRect: () => {},
        strokeRect: () => {},
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        fill: () => {},
        arc: () => {},
        ellipse: () => {},
        clip: () => {},
        translate: () => {},
        rotate: () => {},
        setLineDash: () => {},
        roundRect: () => {},
        closePath: () => {},
        strokeStyle: "",
        fillStyle: "",
        lineWidth: 1,
        shadowColor: "",
        shadowBlur: 0,
      }),
    } as unknown as HTMLCanvasElement;

    const ctx = cv.getContext("2d") as CanvasRenderingContext2D;
    const engines: MotionEngineKind[] = ["globe3d", "newsroomMatrix", "radarSweep", "marketTicker", "breakingPulse", "podcastWave"];

    for (const engine of engines) {
      expect(() => renderProceduralMotion(engine, ctx, cv.width, cv.height, 1.5)).not.toThrow();
    }
  });

  it("filters stock media correctly via CuratedBroadcastProvider", async () => {
    const provider = new CuratedBroadcastProvider();

    // Search by category
    const newsrooms = await provider.search({ query: "", category: "News Studio Backgrounds" });
    expect(newsrooms.items.length).toBeGreaterThan(0);
    expect(newsrooms.items.every((x) => x.category === "News Studio Backgrounds")).toBe(true);

    // Search by aspect ratio
    const vertical = await provider.search({ query: "", aspectRatio: "9:16" });
    expect(vertical.items.length).toBeGreaterThan(0);
    expect(vertical.items.every((x) => x.aspectRatio === "9:16")).toBe(true);

    // Search by keyword
    const globe = await provider.search({ query: "globe" });
    expect(globe.items.length).toBeGreaterThan(0);
    expect(globe.items.some((x) => x.title.toLowerCase().includes("globe"))).toBe(true);
  });

  it("validates loop property on videoClipSchema", () => {
    const validLoopedClip = {
      id: "clip-loop-1",
      type: "video" as const,
      mediaId: "12345678-1234-4123-8123-123456789abc",
      in: 0,
      out: 10,
      loop: true,
      ops: [],
      transform: { fit: "fit" as const, x: 0, y: 0, scale: 1 },
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    };

    const parsed = videoClipSchema.safeParse(validLoopedClip);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.loop).toBe(true);
    }
  });
});
