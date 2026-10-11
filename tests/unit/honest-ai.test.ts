import { describe, expect, it } from "vitest";
import { FEATURES, featureById } from "@/lib/roadmap";
import { cropAround, median } from "@/lib/edit/reframe";
import { buildComposeArgs, type ComposeMedia } from "@/lib/render/compose";
import { emptyDoc, type MediaLite, type TimelineDoc } from "@/lib/edit/doc";
import { addMedia, setClip } from "@/lib/edit/docEdit";

describe("the feature list is honest", () => {
  it("tools that don't yet do what their name says are marked Beta, with what they really do", () => {
    for (const id of ["avatar", "voice-clone", "remove-object", "b-roll", "gen-effects", "replace-sky", "subs-offline", "share", "grok"]) {
      expect(featureById(id)?.beta, id).toBeTruthy();
    }
  });

  it("the three made real in this round are not Beta", () => {
    for (const id of ["smart-crop", "upscale", "translate"]) expect(featureById(id)?.beta, id).toBeUndefined();
  });

  it("no detail promises 'neural' or 'inpainting' any more", () => {
    for (const f of FEATURES) expect(`${f.name} ${f.detail}`, f.id).not.toMatch(/neural|inpaint/i);
  });
});

describe("smart reframe crop", () => {
  it("a 16:9 picture cropped to 9:16 around a face on the right", () => {
    const c = cropAround(1920, 1080, 9 / 16, 0.8)!;
    const width = 1 - c.l - c.r;
    expect(width).toBeCloseTo((1080 * 9) / 16 / 1920, 3);
    // centred on 0.8 as far as the picture allows
    expect(c.l + width / 2).toBeCloseTo(0.8, 2);
  });

  it("slides back inside the picture at the edges", () => {
    const c = cropAround(1920, 1080, 9 / 16, 0.99)!;
    expect(c.r).toBe(0);
    const left = cropAround(1920, 1080, 9 / 16, 0)!;
    expect(left.l).toBe(0);
  });

  it("uses the real size (a 4:3 source is cut differently from 16:9)", () => {
    const a = cropAround(1440, 1080, 9 / 16, 0.5)!;
    const b = cropAround(1920, 1080, 9 / 16, 0.5)!;
    expect(1 - a.l - a.r).toBeGreaterThan(1 - b.l - b.r);
  });

  it("median ignores one stray detection", () => {
    expect(median([0.6, 0.62, 0.05, 0.61, 0.63])).toBe(0.61);
    expect(median([])).toBeNull();
  });
});

describe("enhance / upscale", () => {
  const V = "11111111-1111-4111-8111-111111111111";
  const vid: MediaLite = { id: V, kind: "video", fileName: "v.mp4", width: 640, height: 360, fps: 30, duration: 6, hasAudio: true, suggestedKey: null, keyKind: null };
  const media: ComposeMedia = { [V]: { path: "/v.mp4", hasAudio: true, width: 640, height: 360 } };
  const doc = (): TimelineDoc => {
    let d: TimelineDoc = { ...emptyDoc(), canvas: { width: 1920, height: 1080, fps: 30, background: "#000000" } };
    d = addMedia(d, vid, { id: "v1" }).doc;
    return d;
  };
  it("an enhanced clip is enlarged with Lanczos and sharpened; others keep bicubic", () => {
    const plain = buildComposeArgs(doc(), media, "mp4", "/o.mp4", { progress: false }).join(" ");
    const enhanced = buildComposeArgs(setClip(doc(), "v1", { color: { brightness: 0, contrast: 1, saturation: 1, temperature: 0, sharpen: 0.6 } }), media, "mp4", "/o.mp4", { progress: false }).join(" ");
    expect(plain).not.toContain("flags=lanczos");
    expect(enhanced).toContain("flags=lanczos");
    expect(enhanced).toContain("unsharp=");
  });
});
