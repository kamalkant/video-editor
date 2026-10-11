import { describe, expect, it } from "vitest";
import { speechRanges } from "@/lib/audio/ducking";
import { autoColor, statsOf } from "@/lib/color/auto";
import { emptyDoc, type MediaLite, type TimelineDoc } from "@/lib/edit/doc";
import { addMedia } from "@/lib/edit/docEdit";
import { VIDEO_PRESETS } from "@/lib/export/presets";
import { applyMat, colorMatrix, cropForAspect, cropRect, IDENTITY, isIdentity, LOOKS, maskAlpha, maskDistance, mixerFilter, NEUTRAL, placeClip } from "@/lib/player/look";
import { STUDIO_SETS } from "@/lib/backdrops";

describe("color matrix (the preview and the export use the same one)", () => {
  it("neutral settings change nothing", () => {
    expect(isIdentity(colorMatrix(NEUTRAL))).toBe(true);
    expect(isIdentity(colorMatrix(undefined))).toBe(true);
  });
  it("black & white gives the luma grey; brightness is a gain; contrast turns around the middle", () => {
    const [g] = applyMat(colorMatrix({ ...NEUTRAL, saturation: 0 }), [1, 0, 0, 1]);
    expect(g).toBeCloseTo(0.2126, 4);
    expect(applyMat(colorMatrix({ ...NEUTRAL, brightness: 0.5 }), [0.4, 0.4, 0.4, 1])[0]).toBeCloseTo(0.6, 5);
    expect(applyMat(colorMatrix({ ...NEUTRAL, contrast: 2 }), [0.5, 0.75, 0.25, 1]).slice(0, 3)).toEqual([0.5, 1, 0]);
    // warm: more red, less blue
    const w = applyMat(colorMatrix({ ...NEUTRAL, temperature: 1 }), [0.5, 0.5, 0.5, 1]);
    expect(w[0]).toBeGreaterThan(0.5);
    expect(w[2]).toBeLessThan(0.5);
  });
  it("becomes one FFmpeg colorchannelmixer with an offset on alpha", () => {
    const f = mixerFilter(colorMatrix({ ...NEUTRAL, contrast: 1.5 }));
    expect(f).toMatch(/^colorchannelmixer=rr=1\.5:rg=0:rb=0:ra=-0\.25:/);
    expect(mixerFilter(IDENTITY)).toContain("aa=1");
  });
  it("every look is a real change", () => {
    for (const k of Object.keys(LOOKS)) expect(isIdentity(colorMatrix({ ...NEUTRAL, look: k }))).toBe(false);
  });
});

describe("crop, turn and place", () => {
  it("crops and fits the visible part", () => {
    expect(cropRect(400, 300, { crop: { l: 0.25, t: 0, r: 0.25, b: 0.5 } })).toEqual({ sx: 100, sy: 0, sw: 200, sh: 150 });
    const p = placeClip(400, 300, 400, 300, { fit: "fit", x: 0, y: 0, scale: 1, crop: { l: 0, t: 0, r: 0.5, b: 0.5 } });
    expect([p.w, p.h]).toEqual([400, 300]);
  });
  it("a quarter turn fits the picture on its side", () => {
    const p = placeClip(400, 300, 400, 300, { fit: "fit", x: 0, y: 0, scale: 1, rotation: 90 });
    expect(p.rotation).toBe(90);
    expect(p.w).toBeCloseTo(300, 5); // before turning: 300 × 225, turned it's 225 × 300
    expect(p.h).toBeCloseTo(225, 5);
    // other angles turn without resizing
    expect(placeClip(400, 300, 400, 300, { fit: "fit", x: 0, y: 0, scale: 1, rotation: 30 }).w).toBeCloseTo(400, 5);
  });
  it("aspect buttons make centred crops", () => {
    expect(cropForAspect(1920, 1080, 1)).toEqual({ l: 0.21875, t: 0, r: 0.21875, b: 0 });
    expect(cropForAspect(1080, 1920, 16 / 9)?.t).toBeCloseTo(0.341796875, 6);
    expect(cropForAspect(1920, 1080, 16 / 9)).toBeUndefined();
  });
});

describe("shape masks", () => {
  it("a circle: inside is solid, the corners are see-through, the edge is soft", () => {
    const m = { shape: "circle" as const, radius: 0, feather: 2 };
    expect(maskAlpha(maskDistance(m, 300, 300, 150, 150), 2)).toBe(1);
    expect(maskAlpha(maskDistance(m, 300, 300, 5, 5), 2)).toBe(0);
    expect(maskAlpha(maskDistance(m, 300, 300, 0, 150), 2)).toBeCloseTo(0.5, 5);
  });
  it("rounded corners cut only the corners", () => {
    const m = { shape: "rounded" as const, radius: 0.2, feather: 1 };
    expect(maskAlpha(maskDistance(m, 400, 300, 2, 150), 1)).toBe(1); // middle of the left edge
    expect(maskAlpha(maskDistance(m, 400, 300, 2, 2), 1)).toBe(0); // the corner
  });
});

describe("auto color", () => {
  it("brightens and adds contrast to a dull, dark picture; leaves a good one nearly alone", () => {
    const px = (v: number, n = 1000) => new Uint8Array(Array.from({ length: n * 3 }, (_, i) => Math.round(v + ((i / 3) % 40))));
    const dark = autoColor(statsOf(px(40)));
    expect(dark.brightness).toBeGreaterThan(0.1);
    expect(dark.contrast).toBeGreaterThan(1.2);
    const wide = new Uint8Array(Array.from({ length: 3000 }, (_, i) => Math.round((Math.floor(i / 3) / 999) * 255)));
    const ok = autoColor(statsOf(wide));
    expect(Math.abs(ok.brightness)).toBeLessThan(0.1);
    expect(Math.abs(ok.contrast - 1)).toBeLessThan(0.15);
  });
});

describe("ducking ranges (export and preview)", () => {
  it("speech is the Video 1 clip minus its pauses, at timeline times", () => {
    const V = "66666666-6666-4666-8666-666666666666";
    const m: MediaLite = { id: V, kind: "video", fileName: "v", width: 640, height: 360, fps: 24, duration: 10, hasAudio: true, suggestedKey: null, keyKind: null };
    let d: TimelineDoc = emptyDoc();
    d = addMedia(d, m, { id: "v1" }).doc;
    const r = speechRanges(d, { [V]: [{ start: 2, end: 3 }, { start: 6, end: 7.5 }] }, () => true);
    expect(r).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 6 },
      { start: 7.5, end: 10 },
    ]);
    expect(speechRanges(d, {}, () => false)).toEqual([]);
  });
});

describe("presets and sets", () => {
  it("video presets are even sizes; studio sets have unique ids", () => {
    for (const p of VIDEO_PRESETS) expect(p.width % 2 + p.height % 2).toBe(0);
    expect(new Set(STUDIO_SETS.map((s) => s.id)).size).toBe(STUDIO_SETS.length);
  });
});
