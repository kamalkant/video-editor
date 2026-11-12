import { describe, expect, it } from "vitest";
import { docSchema, findClip, mainTrack, type MediaLite } from "@/lib/edit/doc";
import { replacePlaceholder } from "@/lib/edit/docEdit";
import { build, placeholdersOf } from "@/lib/templates/v2/build";
import { YOUTUBE } from "@/lib/templates/v2/catalog/youtube";
import { V2_TEMPLATES } from "@/lib/templates/v2/catalog";
import { STARTER } from "@/lib/library";
import { elementPreset } from "@/lib/elements/catalog";
import { TEXT_STYLES } from "@/lib/text/layout";
import { TEMPLATES } from "@/lib/templates";
import { CANVAS, insideSafe, offsetOf } from "@/lib/templates/v2/layout";
import { RATIOS } from "@/lib/templates/v2/spec";

const video: MediaLite = { id: "11111111-1111-4111-8111-111111111111", kind: "video", fileName: "me.mp4", width: 1920, height: 1080, fps: 30, duration: 10, hasAudio: true, suggestedKey: null, keyKind: null };
const shortVideo: MediaLite = { ...video, id: "22222222-2222-4222-8222-222222222222", duration: 1.5 };
const picture: MediaLite = { ...video, id: "33333333-3333-4333-8333-333333333333", kind: "image", fileName: "me.png", duration: 0, hasAudio: false };

describe("templates v2", () => {
  for (const spec of V2_TEMPLATES)
    for (const r of RATIOS)
      it(`${spec.id} builds a valid ${r} project with its scenes, slots and words`, () => {
        const doc = build(spec, r);
        expect(docSchema.safeParse(doc).success).toBe(true);
        expect(doc.canvas).toMatchObject(CANVAS[r]);
        expect(mainTrack(doc).clips).toHaveLength(spec.scenes.length);
        const slots = spec.scenes.flatMap((s) => s.layers.filter((l) => l.kind === "media"));
        expect(placeholdersOf(doc)).toHaveLength(slots.length);
        // every text and graphic sits inside the safe area
        for (const t of doc.tracks)
          if (t.kind === "overlay")
            for (const c of t.clips) expect(insideSafe({ x: c.transform?.x ?? 0, y: c.transform?.y ?? 0 }, r, 0.001)).toBe(true);
      });

  it("every template: a unique id, a music bed that exists, text styles and elements that exist, a slot", () => {
    expect(new Set(V2_TEMPLATES.map((t) => t.id)).size).toBe(V2_TEMPLATES.length);
    // (a name an older template has would show two cards of that name in the library)
    const older = new Set(TEMPLATES.map((t) => t.name.toLowerCase()));
    expect(V2_TEMPLATES.filter((t) => older.has(t.name.toLowerCase())).map((t) => t.name)).toEqual([]);
    expect(V2_TEMPLATES.length).toBeGreaterThanOrEqual(40);
    const beds = new Set(STARTER.filter((r) => r.kind === "music").map((r) => r.name));
    for (const t of V2_TEMPLATES) {
      if (t.music) expect(beds.has(t.music.id), `${t.id}: music ${t.music.id}`).toBe(true);
      for (const l of t.scenes.flatMap((s) => s.layers)) {
        if (l.kind === "text") expect(TEXT_STYLES.some((x) => x.id === l.style), `${t.id}: style ${l.style}`).toBe(true);
        if (l.kind === "element") expect(elementPreset(l.preset), `${t.id}: element ${l.preset}`).toBeTruthy();
        if (l.kind === "media" && l.frame) expect(elementPreset(l.frame), `${t.id}: frame ${l.frame}`).toBeTruthy();
      }
    }
  });

  it("anchors land where they say, in every shape", () => {
    for (const r of RATIOS) {
      expect(offsetOf({ x: "center", y: "center" }, r).x).toBeCloseTo(0);
      expect(offsetOf({ x: "left", y: "top" }, r).x).toBeLessThan(0);
      expect(offsetOf({ x: "right", y: "bottom" }, r).y).toBeGreaterThan(0);
    }
  });

  it("a filled slot keeps its place, length and transition; a longer video is cut to it, a shorter one keeps its own length", () => {
    const doc = build(YOUTUBE[0], "16:9");
    const slot = placeholdersOf(doc)[0];
    const before = findClip(doc, slot.clipId)!;
    const len = (before.clip as { duration: number }).duration;
    const r = replacePlaceholder(doc, slot.clipId, video)!;
    const after = findClip(r.doc, r.clipId)!;
    expect(after.index).toBe(before.index);
    expect(after.clip.type).toBe("video");
    expect((after.clip as { out: number }).out).toBeCloseTo(len);
    expect((after.clip as { transitionIn?: unknown }).transitionIn).toEqual((before.clip as { transitionIn?: unknown }).transitionIn);
    expect(placeholdersOf(r.doc)).toHaveLength(placeholdersOf(doc).length - 1);
    const s = replacePlaceholder(doc, slot.clipId, shortVideo)!;
    expect((findClip(s.doc, s.clipId)!.clip as { out: number }).out).toBeCloseTo(1.5);
    const p = replacePlaceholder(doc, slot.clipId, picture)!;
    expect((findClip(p.doc, p.clipId)!.clip as { duration: number }).duration).toBeCloseTo(len);
  });

  it("a slot refuses what it doesn't take", () => {
    const spec = { ...YOUTUBE[0], scenes: YOUTUBE[0].scenes.map((s) => ({ ...s, layers: s.layers.map((l) => (l.kind === "media" ? { ...l, accepts: "image" as const } : l)) })) };
    const doc = build(spec, "1:1");
    expect(replacePlaceholder(doc, placeholdersOf(doc)[0].clipId, video)).toBeNull();
  });
});
