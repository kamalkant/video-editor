import { describe, expect, it } from "vitest";
import { applyH, applyLin, boxQuad, fromLocal, homography, linearPart, localQuad, pivotCenter, pivotPoint, pointInQuad, quadArea, quadOk, rectQuad, squareToQuad, toLocal, warpPlan, type Quad } from "@/lib/player/quad";

const close = (a: { x: number; y: number }, b: { x: number; y: number }, eps = 1e-6) => {
  expect(a.x).toBeCloseTo(b.x, -Math.log10(eps));
  expect(a.y).toBeCloseTo(b.y, -Math.log10(eps));
};

describe("a clip's box as a quad", () => {
  it("turns clockwise like the canvas and skews like ctx.transform(1, tanY, tanX, 1)", () => {
    close(applyLin(linearPart(90), { x: 1, y: 0 }), { x: 0, y: 1 });
    close(applyLin(linearPart(0, 45, 0), { x: 0, y: 1 }), { x: 1, y: 1 });
    close(applyLin(linearPart(0, 0, 45), { x: 1, y: 0 }), { x: 1, y: 1 });
    // turn after skew: R·K
    const p = { x: 3, y: -2 };
    const skewed = applyLin(linearPart(0, 20, -10), p);
    close(applyLin(linearPart(30, 20, -10), p), applyLin(linearPart(30), skewed));
  });
  it("without a pivot the middle stays put; with one, the pivot stays put while it turns and grows", () => {
    expect(pivotCenter(500, 300, 200, 100, 100, 50, { rotation: 40 })).toEqual({ x: 500, y: 300 });
    // pivot at the top-left corner: size ×2 and a quarter turn, the top-left corner stays where it was
    const unit = { w: 100, h: 50 };
    const t = { rotation: 90, pivot: { x: 0, y: 0 } };
    const c = pivotCenter(500, 300, 200, 100, unit.w, unit.h, t);
    const q = boxQuad({ cx: c.x, cy: c.y, w: 200, h: 100 }, t);
    close(q[0], pivotPoint(500, 300, unit.w, unit.h, t));
    close(q[0], { x: 450, y: 275 });
    // a pivot in the bottom-right, skewed and stretched: that corner stays too
    const t2 = { rotation: -25, skewX: 12, skewY: -8, pivot: { x: 1, y: 1 } };
    const c2 = pivotCenter(400, 400, 130, 60, 100, 50, t2);
    close(boxQuad({ cx: c2.x, cy: c2.y, w: 130, h: 60 }, t2)[2], { x: 450, y: 425 });
  });
  it("the corner pin moves each corner by a share of the box", () => {
    const q = localQuad(200, 100, { tl: { x: 0.1, y: 0 }, tr: { x: 0, y: 0.2 }, br: { x: 0, y: 0 }, bl: { x: -0.05, y: -0.1 } });
    expect(q).toEqual([
      { x: -80, y: -50 },
      { x: 100, y: -30 },
      { x: 100, y: 50 },
      { x: -110, y: 40 },
    ]);
  });
});

describe("homographies", () => {
  const dst: Quad = [
    { x: 120, y: 80 },
    { x: 520, y: 140 },
    { x: 480, y: 420 },
    { x: 90, y: 360 },
  ];
  it("send the corners where they belong (and the unit square's middle to where the diagonals cross)", () => {
    const src = rectQuad(0, 0, 640, 360);
    const H = homography(src, dst);
    for (let i = 0; i < 4; i++) close(applyH(H, src[i]), dst[i], 1e-6);
    const S = squareToQuad(dst);
    const m = applyH(S, { x: 0.5, y: 0.5 });
    // the diagonals' crossing point
    const [a, b, c, d] = dst;
    const den = (a.x - c.x) * (b.y - d.y) - (a.y - c.y) * (b.x - d.x);
    const tt = ((a.x - b.x) * (b.y - d.y) - (a.y - b.y) * (b.x - d.x)) / den;
    close(m, { x: a.x + tt * (c.x - a.x), y: a.y + tt * (c.y - a.y) }, 1e-6);
  });
  it("a rectangle onto a rectangle is just a scale and a move", () => {
    const H = homography(rectQuad(0, 0, 100, 50), rectQuad(10, 20, 300, 100));
    close(applyH(H, { x: 50, y: 25 }), { x: 160, y: 70 });
  });
  it("knows a usable shape, and what's inside it", () => {
    expect(quadOk(dst)).toBe(true);
    expect(quadArea(dst)).toBeGreaterThan(0);
    // a bow tie isn't
    expect(quadOk([dst[0], dst[2], dst[1], dst[3]])).toBe(false);
    expect(quadOk(rectQuad(0, 0, 0.5, 0.5))).toBe(false);
    expect(pointInQuad({ x: 300, y: 250 }, dst)).toBe(true);
    expect(pointInQuad({ x: 100, y: 100 }, dst)).toBe(false);
    expect(pointInQuad({ x: 300, y: 76 }, dst, 0)).toBe(false);
    expect(pointInQuad({ x: 300, y: 108 }, dst, 0)).toBe(true);
  });
  it("the pointer in a turned, skewed box's own frame, and back", () => {
    const box = { cx: 300, cy: 200 };
    const t = { rotation: 33, skewX: 10, skewY: -5 };
    const p = { x: 351.5, y: 160.25 };
    close(fromLocal(toLocal(p, box, t)!, box, t), p, 1e-6);
  });
});

describe("the export's warp plan", () => {
  it("a plain move: the frame's corners map so the picture lands exactly on its rectangle", () => {
    const plan = warpPlan(200, 100, rectQuad(310, 140, 200, 100), { x: 410, y: 190 })!;
    expect(plan.fw % 2).toBe(0);
    expect(plan.fh % 2).toBe(0);
    // the input frame's corner (0,0) is the picture's corner moved back by the padding; on the output frame the same
    expect(plan.refs[0]).toBeCloseTo(310 - plan.ox - plan.padX, 6);
    expect(plan.refs[1]).toBeCloseTo(140 - plan.oy - plan.padY, 6);
    expect(plan.refs[6]).toBeCloseTo(310 - plan.ox - plan.padX + plan.fw, 6);
    // the whole picture fits in the frame
    expect(plan.ox).toBeLessThanOrEqual(310);
    expect(plan.ox + plan.fw).toBeGreaterThanOrEqual(510);
  });
  it("a turned and pinned picture fits in its frame; a flat one can't be drawn", () => {
    const t = { rotation: 25, skewX: 15, skewY: -10, corners: { tl: { x: 0.1, y: 0.05 }, tr: { x: -0.05, y: 0 }, br: { x: 0, y: 0.1 }, bl: { x: 0, y: 0 } } };
    const q = boxQuad({ cx: 640, cy: 360, w: 300, h: 200 }, t);
    const plan = warpPlan(300, 200, q, { x: 640, y: 360 })!;
    for (const p of q) {
      expect(p.x).toBeGreaterThan(plan.ox);
      expect(p.x).toBeLessThan(plan.ox + plan.fw);
      expect(p.y).toBeGreaterThan(plan.oy);
      expect(p.y).toBeLessThan(plan.oy + plan.fh);
    }
    expect(plan.refs).toHaveLength(8);
    expect(warpPlan(300, 200, boxQuad({ cx: 0, cy: 0, w: 300, h: 0.001 }, {}), { x: 0, y: 0 })).toBeNull();
  });
});
