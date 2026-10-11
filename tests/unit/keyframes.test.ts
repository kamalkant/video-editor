import { describe, expect, it } from "vitest";
import { asSingleVideo, docFromSpec, docSchema, emptyDoc, imageClipOf, mainTrack, type ImageClip, type Keyframe, type MediaLite, type TimelineDoc, type VideoClip } from "@/lib/edit/doc";
import { editAt, fullKeys, keysForPart, motionAt, moveKey, pruneKeys, removeKey, setKeyEase, toggleKey, transformAt, visibleKeys } from "@/lib/edit/keyframes";
import { DEFAULT_SPEC } from "@/lib/edit/spec";
import { motionRect, staticTransformAt } from "@/lib/player/layout";
import { motionExpr } from "@/lib/player/motion";

const IMG = "33333333-3333-4333-8333-333333333333";
const V = "11111111-1111-4111-8111-111111111111";
const pic: MediaLite = { id: IMG, kind: "image", fileName: "p.png", width: 800, height: 600, fps: 0, duration: 0, hasAudio: false, suggestedKey: null, keyKind: null };
const K = (t: number, v: Partial<Keyframe> = {}): Keyframe => ({ t, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, ...v });
const clip = (keys?: Keyframe[], duration = 4): ImageClip => ({ ...imageClipOf("p1", pic, duration), keyframes: keys });

/** Turn an FFmpeg expression back into a JS function of the time (to check it against motionAt). */
function evalExpr(e: string, tau: string) {
  const js = e.replaceAll("\\,", ",").replaceAll(tau, "T");
  return new Function("T", "clip", `return ${js};`) as (T: number, clip: (v: number, a: number, b: number) => number) => number;
}
const clip3 = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

describe("keyframes: the look at any moment", () => {
  it("no keys: the clip's own transform and opacity", () => {
    const c = { ...clip(), opacity: 0.5 };
    expect(motionAt(c, 1)).toEqual({ x: 0, y: 0, scale: 1, rotation: 0, opacity: 0.5, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 });
  });
  it("older keys (no width / height / skew) still play, with the clip's own stretch and skew", () => {
    const c = { ...clip([K(0, { x: 0 }), K(2, { x: 1 })]), transform: { fit: "fit" as const, x: 0, y: 0, scale: 1, scaleX: 1.5, skewX: 10 } };
    const m = motionAt(c, 1);
    expect(m.x).toBeCloseTo(0.5, 6);
    expect(m.scaleX).toBe(1.5);
    expect(m.skewX).toBe(10);
    expect(transformAt(c, 1)).toMatchObject({ scaleX: 1.5, skewX: 10 });
  });
  it("width / height and skew animate on videos and pictures, and the FFmpeg expressions agree", () => {
    const keyed = editAt(toggleKey(clip(), 0, 30), 2, 30, { transform: { scaleX: 2, skewY: -20 } });
    expect(keyed.keyframes).toHaveLength(2);
    expect(motionAt(keyed, 1).scaleX).toBeCloseTo(1.5, 6);
    expect(motionAt(keyed, 1).skewY).toBeCloseTo(-10, 6);
    for (const prop of ["scaleX", "skewY"] as const) {
      const f = evalExpr(motionExpr(fullKeys(keyed), prop, "(t-2)"), "(t-2)");
      for (let t = -0.5; t <= 3.5; t += 0.137) expect(f(t, clip3)).toBeCloseTo(motionAt(keyed, t)[prop], 3);
    }
    // removing the last key leaves the look it had at the playhead
    const still = removeKey(removeKey(keyed, 1, 2), 0, 2);
    expect(still.keyframes).toBeUndefined();
  });
  it("text keeps its stretch and skew still (its picture is drawn once): they go on the clip, not into a key", () => {
    const text = { id: "t1", start: 0, type: "text" as const, text: "Hi", style: { preset: "title" as const, font: "sans" as const, size: 64, color: "#ffffff", box: "none" as const, align: "center" as const, bold: true, accent: "#ffffff", shadow: false }, duration: 4, transform: { fit: "fit" as const, x: 0, y: 0, scale: 1 }, anim: { in: "none" as const, out: "none" as const }, fadeIn: 0, fadeOut: 0, keyframes: [K(0), K(2, { x: 0.2 })] };
    const e = editAt(text, 2, 30, { transform: { scaleX: 1.4, skewX: 12 } });
    expect(e.transform).toMatchObject({ scaleX: 1.4, skewX: 12 });
    expect(e.keyframes!.every((k) => k.scaleX === undefined && k.skewX === undefined)).toBe(true);
    expect(motionAt(e, 1)).toMatchObject({ scaleX: 1.4, skewX: 12 });
  });
  it("one key: that look, the whole clip", () => {
    const c = clip([K(1, { scale: 2 })]);
    expect(motionAt(c, 0).scale).toBe(2);
    expect(motionAt(c, 3).scale).toBe(2);
  });
  it("smooth by default (a quarter of the way: 15.6 %), linear when asked; holds before and after", () => {
    const c = clip([K(0, { x: 0 }), K(4, { x: 1 })]);
    expect(motionAt(c, 1).x).toBeCloseTo(0.15625, 6);
    expect(motionAt(c, 2).x).toBeCloseTo(0.5, 6);
    const lin = clip([K(0, { x: 0, ease: "linear" }), K(4, { x: 1 })]);
    expect(motionAt(lin, 1).x).toBeCloseTo(0.25, 6);
    expect(motionAt(c, -1).x).toBe(0);
    expect(motionAt(c, 9).x).toBe(1);
  });
  it("the FFmpeg expression gives the same numbers", () => {
    const keys = [K(0, { x: 0, scale: 1, opacity: 1 }), K(1.5, { x: 0.3, scale: 2, opacity: 0.2, ease: "linear" }), K(3, { x: -0.2, scale: 0.5, opacity: 0.9 })];
    const c = clip(keys);
    for (const prop of ["x", "scale", "opacity"] as const) {
      const f = evalExpr(motionExpr(fullKeys(c), prop, "(t-2)"), "(t-2)");
      for (let t = -0.5; t <= 3.5; t += 0.137) expect(f(t, clip3)).toBeCloseTo(motionAt(c, t)[prop], 3);
    }
  });
  it("text turns with keyframes", () => {
    const text = { id: "t1", start: 0, type: "text" as const, text: "Hi", style: { preset: "title" as const, font: "sans" as const, size: 64, color: "#ffffff", box: "none" as const, align: "center" as const, bold: true, accent: "#ffffff", shadow: false }, duration: 4, transform: { fit: "fit" as const, x: 0, y: 0, scale: 1 }, anim: { in: "none" as const, out: "none" as const }, fadeIn: 0, fadeOut: 0, keyframes: [K(0), K(2, { rotation: 90 })] };
    expect(motionAt(text, 2).rotation).toBe(90);
  });
});

describe("keyframes: editing (like CapCut)", () => {
  it("without keys a change is the clip's own; with keys it goes into a keyframe at the playhead", () => {
    const plain = editAt(clip(), 1, 30, { transform: { scale: 2 } });
    expect(plain.transform.scale).toBe(2);
    expect(plain.keyframes).toBeUndefined();
    const keyed = toggleKey(clip(), 0, 30);
    expect(keyed.keyframes).toHaveLength(1);
    // at 2 s: a new keyframe, with the other values as they are there
    const two = editAt(keyed, 2, 30, { transform: { scale: 2 } });
    expect(visibleKeys(two).map((k) => [k.t, k.scale])).toEqual([[0, 1], [2, 2]]);
    // at (almost) the same moment again: that keyframe changes, no new one
    const same = editAt(two, 2 + 0.01, 30, { transform: { x: 0.5 } });
    expect(visibleKeys(same)).toHaveLength(2);
    expect(same.keyframes![1]).toMatchObject({ x: 0.5, scale: 2 });
    // fit and crop change the whole clip, not a keyframe
    const fill = editAt(same, 1, 30, { transform: { fit: "fill" } });
    expect(fill.transform.fit).toBe("fill");
    expect(fill.keyframes).toHaveLength(2);
    // opacity: 1 isn't stored
    expect(editAt(clip(), 0, 30, { opacity: 1 }).opacity).toBeUndefined();
    expect(editAt(clip(), 0, 30, { opacity: 0.4 }).opacity).toBe(0.4);
  });
  it("◆ removes the keyframe at the playhead; the last one leaves the clip where it is", () => {
    const c = clip([K(0, { scale: 1 }), K(2, { scale: 3 })]);
    const one = toggleKey(c, 2, 30);
    expect(one.keyframes).toHaveLength(1);
    const none = removeKey(one, 0, 1);
    expect(none.keyframes).toBeUndefined();
    expect(none.transform.scale).toBe(1);
  });
  it("moving a keyframe stays between its neighbours, on frames; ease is stored only when linear", () => {
    const c = clip([K(0), K(1), K(2)]);
    expect(moveKey(c, 1, 5, 30).keyframes![1].t).toBeCloseTo(2 - 1 / 30, 6);
    expect(moveKey(c, 1, 0.52, 10).keyframes![1].t).toBeCloseTo(0.5, 6);
    expect(setKeyEase(c, 0, "linear").keyframes![0].ease).toBe("linear");
    expect(setKeyEase(setKeyEase(c, 0, "linear"), 0, "smooth").keyframes![0]).not.toHaveProperty("ease");
  });
});

describe("keyframes: cutting and trimming keep the motion exactly", () => {
  const keys = [K(0, { x: 0 }), K(1, { x: 0.4 }), K(3, { x: -0.2, scale: 2 }), K(4, { x: 0 })];
  it("a part of the clip moves exactly as before", () => {
    const full = clip(keys, 4);
    const part = clip(keysForPart(keys, 1.5, 2), 2);
    for (let t = 0; t <= 2; t += 0.1) expect(motionAt(part, t).x).toBeCloseTo(motionAt(full, t + 1.5).x, 9);
    // only what matters is kept: the ones inside and one on each side
    expect(part.keyframes!.map((k) => k.t)).toEqual([-0.5, 1.5, 2.5]);
  });
  it("prune keeps the neighbours outside", () => {
    expect(pruneKeys(keys, 0.5)!.map((k) => k.t)).toEqual([0, 1]);
    expect(pruneKeys(undefined, 3)).toBeUndefined();
  });
});

describe("keyframes: on the canvas, saved, exported", () => {
  it("the rectangle follows the keys; the fit comes from the clip's own angle (no jump at 90°)", () => {
    const c = clip([K(0, { rotation: 0 }), K(2, { rotation: 90, scale: 2 })]);
    const a = motionRect(800, 600, 1920, 1080, c, 0);
    const b = motionRect(800, 600, 1920, 1080, c, 2);
    expect(b.w).toBeCloseTo(a.w * 2, 6);
    expect(b.rot).toBe(90);
    // a still picture of the moment looks the same (its quarter-turn fit made up for)
    const st = staticTransformAt(800, 600, 1920, 1080, c, 2);
    expect(st.rotation).toBe(90);
    const shown = motionRect(800, 600, 1920, 1080, { ...c, keyframes: undefined, transform: st }, 0);
    expect(shown.w).toBeCloseTo(b.w, 3);
  });
  it("saved with the project (a key before the start too); the quick single-video export isn't used", () => {
    const d = docFromSpec(DEFAULT_SPEC, { id: V, kind: "video", fileName: "v.mp4", width: 1280, height: 720, fps: 30, duration: 4, hasAudio: true, suggestedKey: null, keyKind: null });
    const withKeys = { ...d, tracks: d.tracks.map((t) => (t.kind === "main" ? { ...t, clips: t.clips.map((c) => ({ ...c, keyframes: [K(-0.5), K(2, { scale: 2 })] })) } : t)) };
    const parsed = docSchema.parse(withKeys);
    expect((mainTrack(parsed).clips[0] as VideoClip).keyframes).toHaveLength(2);
    expect(asSingleVideo(d)).not.toBeNull();
    expect(asSingleVideo(parsed)).toBeNull();
  });
  it("transformAt keeps fit, crop and flips", () => {
    const c = { ...clip([K(0, { x: 0.2 })]), transform: { fit: "fill" as const, x: 0, y: 0, scale: 1, flipX: true } };
    expect(transformAt(c, 1)).toMatchObject({ fit: "fill", flipX: true, x: 0.2 });
  });
});

describe("keyframes through timeline edits", () => {
  const vid: MediaLite = { id: V, kind: "video", fileName: "v.mp4", width: 1280, height: 720, fps: 30, duration: 10, hasAudio: true, suggestedKey: null, keyKind: null };
  const keys = [K(0, { x: -0.4 }), K(2, { x: 0.4, scale: 2 }), K(6, { x: 0, scale: 1 })];
  const base = () => {
    const d = docFromSpec(DEFAULT_SPEC, vid);
    return { ...d, tracks: d.tracks.map((t) => (t.kind === "main" ? { ...t, clips: t.clips.map((c) => ({ ...c, keyframes: keys })) } : t)) } as TimelineDoc;
  };
  // the look at timeline time T, wherever the clip (or its parts) now are
  const lookAt = (d: TimelineDoc, T: number) => {
    const main = mainTrack(d);
    let s = 0;
    for (const c of main.clips) {
      const len = (c.type === "video" ? (c.out - c.in) / (c.speed ?? 1) : 0) as number;
      if (T >= s - 1e-9 && T <= s + len + 1e-9) return motionAt(c as never, T - s);
      s += len;
    }
    return null;
  };
  it("split: both parts move exactly as the whole did", async () => {
    const { splitClip } = await import("@/lib/edit/docEdit");
    const d0 = base();
    const d1 = splitClip(d0, mainTrack(d0).clips[0].id, 3.5).doc;
    expect(mainTrack(d1).clips).toHaveLength(2);
    for (let T = 0; T <= 10; T += 0.25) expect(lookAt(d1, T)!.x).toBeCloseTo(lookAt(d0, T)!.x, 9);
  });
  it("trim the start: the rest keeps its motion (keys shift)", async () => {
    const { trimClip } = await import("@/lib/edit/docEdit");
    const d0 = base();
    const d1 = trimClip(d0, mainTrack(d0).clips[0].id, "in", 1, () => vid);
    for (let T = 0; T <= 9; T += 0.25) expect(lookAt(d1, T)!.x).toBeCloseTo(lookAt(d0, T + 1)!.x, 9);
  });
  it("2× speed: the keys stay on the same moments of the video", async () => {
    const { setClip } = await import("@/lib/edit/docEdit");
    const d0 = base();
    const d1 = setClip(d0, mainTrack(d0).clips[0].id, { speed: 2 });
    expect((mainTrack(d1).clips[0] as VideoClip).keyframes!.map((k) => k.t)).toEqual([0, 1, 3]);
  });
  it("remove silences: each piece moves like its part", async () => {
    const { removeRangesInClip } = await import("@/lib/edit/docEdit");
    const d0 = base();
    const d1 = removeRangesInClip(d0, mainTrack(d0).clips[0].id, [{ start: 3, end: 4 }]);
    expect(mainTrack(d1).clips).toHaveLength(2);
    expect(lookAt(d1, 1)!.x).toBeCloseTo(lookAt(d0, 1)!.x, 9);
    expect(lookAt(d1, 5)!.x).toBeCloseTo(lookAt(d0, 6)!.x, 9);
  });
  it("editClipAt / keyframeOp: the playhead's time inside the clip", async () => {
    const { editClipAt, keyframeOp } = await import("@/lib/edit/docEdit");
    const d0 = base();
    const id = mainTrack(d0).clips[0].id;
    const d1 = editClipAt(d0, id, 4, { transform: { scale: 3 } });
    expect(visibleKeys(mainTrack(d1).clips[0] as never).map((k) => k.t)).toEqual([0, 2, 4, 6]);
    const d2 = keyframeOp(d1, id, 4, { kind: "toggle" });
    expect(visibleKeys(mainTrack(d2).clips[0] as never)).toHaveLength(3);
  });

  it("editAt / editClipAt returns original reference when transform/opacity unchanged", async () => {
    const { editClipAt } = await import("@/lib/edit/docEdit");
    const { editAt } = await import("@/lib/edit/keyframes");
    const d0 = emptyDoc();
    const clip: VideoClip = {
      id: "v1",
      type: "video",
      mediaId: "m1",
      in: 0,
      out: 5,
      volume: 1,
      muted: false,
      speed: 1,
      fadeIn: 0,
      fadeOut: 0,
      transform: { fit: "fit", x: 0, y: 0, scale: 1 },
      ops: [],
    };
    // non-keyed clip: editAt with identical scale and same opacity returns same clip
    const c1 = editAt(clip, 2, 30, { transform: { scale: 1 } });
    expect(c1).toBe(clip);

    const dWithClip = {
      ...d0,
      tracks: [{ id: "t1", kind: "main" as const, locked: false, muted: false, clips: [clip] }],
    };
    const dUnchanged = editClipAt(dWithClip, "v1", 2, { transform: { scale: 1 } });
    expect(dUnchanged).toBe(dWithClip);
  });
});
