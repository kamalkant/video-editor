import { describe, expect, it } from "vitest";
import { docDuration, docFromSpec, docSchema, mainTrack, watermarkRect, type MediaLite, type TimelineDoc, type VideoClip, type Watermark } from "@/lib/edit/doc";
import { addMedia, dropLanding } from "@/lib/edit/docEdit";
import { DEFAULT_SPEC } from "@/lib/edit/spec";
import { bppOf, estimateBytes, sizeBasisOf, STILL_BPP, type SizeInput } from "@/lib/export/size";
import { cropViewRect, logoTransform, placeRect } from "@/lib/player/layout";
import { clampCrop, cropForAspect, rotationOf } from "@/lib/player/look";

const V1 = "11111111-1111-4111-8111-111111111111";
const V2 = "22222222-2222-4222-8222-222222222222";
const IMG = "33333333-3333-4333-8333-333333333333";
const MUS = "44444444-4444-4444-8444-444444444444";
const base = { fileName: "x", suggestedKey: "#11AE33", keyKind: "green" as const };
const M: Record<string, MediaLite> = {
  [V1]: { ...base, id: V1, kind: "video", width: 1280, height: 720, fps: 24, duration: 4, hasAudio: true },
  [V2]: { ...base, id: V2, kind: "video", width: 1920, height: 1080, fps: 30, duration: 10, hasAudio: false },
  [IMG]: { ...base, id: IMG, kind: "image", width: 800, height: 600, fps: 0, duration: 0, hasAudio: false, suggestedKey: null, keyKind: null },
  [MUS]: { ...base, id: MUS, kind: "audio", width: 0, height: 0, fps: 0, duration: 30, hasAudio: true, suggestedKey: null, keyKind: null },
};
const twoVideos = (): TimelineDoc => addMedia(docFromSpec(DEFAULT_SPEC, M[V1]), M[V2]).doc;

describe("export size estimate", () => {
  const p: SizeInput = { width: 1920, height: 1080, fps: 30, duration: 60, quality: "balanced", hasSound: true, bpp: 0.1 };
  it("a better quality is a bigger file, for every video format", () => {
    for (const f of ["mp4", "hevc", "av1", "webm", "webm-alpha", "mov-alpha"] as const) {
      const small = estimateBytes(f, { ...p, quality: "small" });
      const mid = estimateBytes(f, p);
      const best = estimateBytes(f, { ...p, quality: "best" });
      expect(small).toBeLessThan(mid);
      expect(mid).toBeLessThan(best);
    }
  });
  it("a busier picture is bigger; a longer or larger video too", () => {
    expect(estimateBytes("mp4", { ...p, bpp: 0.2 })).toBeGreaterThan(estimateBytes("mp4", p));
    expect(estimateBytes("mp4", { ...p, duration: 120 })).toBeGreaterThan(estimateBytes("mp4", p) * 1.9);
    expect(estimateBytes("mp4", { ...p, width: 1280, height: 720 })).toBeLessThan(estimateBytes("mp4", p));
  });
  it("MP4 is picture + sound: 1080p30, 60 s at 0.1 bits a pixel ≈ 80 MB", () => {
    const expected = ((1920 * 1080 * 30 * 60 * 0.1 + 160_000 * 60) / 8) * 1.015;
    expect(estimateBytes("mp4", p)).toBeCloseTo(expected, -3);
  });
  it("sound-only files are rate × length", () => {
    expect(estimateBytes("mp3", p)).toBe((192_000 * 60) / 8);
    expect(estimateBytes("mp3", { ...p, quality: "best" })).toBe((320_000 * 60) / 8);
    expect(estimateBytes("wav", p)).toBe(192_000 * 60 + 44);
    expect(estimateBytes("mp3", { ...p, hasSound: false })).toBe(0);
  });
  it("a GIF is at most 640 px wide and 15 frames a second", () => {
    expect(estimateBytes("gif", { ...p, width: 3840, height: 2160 })).toBe(estimateBytes("gif", p));
    expect(estimateBytes("gif", { ...p, fps: 60 })).toBe(estimateBytes("gif", p));
  });
  it("the website pack is both see-through files and a poster (+ the ProRes master)", () => {
    const pack = estimateBytes("pack", p);
    expect(pack).toBeGreaterThan(estimateBytes("webm-alpha", p) + estimateBytes("mov-alpha", p));
    expect(estimateBytes("pack", { ...p, master: true })).toBeGreaterThan(pack);
  });
  it("mov-alpha is lightweight (~1.0–1.7 MB for 10s 1080p, matching chroma-green-take.mov)", () => {
    const bytes10s = estimateBytes("mov-alpha", {
      width: 1920,
      height: 1080,
      fps: 24,
      duration: 10,
      quality: "balanced",
      hasSound: true,
      bpp: null,
    });
    // Must be around ~1 MB (never 574 MB)
    expect(bytes10s).toBeGreaterThan(800_000);
    expect(bytes10s).toBeLessThan(3_000_000);
  });
  it("measures the two longest visible video clips, weighted by length", () => {
    const d = twoVideos();
    const b = sizeBasisOf(d);
    expect(b.samples.map((s) => s.mediaId)).toEqual([V2, V1]);
    expect(b.samples[0].weight).toBeCloseTo(10 / 14, 2);
    expect(b.samples[0].at).toBe(4); // the middle of 0–10 s, minus half the 2 s sample
    expect(b.videoShare).toBe(1);
    expect(bppOf(b, [0.2, 0.1])).toBeCloseTo((10 / 14) * 0.2 + (4 / 14) * 0.1, 3);
    // no video: a calm picture, nothing to measure
    const pics = { ...d, tracks: d.tracks.map((t) => ({ ...t, clips: [] })) } as TimelineDoc;
    expect(sizeBasisOf(pics).samples).toEqual([]);
    expect(bppOf(sizeBasisOf(pics), [])).toBe(STILL_BPP);
  });
});

describe("Brand Kit logo placed by hand", () => {
  const wm: Watermark = { mediaId: IMG, corner: "tr", size: 0.1, opacity: 1, margin: 0.03 };
  it("sits in its corner, or with its middle at x/y, always inside the canvas", () => {
    expect(watermarkRect(wm, 1920, 1080, 400, 200)).toEqual({ x: 1920 - 58 - 192, y: 58, w: 192, h: 96 });
    expect(watermarkRect({ ...wm, x: 0.5, y: 0.5 }, 1920, 1080, 400, 200)).toEqual({ x: 864, y: 492, w: 192, h: 96 });
    // past the edge: pushed back in
    expect(watermarkRect({ ...wm, x: 1, y: 0 }, 1920, 1080, 400, 200)).toEqual({ x: 1728, y: 0, w: 192, h: 96 });
    // at most 40 % of the width
    expect(watermarkRect({ ...wm, size: 0.5 }, 1000, 1000, 100, 100).w).toBe(400);
  });
  it("the position is kept when the project is saved", () => {
    const d = { ...twoVideos(), watermark: { ...wm, x: 0.25, y: 0.75 } };
    expect(docSchema.parse(d).watermark).toMatchObject({ x: 0.25, y: 0.75 });
  });
});

describe("a picture dropped on the preview", () => {
  it("is a fifth of the width, centred where it was dropped, inside the canvas", () => {
    const t = logoTransform({ x: 0.5, y: 0.5 }, 800, 600, 1920, 1080);
    const r = placeRect(800, 600, 1920, 1080, t);
    expect(r.w).toBeCloseTo(384, 0);
    expect(r.x + r.w / 2).toBeCloseTo(960, 0);
    const corner = placeRect(800, 600, 1920, 1080, logoTransform({ x: 1, y: 0 }, 800, 600, 1920, 1080));
    expect(corner.x + corner.w).toBeCloseTo(1920, 0);
    expect(corner.y).toBeCloseTo(0, 0);
  });
  it("lasts the whole video (addMedia with a length), on a free overlay track", () => {
    const d = twoVideos();
    const r = addMedia(d, M[IMG], { overlay: true, at: 0, duration: docDuration(d) });
    const clip = r.doc.tracks.flatMap((t) => t.clips as { id: string; type: string; duration?: number }[]).find((c) => c.id === r.clipId)!;
    expect(clip.type).toBe("image");
    expect(clip.duration).toBe(14);
  });
});

describe("timeline drop shadow", () => {
  it("a file on Video 1 lands at the index: the clips after it make room", () => {
    const d = twoVideos();
    const l = dropLanding(d, { media: M[V1] }, { trackId: mainTrack(d).id, index: 1 })!;
    expect(l.trackId).toBe(mainTrack(d).id);
    expect(l.start).toBe(4);
    expect(l.length).toBe(4);
    expect(mainTrack(l.doc).clips).toHaveLength(3);
    // the original is untouched (it's only a preview)
    expect(mainTrack(d).clips).toHaveLength(2);
  });
  it("a picture or sound lands at the time, on a free track of its kind", () => {
    const d = twoVideos();
    const pic = dropLanding(d, { media: M[IMG] }, { trackId: mainTrack(d).id, index: 0 })!;
    expect(pic.start).toBe(0); // on Video 1: a picture goes in the order like a clip
    const over = dropLanding(d, { media: M[IMG] }, { trackId: null, at: 2 })!;
    expect(over.start).toBe(2);
    expect(over.doc.tracks.find((t) => t.id === over.trackId)?.kind).toBe("overlay");
    const snd = dropLanding(d, { media: M[MUS] }, { trackId: null, at: 3 })!;
    expect(snd.start).toBe(3);
    expect(snd.length).toBe(30);
    expect(snd.doc.tracks.find((t) => t.id === snd.trackId)?.kind).toBe("audio");
  });
  it("a Video 1 clip moved to the front", () => {
    const d = twoVideos();
    const second = mainTrack(d).clips[1].id;
    const l = dropLanding(d, { clipId: second }, { trackId: mainTrack(d).id, index: 0 })!;
    expect(l.start).toBe(0);
    expect(mainTrack(l.doc).clips[0].id).toBe(second);
  });
});

describe("crop", () => {
  it("no edge past 45 %", () => {
    expect(clampCrop({ l: 0.5, t: -0.1, r: 0.2, b: 0.4012 })).toEqual({ l: 0.45, t: 0, r: 0.2, b: 0.4012 });
    // a very wide picture to 9:16: as close as the limit allows (the project stays valid)
    const k = cropForAspect(4000, 500, 9 / 16)!;
    expect(k.l).toBeLessThanOrEqual(0.45);
    expect(docSchema.safeParse({ ...twoVideos(), tracks: twoVideos().tracks.map((t) => (t.kind === "main" ? { ...t, clips: t.clips.map((c) => ({ ...c, transform: { ...(c as VideoClip).transform, crop: k } })) } : t)) }).success).toBe(true);
  });
  it("crop mode shows the whole picture where it is without the crop, still while cropping", () => {
    const t = { fit: "fit" as const, x: 0, y: 0, scale: 1, crop: { l: 0.2, t: 0, r: 0.1, b: 0 } };
    const a = cropViewRect(1920, 1080, 1920, 1080, t);
    const b = cropViewRect(1920, 1080, 1920, 1080, { ...t, crop: { l: 0.4, t: 0.3, r: 0, b: 0 } });
    expect(a).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
    expect(b).toEqual(a);
    // a small picture-in-picture: in place
    const pip = cropViewRect(1920, 1080, 1920, 1080, { ...t, scale: 0.3, x: 0.3, y: 0.3 });
    expect(pip.w).toBeCloseTo(576, 0);
    // zoomed in (bigger than the canvas): the whole picture fitted, so every edge can be reached
    const zoomed = cropViewRect(1920, 1080, 1920, 1080, { ...t, scale: 2 });
    expect(zoomed).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
    // turned 30°: fitted so its corners stay on the canvas
    const turned = cropViewRect(1920, 1080, 1920, 1080, { ...t, rotation: 30 });
    const a30 = (rotationOf({ rotation: 30 }) * Math.PI) / 180;
    expect(turned.w * Math.cos(a30) + turned.h * Math.sin(a30)).toBeLessThanOrEqual(1920.5);
  });
});
