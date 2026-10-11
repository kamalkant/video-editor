import type { Transform } from "../edit/doc";
import { hasKeys, motionAt, type MotionClip } from "../edit/keyframes";
import { placeClip, rotationOf } from "./look";
import { pivotCenter } from "./quad";

/** The picture's size at scale 1, without stretch or pivot (what keyframed sizes multiply). */
const unitOf = (t: Transform): Transform => ({ ...t, x: 0, y: 0, scale: 1, scaleX: undefined, scaleY: undefined, pivot: undefined });

export type Rect = { x: number; y: number; w: number; h: number };

/** Preview zoom sizes (1 = fit the frame): fine steps near fit, bigger ones further out. */
export const PREVIEW_ZOOMS = [0.25, 0.5, 0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.1, 1.25, 1.5, 2, 3, 4];

/** The next zoom size in or out (−/+); stays put at the ends. From an odd size (⌘ + scroll), the nearest step that way. */
export function nextZoom(z: number, dir: 1 | -1): number {
  const Z = PREVIEW_ZOOMS;
  return dir > 0 ? (Z.find((x) => x > z + 1e-6) ?? Z[Z.length - 1]) : ([...Z].reverse().find((x) => x < z - 1e-6) ?? Z[0]);
}

/**
 * Where a picture of size (w × h) lands on a canvas (W × H): fit (all of it
 * visible) or fill (covers the canvas), then scaled and moved. The export
 * (FFmpeg scale/pad/overlay) uses the same numbers, so preview = file.
 */
export function placeRect(w: number, h: number, W: number, H: number, t: Transform): Rect {
  if (!w || !h) return { x: 0, y: 0, w: W, h: H };
  // cropped and turned pictures: lib/player/look (the rectangle is before turning; it turns around its middle)
  const p = placeClip(w, h, W, H, t);
  return { x: p.cx - p.w / 2, y: p.cy - p.h / 2, w: p.w, h: p.h };
}

/**
 * Crop mode: the whole (uncropped) picture, standing still while the crop box
 * moves over it. It stays where the picture would be without its crop; when
 * that doesn't fit on the canvas (fill, zoomed in) the whole picture is fitted
 * and centred instead, so every edge can be reached.
 */
export function cropViewRect(w: number, h: number, W: number, H: number, t: Transform): Rect {
  const own: Transform = { ...t, crop: undefined };
  const a = (rotationOf(t) * Math.PI) / 180;
  // the turned picture's outline on the canvas
  const bounds = (q: Rect) => {
    const bw = Math.abs(q.w * Math.cos(a)) + Math.abs(q.h * Math.sin(a));
    const bh = Math.abs(q.w * Math.sin(a)) + Math.abs(q.h * Math.cos(a));
    return { x0: q.x + q.w / 2 - bw / 2, y0: q.y + q.h / 2 - bh / 2, bw, bh };
  };
  const r = placeRect(w, h, W, H, own);
  const b = bounds(r);
  const e = 0.5;
  if (b.x0 >= -e && b.y0 >= -e && b.x0 + b.bw <= W + e && b.y0 + b.bh <= H + e) return r;
  const f = placeRect(w, h, W, H, { ...own, fit: "fit", x: 0, y: 0, scale: 1 });
  const fb = bounds(f);
  const k = Math.min(1, W / fb.bw, H / fb.bh);
  return { x: W / 2 - (f.w * k) / 2, y: H / 2 - (f.h * k) / 2, w: f.w * k, h: f.h * k };
}

/**
 * A picture placed like a logo: `share` of the canvas width, its middle at `pt`
 * (shares of the canvas), kept inside the canvas. (A picture dropped on the preview.)
 */
export function logoTransform(pt: { x: number; y: number }, iw: number, ih: number, W: number, H: number, share = 0.2): Transform {
  const w0 = Math.max(1, iw);
  const h0 = Math.max(1, ih);
  const fit = Math.min(W / w0, H / h0);
  const scale = Math.min(5, Math.max(0.05, (W * share) / (w0 * fit)));
  const w = w0 * fit * scale;
  const h = h0 * fit * scale;
  const cx = Math.min(W - w / 2, Math.max(w / 2, pt.x * W));
  const cy = Math.min(H - h / 2, Math.max(h / 2, pt.y * H));
  const r4 = (v: number) => Math.round(v * 10000) / 10000;
  return { fit: "fit", x: r4(cx / W - 0.5), y: r4(cy / H - 0.5), scale: r4(scale) };
}

/**
 * Where a clip is at `into` seconds (its keyframes move it): the rectangle
 * before turning, the angle, and the opacity. Without keyframes this is just
 * placeRect. The fit (and a quarter turn's) comes from the clip's own static
 * transform, so a keyframed turn to 90° doesn't make the size jump.
 */
export function motionRect(w: number, h: number, W: number, H: number, c: MotionClip, into: number): Rect & { rot: number; opacity: number } {
  if (!hasKeys(c)) return { ...placeRect(w, h, W, H, c.transform), rot: rotationOf(c.transform), opacity: c.opacity ?? 1 };
  const m = motionAt(c, into);
  const unit = placeRect(w, h, W, H, unitOf(c.transform));
  const cw = unit.w * m.scale * m.scaleX;
  const ch = unit.h * m.scale * m.scaleY;
  // (it turns, sizes and skews around its pivot: lib/player/quad)
  const p = pivotCenter(W / 2 + m.x * W, H / 2 + m.y * H, cw, ch, unit.w, unit.h, { rotation: m.rotation, skewX: m.skewX, skewY: m.skewY, pivot: c.transform.pivot });
  return { x: p.x - cw / 2, y: p.y - ch / 2, w: cw, h: ch, rot: m.rotation, opacity: m.opacity };
}

/**
 * The biggest picture a moving clip is built at (its size at its biggest
 * scale, at most 4 × the canvas area): the export makes the looks (mask,
 * vignette…) at this size once, then scales it down frame by frame.
 * Returns the scale that size stands for.
 */
export function workScale(unitW: number, unitH: number, maxScale: number, W: number, H: number): number {
  const cap = Math.sqrt((4 * W * H) / Math.max(1, unitW * unitH));
  return Math.max(0.05, Math.min(maxScale, cap));
}

/**
 * A still transform that looks like the moving clip at `into` (freeze frame):
 * the angle's quarter-turn fit is made up for in the scale.
 */
export function staticTransformAt(w: number, h: number, W: number, H: number, c: MotionClip, into: number): Transform {
  if (!hasKeys(c)) return c.transform;
  const m = motionAt(c, into);
  const unit = placeRect(w, h, W, H, unitOf(c.transform));
  const turned: Transform = {
    ...c.transform,
    x: m.x,
    y: m.y,
    scale: 1,
    rotation: m.rotation || c.transform.rotation || undefined,
    scaleX: Math.abs(m.scaleX - 1) > 1e-9 ? m.scaleX : undefined,
    scaleY: Math.abs(m.scaleY - 1) > 1e-9 ? m.scaleY : undefined,
    skewX: m.skewX || undefined,
    skewY: m.skewY || undefined,
  };
  const unit2 = placeRect(w, h, W, H, unitOf(turned));
  return { ...turned, scale: Math.min(5, Math.max(0.05, (m.scale * unit.w) / Math.max(1e-6, unit2.w))) };
}

/** Opacity for fades at time `into` seconds into a clip of length `len`. */
export function fadeAlpha(into: number, len: number, fadeIn: number, fadeOut: number): number {
  let a = 1;
  if (fadeIn > 0 && into < fadeIn) a = Math.min(a, Math.max(0, into / fadeIn));
  if (fadeOut > 0 && into > len - fadeOut) a = Math.min(a, Math.max(0, (len - into) / fadeOut));
  return a;
}

/**
 * A side handle (l / r / t / b) dragged by (sx, sy) project px: the box grows or shrinks evenly
 * and the opposite side stays put (it follows the box's turn). `rect` is the box before (turning
 * around its middle by `rot`°); `pivot` is the point its size grows from (the middle; text: its anchor).
 * Returns the new scale and how far to move (project px).
 */
export function sideScale(rect: Rect & { rot: number }, edge: "l" | "r" | "t" | "b", sx: number, sy: number, scale0: number, pivot?: { x: number; y: number }, min = 0.05, max = 5): { scale: number; dx: number; dy: number } {
  const a = (rect.rot * Math.PI) / 180;
  const across = edge === "l" || edge === "r";
  const ax = across ? Math.cos(a) : -Math.sin(a);
  const ay = across ? Math.sin(a) : Math.cos(a);
  const sign = edge === "r" || edge === "b" ? 1 : -1;
  const len = Math.max(1e-6, across ? rect.w : rect.h);
  const d = (sx * ax + sy * ay) * sign;
  const scale = Math.min(max, Math.max(min, Math.round(scale0 * Math.max(0, (len + d) / len) * 1000) / 1000));
  const k = scale / scale0;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const q = pivot ?? { x: cx, y: cy };
  // the opposite side's middle, after growing around q; moved back along the axis
  const ox = cx - ax * sign * (len / 2);
  const oy = cy - ay * sign * (len / 2);
  const back = ((ox - q.x) * (1 - k)) * ax + ((oy - q.y) * (1 - k)) * ay;
  return { scale, dx: ax * back, dy: ay * back };
}
