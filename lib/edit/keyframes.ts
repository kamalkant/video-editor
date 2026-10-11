import { clipLength, MAX_KEYFRAMES, type AnyClip, type ElementClip, type ImageClip, type Keyframe, type TextClip, type Transform, type VideoClip } from "./doc";

/**
 * Keyframes, like CapCut: a keyframe is how a clip looks at one moment (its
 * place, size, angle and opacity). Between two keyframes the clip glides from
 * one look to the next; before the first and after the last it holds still.
 * Times are seconds from the clip's start (timeline time). The export builds
 * the same curves as FFmpeg expressions (lib/player/motion), so the preview
 * and the file match.
 */

export type Motion = { x: number; y: number; scale: number; rotation: number; opacity: number; scaleX: number; scaleY: number; skewX: number; skewY: number };
export const MOTION_PROPS = ["x", "y", "scale", "rotation", "opacity", "scaleX", "scaleY", "skewX", "skewY"] as const;
export type MotionProp = (typeof MOTION_PROPS)[number];
/** A keyframe with every property (older keys have no width / height / skew: the clip's own values). */
export type FullKey = Required<Omit<Keyframe, "ease">> & Pick<Keyframe, "ease">;
/** The new properties (free width / height, skew) aren't stored in keys of clips that can't animate them. */
const EXTRA_PROPS = ["scaleX", "scaleY", "skewX", "skewY"] as const;
/** Clips that can move: video, picture, text, element (placed on a track or not). */
export type MotionClip = VideoClip | ImageClip | TextClip | ElementClip;
export type Ease = NonNullable<Keyframe["ease"]>;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Smooth in and out (the same curve as the transitions: lib/player/transitions ease). */
export const smooth = (p: number) => p * p * (3 - 2 * p);
const frameOf = (t: number, fps: number) => Math.round(t * fps) / fps;

export const keysOf = (c: AnyClip | MotionClip): Keyframe[] => ("keyframes" in c && c.keyframes?.length ? c.keyframes : []);
export const hasKeys = (c: AnyClip | MotionClip) => keysOf(c).length > 0;

/**
 * Which of the extra properties a clip animates: videos and pictures all (the export warps them
 * frame by frame); elements their skew (their width / height is their own shape, re-drawn); text
 * none (its picture is drawn once by the browser: stretched and skewed, but not over time).
 */
export function animatesExtra(c: Pick<AnyClip, "type">, prop: (typeof EXTRA_PROPS)[number]): boolean {
  if (c.type === "video" || c.type === "image") return true;
  if (c.type === "element") return prop === "skewX" || prop === "skewY";
  return false;
}

/** The keys with every property filled in (the clip's own value where a key has none, or can't animate it). */
export function fullKeys(c: MotionClip): FullKey[] {
  const t = c.transform;
  const own = { scaleX: t.scaleX ?? 1, scaleY: t.scaleY ?? 1, skewX: t.skewX ?? 0, skewY: t.skewY ?? 0 };
  return keysOf(c).map((k) => {
    const out = { ...k } as FullKey;
    for (const p of EXTRA_PROPS) out[p] = animatesExtra(c, p) ? (k[p] ?? own[p]) : own[p];
    return out;
  });
}

/** What a new keyframe stores of a look (only what this clip can animate). */
function keyLook(c: MotionClip, m: Motion): Omit<Keyframe, "t"> {
  const out: Record<string, number> = { x: m.x, y: m.y, scale: m.scale, rotation: m.rotation, opacity: m.opacity };
  for (const p of EXTRA_PROPS) if (animatesExtra(c, p)) out[p] = m[p];
  return out as unknown as Omit<Keyframe, "t">;
}

/** The clip's look without keyframes (its transform and opacity). */
export function baseMotion(c: MotionClip): Motion {
  const t = c.transform;
  return { x: t.x, y: t.y, scale: t.scale, rotation: t.rotation ?? 0, opacity: c.opacity ?? 1, scaleX: t.scaleX ?? 1, scaleY: t.scaleY ?? 1, skewX: t.skewX ?? 0, skewY: t.skewY ?? 0 };
}

/** The look `into` seconds into the clip: v0 + Σ Δv · ease(progress of each step). */
export function motionAt(c: MotionClip, into: number): Motion {
  const k = fullKeys(c);
  if (!k.length) return baseMotion(c);
  const m: Motion = { x: k[0].x, y: k[0].y, scale: k[0].scale, rotation: k[0].rotation, opacity: k[0].opacity, scaleX: k[0].scaleX, scaleY: k[0].scaleY, skewX: k[0].skewX, skewY: k[0].skewY };
  for (let i = 0; i < k.length - 1; i++) {
    const a = k[i];
    const b = k[i + 1];
    let p = clamp01((into - a.t) / Math.max(b.t - a.t, 1e-3));
    if (a.ease !== "linear") p = smooth(p);
    if (p === 0) continue;
    for (const prop of MOTION_PROPS) m[prop] += (b[prop] - a[prop]) * p;
  }
  return m;
}

/** The clip's transform at `into` (place, size, angle, width / height and skew from the keyframes; fit, crop, flips, corners and pivot stay). */
export function transformAt(c: MotionClip, into: number): Transform {
  if (!hasKeys(c)) return c.transform;
  const m = motionAt(c, into);
  return {
    ...c.transform,
    x: m.x,
    y: m.y,
    scale: m.scale,
    rotation: m.rotation || undefined,
    scaleX: Math.abs(m.scaleX - 1) > 1e-9 ? m.scaleX : undefined,
    scaleY: Math.abs(m.scaleY - 1) > 1e-9 ? m.scaleY : undefined,
    skewX: m.skewX || undefined,
    skewY: m.skewY || undefined,
  };
}

/** Which properties change over the clip, and their smallest / biggest values (the steps are monotone, so the keys tell). */
export function motionSpan(c: MotionClip): { animated: Record<MotionProp, boolean>; min: Motion; max: Motion; moving: boolean } {
  const len = clipLength(c);
  const samples = [motionAt(c, 0), motionAt(c, len), ...keysOf(c).filter((k) => k.t > 0 && k.t < len).map((k) => motionAt(c, k.t))];
  const min = { ...samples[0] };
  const max = { ...samples[0] };
  for (const s of samples)
    for (const p of MOTION_PROPS) {
      min[p] = Math.min(min[p], s[p]);
      max[p] = Math.max(max[p], s[p]);
    }
  const animated = Object.fromEntries(MOTION_PROPS.map((p) => [p, max[p] - min[p] > 1e-6])) as Record<MotionProp, boolean>;
  return { animated, min, max, moving: MOTION_PROPS.some((p) => animated[p]) };
}

/** Keyframes inside the clip (what the timeline and the inspector show). */
export const visibleKeys = (c: MotionClip): Keyframe[] => {
  const len = clipLength(c);
  return keysOf(c).filter((k) => k.t >= -1e-6 && k.t <= len + 1e-6);
};

/** The keyframe at `into` (within half a frame), or -1. */
export function keyIndexAt(c: MotionClip, into: number, fps: number): number {
  return keysOf(c).findIndex((k) => Math.abs(k.t - into) <= 0.5 / fps + 1e-6);
}

const sorted = (k: Keyframe[]) => [...k].sort((a, b) => a.t - b.t);
/** The patch that stores these keys (none left: the field goes away). */
const withKeys = <C extends MotionClip>(c: C, k: Keyframe[] | undefined): C => ({ ...c, keyframes: k && k.length ? sorted(k) : undefined });

/**
 * Change the clip at `into`. Without keyframes: its transform / opacity, as
 * before. With keyframes: fit, crop and flips still change the whole clip;
 * place, size, angle and opacity change the keyframe at the playhead, or a new
 * keyframe is added there (like CapCut).
 */
export function editAt<C extends MotionClip>(c: C, into: number, fps: number, patch: { transform?: Partial<Transform>; opacity?: number }): C {
  const pt = patch.transform ?? {};
  const opacity = "opacity" in patch && patch.opacity !== undefined ? Math.min(1, Math.max(0, patch.opacity)) : undefined;
  if (!hasKeys(c)) {
    const curT = c.transform;
    let tChanged = false;
    for (const [k, v] of Object.entries(pt)) {
      if (k === "crop") {
        const curCrop = curT.crop;
        const nextCrop = v as Transform["crop"];
        if (curCrop !== nextCrop) {
          if (!curCrop || !nextCrop || curCrop.l !== nextCrop.l || curCrop.t !== nextCrop.t || curCrop.r !== nextCrop.r || curCrop.b !== nextCrop.b) {
            tChanged = true;
            break;
          }
        }
      } else if ((curT as Record<string, unknown>)[k] !== v) {
        tChanged = true;
        break;
      }
    }
    const targetOpacity = opacity === undefined || opacity >= 0.999 ? undefined : opacity;
    const opChanged = "opacity" in patch && c.opacity !== targetOpacity;
    if (!tChanged && !opChanged) return c;
    const next = { ...c, transform: { ...c.transform, ...pt } } as C;
    if ("opacity" in patch) next.opacity = targetOpacity;
    return next;
  }
  // the parts that never move (and, for text and elements, what they can't animate)
  const fixed: Partial<Transform> = {};
  for (const f of ["fit", "crop", "flipX", "flipY", "corners", "pivot"] as const) if (f in pt) (fixed as Record<string, unknown>)[f] = pt[f];
  const mv: Partial<Motion> = {};
  if ("x" in pt && pt.x !== undefined) mv.x = pt.x;
  if ("y" in pt && pt.y !== undefined) mv.y = pt.y;
  if ("scale" in pt && pt.scale !== undefined) mv.scale = pt.scale;
  if ("rotation" in pt && c.type !== "text") mv.rotation = pt.rotation ?? 0;
  if (opacity !== undefined) mv.opacity = opacity;
  for (const p of EXTRA_PROPS) {
    if (!(p in pt)) continue;
    const v = pt[p] ?? (p === "scaleX" || p === "scaleY" ? 1 : 0);
    if (animatesExtra(c, p)) mv[p] = v;
    else (fixed as Record<string, unknown>)[p] = pt[p];
  }
  let next = Object.keys(fixed).length ? ({ ...c, transform: { ...c.transform, ...fixed } } as C) : c;
  if (!Object.keys(mv).length) return next;
  const k = keysOf(next);
  const i = keyIndexAt(next, into, fps);
  if (i >= 0) return withKeys(next, k.map((x, j) => (j === i ? { ...x, ...mv } : x)));
  if (k.length >= MAX_KEYFRAMES) return next;
  const t = frameOf(into, fps);
  // a new keyframe keeps the curve of the step it lands in
  const prev = [...k].reverse().find((x) => x.t < t);
  next = withKeys(next, [...k, { t, ...keyLook(next, motionAt(next, t)), ...mv, ...(prev?.ease ? { ease: prev.ease } : {}) }]);
  return next;
}

/** ◆: add a keyframe at the playhead (the look there), or remove the one that's there. */
export function toggleKey<C extends MotionClip>(c: C, into: number, fps: number): C {
  const i = keyIndexAt(c, into, fps);
  if (i >= 0) return removeKey(c, i, into);
  const k = keysOf(c);
  if (k.length >= MAX_KEYFRAMES) return c;
  const t = frameOf(into, fps);
  const prev = [...k].reverse().find((x) => x.t < t);
  return withKeys(c, [...k, { t, ...keyLook(c, motionAt(c, t)), ...(prev?.ease ? { ease: prev.ease } : {}) }]);
}

/**
 * Remove keyframe `i`. When no keyframe is left inside the clip, the clip keeps
 * the look it has at `into` (the playhead) and stops moving.
 */
export function removeKey<C extends MotionClip>(c: C, i: number, into: number): C {
  const k = keysOf(c).filter((_, j) => j !== i);
  const len = clipLength(c);
  if (k.some((x) => x.t >= -1e-6 && x.t <= len + 1e-6)) return withKeys(c, k);
  const m = motionAt(c, into);
  const transform: Transform = { ...c.transform, x: m.x, y: m.y, scale: m.scale, rotation: c.type === "text" ? c.transform.rotation : m.rotation || undefined };
  // (the look it has there, for what it animated)
  if (animatesExtra(c, "scaleX")) transform.scaleX = Math.abs(m.scaleX - 1) > 1e-9 ? m.scaleX : undefined;
  if (animatesExtra(c, "scaleY")) transform.scaleY = Math.abs(m.scaleY - 1) > 1e-9 ? m.scaleY : undefined;
  if (animatesExtra(c, "skewX")) transform.skewX = m.skewX || undefined;
  if (animatesExtra(c, "skewY")) transform.skewY = m.skewY || undefined;
  return { ...c, transform, opacity: m.opacity >= 0.999 ? undefined : m.opacity, keyframes: undefined };
}

/** Move keyframe `i` to `to` seconds (a frame, between its neighbours, inside the clip). */
export function moveKey<C extends MotionClip>(c: C, i: number, to: number, fps: number): C {
  const k = keysOf(c);
  if (!k[i]) return c;
  const step = 1 / fps;
  const lo = Math.max(0, i > 0 ? k[i - 1].t + step : 0);
  const hi = Math.min(clipLength(c), i < k.length - 1 ? k[i + 1].t - step : Infinity);
  if (hi < lo) return c;
  const t = Math.min(hi, Math.max(lo, frameOf(to, fps)));
  return withKeys(c, k.map((x, j) => (j === i ? { ...x, t } : x)));
}

/** How keyframe `i` moves on to the next one. */
export function setKeyEase<C extends MotionClip>(c: C, i: number, ease: Ease): C {
  const k = keysOf(c);
  if (!k[i]) return c;
  return withKeys(
    c,
    k.map((x, j) => {
      if (j !== i) return x;
      const { ease: _old, ...rest } = x;
      void _old;
      // smooth is the default: not stored
      return ease === "smooth" ? rest : { ...rest, ease };
    }),
  );
}

// ---------- when a clip is cut, trimmed or sped up ----------

/**
 * Keep only the keys that matter for a clip of `len` seconds: all inside, and
 * the nearest one on each side (the motion into and out of the clip stays exactly the same).
 */
export function pruneKeys(k: Keyframe[] | undefined, len: number): Keyframe[] | undefined {
  if (!k?.length) return undefined;
  const s = sorted(k);
  const inside = s.filter((x) => x.t >= -1e-6 && x.t <= len + 1e-6);
  const before = s.filter((x) => x.t < -1e-6).pop();
  const after = s.find((x) => x.t > len + 1e-6);
  const out = [...(before ? [before] : []), ...inside, ...(after ? [after] : [])];
  return out.length ? out : undefined;
}

/** The keys of a part of the clip that starts `offset` seconds in and lasts `len` (shifted, pruned; never new keys). */
export const keysForPart = (k: Keyframe[] | undefined, offset: number, len: number) => pruneKeys(k?.map((x) => ({ ...x, t: x.t - offset })), len);

/** A speed change stretches the clip: the keys stay on the same moments of the video. */
export const scaleKeyTimes = (k: Keyframe[] | undefined, f: number) => (k?.length ? k.map((x) => ({ ...x, t: x.t * f })) : k);

/** Keys cleaned up after loading: sorted, no two on the same frame. */
export function cleanKeys(k: Keyframe[] | undefined, fps: number): Keyframe[] | undefined {
  if (!k?.length) return undefined;
  const out: Keyframe[] = [];
  for (const x of sorted(k)) if (!out.length || x.t - out[out.length - 1].t >= 0.5 / Math.max(1, fps)) out.push(x);
  return out;
}

/**
 * How a text clip's picture is drawn for the export: a moving text is drawn
 * once at its biggest size (and at its home place), then scaled and moved
 * frame by frame (lib/render/compose; the preview does the same).
 */
export function textRenderTransform(c: TextClip): Transform {
  if (!hasKeys(c)) return c.transform;
  const span = motionSpan(c);
  return span.moving ? { ...c.transform, x: 0, y: 0, scale: span.max.scale } : transformAt(c, 0);
}
