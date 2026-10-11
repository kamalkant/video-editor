import { describe, expect, it } from "vitest";
import type { Transform } from "@/lib/edit/doc";
import { cornerPin, cornerResize, pivotFromPointer, pivotOnCanvas, radiusDotLocal, radiusFromPointer, sideStretch, skewDrag, textSideStretch, type HandleBox } from "@/lib/player/handles";
import { placeClip } from "@/lib/player/look";
import { boxQuad, fromLocal, type BoxLook } from "@/lib/player/quad";

// a 640 × 360 picture on a 1920 × 1080 canvas (fit: 3×, so its box at scale 1 is 1920 × 1080)
const W = 1920;
const H = 1080;
const SW = 640;
const SH = 360;
const look = (t: Transform): BoxLook => ({ rotation: t.rotation, skewX: t.skewX, skewY: t.skewY, pivot: t.pivot, corners: t.corners });
function boxOf(t: Transform): HandleBox {
  const p = placeClip(SW, SH, W, H, t);
  return { cx: p.cx, cy: p.cy, w: p.w, h: p.h, unitW: p.w / (t.scale * (t.scaleX ?? 1)), unitH: p.h / (t.scale * (t.scaleY ?? 1)) };
}
const quadOf = (t: Transform) => boxQuad(boxOf(t), look(t));
const near = (a: { x: number; y: number }, b: { x: number; y: number }, px = 0.5) => expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(px);
const T0: Transform = { fit: "fit", x: 0.05, y: -0.02, scale: 0.4, rotation: 28 };

describe("Transform mode handles", () => {
  it("a corner resizes keeping the shape, and the opposite corner stays put (turned too)", () => {
    const q0 = quadOf(T0);
    const p = { x: q0[2].x + 90, y: q0[2].y + 30 };
    const t1 = { ...T0, ...cornerResize(boxOf(T0), look(T0), T0, "br", p, {}, W, H) };
    const q1 = quadOf(t1);
    near(q1[0], q0[0]);
    expect(t1.scale).toBeGreaterThan(T0.scale);
    const b0 = boxOf(T0);
    const b1 = boxOf(t1);
    expect(b1.w / b1.h).toBeCloseTo(b0.w / b0.h, 6);
  });
  it("Shift: the width and height follow the pointer each (the shape changes); Alt: around the middle", () => {
    const q0 = quadOf(T0);
    const p = fromLocal({ x: boxOf(T0).w / 2 + 120, y: boxOf(T0).h / 2 - 40 }, boxOf(T0), look(T0));
    const free = { ...T0, ...cornerResize(boxOf(T0), look(T0), T0, "br", p, { free: true }, W, H) };
    near(quadOf(free)[0], q0[0]);
    near(quadOf(free)[2], p, 1);
    expect(free.scaleX).toBeGreaterThan(1);
    expect(free.scaleY).toBeLessThan(1);
    const mid = { ...T0, ...cornerResize(boxOf(T0), look(T0), T0, "br", p, { fromCenter: true }, W, H) };
    near({ x: boxOf(mid).cx, y: boxOf(mid).cy }, { x: boxOf(T0).cx, y: boxOf(T0).cy });
  });
  it("a side stretches only the width (or height); the opposite side stays", () => {
    const b0 = boxOf(T0);
    const p = fromLocal({ x: b0.w / 2 + 150, y: 33 }, b0, look(T0));
    const t1 = { ...T0, ...sideStretch(b0, look(T0), T0, "r", p, false, W, H) };
    const b1 = boxOf(t1);
    // (the size is kept to 4 decimals: within a hundredth of a pixel)
    expect(b1.w).toBeCloseTo(b0.w + 150, 1);
    expect(b1.h).toBeCloseTo(b0.h, 6);
    near(quadOf(t1)[0], quadOf(T0)[0]);
    near(quadOf(t1)[3], quadOf(T0)[3]);
    const p2 = fromLocal({ x: 0, y: -b0.h / 2 - 60 }, b0, look(T0));
    const t2 = { ...T0, ...sideStretch(b0, look(T0), T0, "t", p2, false, W, H) };
    expect(boxOf(t2).h).toBeCloseTo(b0.h + 60, 1);
    near(quadOf(t2)[2], quadOf(T0)[2]);
  });
  it("with a pivot set, resizing still keeps the opposite corner", () => {
    const t = { ...T0, pivot: { x: 0.2, y: 0.9 } };
    const q0 = quadOf(t);
    const t1 = { ...t, ...cornerResize(boxOf(t), look(t), t, "tl", { x: q0[0].x - 40, y: q0[0].y - 70 }, {}, W, H) };
    near(quadOf(t1)[2], q0[2]);
  });
  it("text stretches from its anchor; the opposite side is put back", () => {
    const box = { x: 400, y: 600, w: 500, h: 120, rot: 0 };
    const anchor = { x: 960, y: 720 };
    const t0: Transform = { fit: "fit", x: 0, y: 0, scale: 1 };
    const r = textSideStretch(box, anchor, t0, "r", { x: 1000, y: 650 }, W, H);
    expect(r.scaleX).toBeCloseTo(600 / 500, 4);
    // the left side: anchor + 1.2·(400 − 960) + shift = 400
    expect(Math.abs(anchor.x + (r.scaleX ?? 1) * (box.x - anchor.x) + (r.x ?? 0) * W - 400)).toBeLessThan(0.2);
  });
});

describe("Skew and Perspective modes, the radius and the pivot", () => {
  it("skew: the bottom side's middle follows the pointer (skew X); the right side's (skew Y)", () => {
    const t = { ...T0, rotation: 0 };
    const b = boxOf(t);
    const r = skewDrag(b, look(t), "b", { x: b.cx + b.h / 2, y: b.cy + b.h / 2 });
    expect(r.skewX).toBeCloseTo(45, 4);
    expect(skewDrag(b, look(t), "r", { x: b.cx + b.w / 2, y: b.cy - b.w / 2 }).skewY).toBeCloseTo(-45, 4);
    // never past 60°, and in 5° steps with Shift
    expect(skewDrag(b, look(t), "b", { x: b.cx + 9999, y: b.cy }).skewX).toBe(60);
    expect(skewDrag(b, look(t), "t", { x: b.cx - 0.3 * b.h, y: b.cy }, 5).skewX).toBe(30);
  });
  it("perspective: the dragged corner lands on the pointer (turned and skewed too)", () => {
    const t = { ...T0, skewX: 10 };
    const b = boxOf(t);
    const p = { x: quadOf(t)[1].x + 40, y: quadOf(t)[1].y - 25 };
    const corners = cornerPin(b, look(t), "tr", p)!;
    // (corners are kept to 4 decimals of the box)
    near(boxQuad(b, { ...look(t), corners })[1], p, 0.1);
    expect(corners.tl).toEqual({ x: 0, y: 0 });
  });
  it("the radius dot: along the diagonal from the top-left corner, a share of the shorter side", () => {
    const t = { ...T0, rotation: 0 };
    const b = boxOf(t);
    const m = Math.min(b.w, b.h);
    const p = fromLocal({ x: -b.w / 2 + 0.25 * m, y: -b.h / 2 + 0.25 * m }, b, look(t));
    expect(radiusFromPointer(b, look(t), p)).toBeCloseTo(0.25, 3);
    expect(radiusFromPointer(b, look(t), { x: b.cx + 9999, y: b.cy + 9999 })).toBe(0.5);
    expect(radiusDotLocal(b, 0.25).x).toBeCloseTo(-b.w / 2 + 0.25 * m, 6);
  });
  it("moving the pivot doesn't move the picture; then turning keeps the pivot where it is", () => {
    const b = boxOf(T0);
    const corner = boxQuad(b, look(T0))[0];
    const r = pivotFromPointer(b, look(T0), { x: corner.x + 3, y: corner.y + 2 }, false, W, H)!;
    expect(r.pivot).toEqual({ x: 0, y: 0 });
    const t1 = { ...T0, ...r };
    near({ x: boxOf(t1).cx, y: boxOf(t1).cy }, { x: b.cx, y: b.cy });
    const pivotAt = pivotOnCanvas(boxOf(t1), look(t1));
    near(pivotAt, corner);
    // turn it: the corner (the pivot) stays
    const t2 = { ...t1, rotation: (t1.rotation ?? 0) + 70 };
    near(boxQuad(boxOf(t2), look(t2))[0], corner);
    near(pivotOnCanvas(boxOf(t2), look(t2)), corner);
  });
});
