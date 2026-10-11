import type { Transform } from "../edit/doc";
import { applyLin, fromLocal, invertLin, linearPart, toLocal, type BoxLook, type CornerKey, type Corners, type Pt } from "./quad";

/**
 * What the preview's handles do (Transform, Skew and Perspective modes): pure maths from the box when
 * the drag started and the pointer (canvas pixels), to the transform to set. lib/player/quad has the
 * geometry; ProgramPlayer only wires pointers to these.
 */

/** The selected clip's box when the drag started: its drawn middle and size, and its size at scale 1. */
export type HandleBox = { cx: number; cy: number; w: number; h: number; unitW: number; unitH: number };

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const sign = (k: CornerKey) => ({ x: k === "tr" || k === "br" ? 1 : -1, y: k === "bl" || k === "br" ? 1 : -1 });
const hasPivot = (p: Pt | undefined) => !!p && (Math.abs(p.x - 0.5) > 1e-9 || Math.abs(p.y - 0.5) > 1e-9);

/** The transform's x / y that put the drawn middle at `c` (the inverse of lib/player/quad pivotCenter). */
export function xyForCenter(c: Pt, w: number, h: number, unitW: number, unitH: number, look: BoxLook, W: number, H: number): { x: number; y: number } {
  let cx = c.x;
  let cy = c.y;
  if (hasPivot(look.pivot)) {
    const p = look.pivot!;
    const a = applyLin(linearPart(look.rotation, look.skewX, look.skewY), { x: (p.x - 0.5) * w, y: (p.y - 0.5) * h });
    cx = c.x - (p.x - 0.5) * unitW + a.x;
    cy = c.y - (p.y - 0.5) * unitH + a.y;
  }
  return { x: r4(clamp((cx - W / 2) / W, -2, 2)), y: r4(clamp((cy - H / 2) / H, -2, 2)) };
}

/**
 * A corner dragged to P: the box resizes keeping its shape and the opposite corner stays put
 * (`free`: width and height each follow the pointer; `fromCenter`: around the middle instead).
 */
export function cornerResize(box: HandleBox, look: BoxLook, t0: Transform, corner: CornerKey, P: Pt, o: { free?: boolean; fromCenter?: boolean }, W: number, H: number): Partial<Transform> | null {
  const q = toLocal(P, box, look);
  if (!q) return null;
  const s = sign(corner);
  const d = { x: (s.x * box.w) / 2, y: (s.y * box.h) / 2 };
  const anchor = o.fromCenter ? { x: 0, y: 0 } : { x: -d.x, y: -d.y };
  const base = { x: d.x - anchor.x, y: d.y - anchor.y };
  if (!o.free) {
    const v = { x: q.x - anchor.x, y: q.y - anchor.y };
    let k = (v.x * base.x + v.y * base.y) / Math.max(1e-9, base.x * base.x + base.y * base.y);
    const scale = r4(clamp(t0.scale * Math.max(k, 1e-3), 0.05, 5));
    k = scale / t0.scale;
    const cl = o.fromCenter ? { x: 0, y: 0 } : { x: anchor.x + (base.x * k) / 2, y: anchor.y + (base.y * k) / 2 };
    const xy = xyForCenter(fromLocal(cl, box, look), box.w * k, box.h * k, box.unitW, box.unitH, look, W, H);
    return { scale, ...xy };
  }
  const sx0 = t0.scaleX ?? 1;
  const sy0 = t0.scaleY ?? 1;
  const size = (along: number, from: number, sg: number, full: number) => (o.fromCenter ? 2 * Math.abs(along) : Math.max(1, sg * (along - from))) / Math.max(1e-9, full);
  const scaleX = r4(clamp(sx0 * size(q.x, anchor.x, s.x, box.w), 0.05, 20));
  const scaleY = r4(clamp(sy0 * size(q.y, anchor.y, s.y, box.h), 0.05, 20));
  const w1 = (box.w * scaleX) / sx0;
  const h1 = (box.h * scaleY) / sy0;
  const cl = o.fromCenter ? { x: 0, y: 0 } : { x: anchor.x + (s.x * w1) / 2, y: anchor.y + (s.y * h1) / 2 };
  const xy = xyForCenter(fromLocal(cl, box, look), w1, h1, box.unitW, box.unitH, look, W, H);
  return { scaleX: scaleX === 1 ? undefined : scaleX, scaleY: scaleY === 1 ? undefined : scaleY, ...xy };
}

export type Edge = "l" | "r" | "t" | "b";

/** A side dragged to P: only the width (l / r) or height (t / b) changes; the opposite side stays put (`fromCenter`: both sides move). */
export function sideStretch(box: HandleBox, look: BoxLook, t0: Transform, edge: Edge, P: Pt, fromCenter: boolean, W: number, H: number): Partial<Transform> | null {
  const q = toLocal(P, box, look);
  if (!q) return null;
  const across = edge === "l" || edge === "r";
  const sg = edge === "r" || edge === "b" ? 1 : -1;
  const full = across ? box.w : box.h;
  const along = across ? q.x : q.y;
  const anchor = fromCenter ? 0 : (-sg * full) / 2;
  const size1 = fromCenter ? 2 * Math.abs(along) : Math.max(1, sg * (along - anchor));
  const key = across ? "scaleX" : "scaleY";
  const s0 = t0[key] ?? 1;
  const s1 = r4(clamp((s0 * size1) / Math.max(1e-9, full), 0.05, 20));
  const len1 = (full * s1) / s0;
  const cl = fromCenter ? { x: 0, y: 0 } : across ? { x: anchor + (sg * len1) / 2, y: 0 } : { x: 0, y: anchor + (sg * len1) / 2 };
  const xy = xyForCenter(fromLocal(cl, box, look), across ? len1 : box.w, across ? box.h : len1, box.unitW, box.unitH, look, W, H);
  return { [key]: s1 === 1 ? undefined : s1, ...xy };
}

/**
 * Text stretches from its anchor (lib/text/render drawText), not its middle: a side of its box dragged to P,
 * with the opposite side kept where it was by moving the text back.
 */
export function textSideStretch(box: { x: number; y: number; w: number; h: number; rot: number }, anchor: Pt, t0: Transform, edge: Edge, P: Pt, W: number, H: number): Partial<Transform> {
  const c = { cx: box.x + box.w / 2, cy: box.y + box.h / 2 };
  const q = toLocal(P, c, { rotation: box.rot }) ?? { x: 0, y: 0 };
  const across = edge === "l" || edge === "r";
  const sg = edge === "r" || edge === "b" ? 1 : -1;
  const full = across ? box.w : box.h;
  const along = across ? q.x : q.y;
  const f0 = Math.max(1, sg * (along + (sg * full) / 2)) / Math.max(1e-9, full);
  const key = across ? "scaleX" : "scaleY";
  const s0 = t0[key] ?? 1;
  const s1 = r4(clamp(s0 * f0, 0.05, 20));
  const f = s1 / s0;
  // the opposite side (canvas, before turning) and the anchor: shift so that side stays
  const e0 = across ? (sg > 0 ? box.x : box.x + box.w) : sg > 0 ? box.y : box.y + box.h;
  const a = across ? anchor.x : anchor.y;
  const d = (1 - f) * (e0 - a);
  return across ? { scaleX: s1 === 1 ? undefined : s1, x: r4(clamp(t0.x + d / W, -2, 2)) } : { scaleY: s1 === 1 ? undefined : s1, y: r4(clamp(t0.y + d / H, -2, 2)) };
}

/** Skew mode: a side's middle follows the pointer along that side (top / bottom: skew X; left / right: skew Y). */
export function skewDrag(box: HandleBox, look: BoxLook, edge: Edge, P: Pt, step = 0): Partial<Transform> {
  const inv = invertLin(linearPart(look.rotation)) ?? [1, 0, 0, 1];
  const q = applyLin(inv, { x: P.x - box.cx, y: P.y - box.cy });
  const deg = (t: number) => {
    let a = (Math.atan(t) * 180) / Math.PI;
    if (step > 0) a = Math.round(a / step) * step;
    return Math.round(clamp(a, -60, 60) * 10) / 10;
  };
  if (edge === "t" || edge === "b") {
    const a = deg(((edge === "b" ? 1 : -1) * q.x) / Math.max(1e-9, box.h / 2));
    return { skewX: a === 0 ? undefined : a };
  }
  const a = deg(((edge === "r" ? 1 : -1) * q.y) / Math.max(1e-9, box.w / 2));
  return { skewY: a === 0 ? undefined : a };
}

export const NO_CORNERS: Corners = { tl: { x: 0, y: 0 }, tr: { x: 0, y: 0 }, br: { x: 0, y: 0 }, bl: { x: 0, y: 0 } };

/** Perspective mode: one corner follows the pointer (in the box's own frame; `along`: only the bigger of the two moves). */
export function cornerPin(box: HandleBox, look: BoxLook, corner: CornerKey, P: Pt, along = false): Corners | null {
  const q = toLocal(P, box, look);
  if (!q) return null;
  const s = sign(corner);
  let dx = (q.x - (s.x * box.w) / 2) / Math.max(1e-9, box.w);
  let dy = (q.y - (s.y * box.h) / 2) / Math.max(1e-9, box.h);
  if (along) {
    if (Math.abs(dx * box.w) >= Math.abs(dy * box.h)) dy = 0;
    else dx = 0;
  }
  const k = look.corners ?? NO_CORNERS;
  return { ...k, [corner]: { x: r4(clamp(dx, -1, 1)), y: r4(clamp(dy, -1, 1)) } };
}

/** The corner-radius dot: how far in from the top-left corner (along the diagonal) the pointer is, as a share of the shorter side (0–0.5). */
export function radiusFromPointer(box: HandleBox, look: BoxLook, P: Pt): number {
  const q = toLocal(P, box, look) ?? { x: -box.w / 2, y: -box.h / 2 };
  const m = Math.max(1e-9, Math.min(box.w, box.h));
  const d = (q.x + box.w / 2 + (q.y + box.h / 2)) / 2;
  return Math.round(clamp(d / m, 0, 0.5) * 1000) / 1000;
}

/** Where the radius dot is for a radius (a share of the shorter side), in the box's own frame. */
export function radiusDotLocal(box: { w: number; h: number }, share: number): Pt {
  // (at least 12 % of the shorter side in, so it never sits on the corner's resize dot)
  const r = Math.max(share, 0.12) * Math.min(box.w, box.h);
  return { x: -box.w / 2 + r, y: -box.h / 2 + r };
}

/**
 * The pivot dot dragged to P (snaps to the middle, the corners and the sides; `free`: no snapping).
 * The picture doesn't move: x / y are changed to keep its drawn middle where it is.
 */
export function pivotFromPointer(box: HandleBox, look: BoxLook, P: Pt, free: boolean, W: number, H: number): Partial<Transform> | null {
  const q = toLocal(P, box, look);
  if (!q) return null;
  const snap = (v: number) => {
    const c = clamp(v, 0, 1);
    if (free) return Math.round(c * 1000) / 1000;
    for (const s of [0, 0.5, 1]) if (Math.abs(c - s) < 0.06) return s;
    return Math.round(c * 1000) / 1000;
  };
  const pivot = { x: snap(q.x / Math.max(1e-9, box.w) + 0.5), y: snap(q.y / Math.max(1e-9, box.h) + 0.5) };
  const xy = xyForCenter({ x: box.cx, y: box.cy }, box.w, box.h, box.unitW, box.unitH, { ...look, pivot }, W, H);
  return { pivot: pivot.x === 0.5 && pivot.y === 0.5 ? undefined : pivot, ...xy };
}

/** Where the pivot dot is on the canvas. */
export function pivotOnCanvas(box: HandleBox, look: BoxLook): Pt {
  const p = look.pivot ?? { x: 0.5, y: 0.5 };
  return fromLocal({ x: (p.x - 0.5) * box.w, y: (p.y - 0.5) * box.h }, box, look);
}
