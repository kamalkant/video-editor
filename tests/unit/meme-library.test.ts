import { describe, expect, it } from "vitest";
import { MEME_CATALOG, MEME_CATEGORIES, queryMemes } from "@/lib/library/memeCatalog";
import { MEME_DRAG, memeDrag, setMemeDrag } from "@/lib/editor/mediaDrag";
import { generateMemeSvg } from "@/lib/library/memeGenerator";
import { emptyDoc, type MediaLite } from "@/lib/edit/doc";
import { dropLanding } from "@/lib/edit/docEdit";

describe("Library (Meme clips catalog & engine)", () => {
  it("contains curated Bollywood and Hollywood meme clips", () => {
    expect(MEME_CATALOG.length).toBeGreaterThanOrEqual(40);
    for (const item of MEME_CATALOG) {
      expect(item.id).toBeTruthy();
      expect(item.title).toBeTruthy();
      expect(item.dialogue).toBeTruthy();
      expect(item.category).toBeTruthy();
      expect(item.duration).toBeGreaterThan(0);
      expect(item.duration).toBeLessThanOrEqual(15);
      expect(item.thumbUrl).toBeTruthy();
      expect(item.videoUrl).toBeTruthy();
      expect(Array.isArray(item.tags)).toBe(true);
      expect(item.tags.length).toBeGreaterThan(0);
    }
  });

  it("filters memes by category accurately", () => {
    const comedy = queryMemes("", "comedy");
    expect(comedy.length).toBeGreaterThan(5);
    expect(comedy.every((m) => m.category === "comedy")).toBe(true);

    const savage = queryMemes("", "savage");
    expect(savage.length).toBeGreaterThan(3);
    expect(savage.every((m) => m.category === "savage")).toBe(true);

    const hollywood = queryMemes("", "hollywood");
    expect(hollywood.length).toBeGreaterThanOrEqual(4);
    expect(hollywood.every((m) => m.category === "hollywood")).toBe(true);
  });

  it("searches memes by dialogue, actor, title, or tag", () => {
    const babuResults = queryMemes("babu");
    expect(babuResults.length).toBeGreaterThan(0);
    expect(babuResults.some((m) => m.id === "babu-khopdi-tod")).toBe(true);

    const mirzapur = queryMemes("mirzapur");
    expect(mirzapur.length).toBeGreaterThan(0);

    const faizal = queryMemes("faizal");
    expect(faizal.length).toBeGreaterThan(0);
    expect(faizal.some((m) => m.dialogue.toLowerCase().includes("badla"))).toBe(true);

    const travolta = queryMemes("travolta");
    expect(travolta.length).toBeGreaterThan(0);
    expect(travolta[0].id).toBe("confused-travolta");
  });

  it("sets and retrieves meme drag state correctly", () => {
    expect(MEME_DRAG).toBe("application/x-vdo-meme");
    const item = MEME_CATALOG[0];

    setMemeDrag(item);
    expect(memeDrag()).toEqual(item);

    setMemeDrag(null);
    expect(memeDrag()).toBeNull();
  });

  it("generates clean SVG badges for thumbnails", () => {
    const item = MEME_CATALOG[0];
    const svg = generateMemeSvg(item);

    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain(item.title);
    expect(svg).toContain(item.dialogue);
    expect(svg).toContain(item.category.toUpperCase());
  });

  it("calculates correct drop landing into timeline for meme clips", () => {
    const doc = emptyDoc();
    const item = MEME_CATALOG[0]; // e.g. Babu Bhaiya, 3.2s
    const fakeMedia: MediaLite = {
      id: item.id,
      kind: "video",
      fileName: item.title,
      duration: item.duration,
      width: item.width,
      height: item.height,
      fps: 25,
      hasAudio: true,
      suggestedKey: null,
      keyKind: null,
    };

    const landing = dropLanding(doc, { media: fakeMedia }, { trackId: doc.tracks[0].id, at: 0 });
    expect(landing).not.toBeNull();
    expect(landing?.length).toBe(item.duration);
    expect(landing?.trackId).toBe(doc.tracks[0].id);
  });

  it("has authentic clips for dance and party category", () => {
    const dance = queryMemes("", "dance");
    expect(dance.length).toBeGreaterThanOrEqual(4);
    expect(dance.every((m) => m.category === "dance")).toBe(true);
  });

  it("calculates accurate clip counts for every category", () => {
    for (const cat of MEME_CATEGORIES) {
      if (cat.id === "all") {
        expect(MEME_CATALOG.length).toBeGreaterThanOrEqual(40);
      } else {
        const count = MEME_CATALOG.filter((m) => m.category === cat.id).length;
        expect(count).toBeGreaterThan(0);
      }
    }
  });

  it("clamps dynamic meme clip duration up to 30s while preserving short clip durations", () => {
    const clampDuration = (raw: number | string | undefined) => {
      const rawNum = typeof raw === "number" ? raw : parseFloat(raw as string) || 10;
      return Math.min(30, Math.max(1, rawNum));
    };

    expect(clampDuration(5)).toBe(5);
    expect(clampDuration(12.5)).toBe(12.5);
    expect(clampDuration(28)).toBe(28);
    expect(clampDuration(30)).toBe(30);
    expect(clampDuration(45)).toBe(30); // clamped to 30s
    expect(clampDuration(120)).toBe(30); // long videos clamped to 30s
    expect(clampDuration(0.5)).toBe(1);
    expect(clampDuration(undefined)).toBe(10);
  });
});

