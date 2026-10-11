import { describe, expect, it } from "vitest";
import { sideScale } from "@/lib/player/layout";

/** The middle of a side of a box (turning `rot`° around its middle). */
function sideMid(r: { x: number; y: number; w: number; h: number; rot: number }, edge: "l" | "r" | "t" | "b") {
  const a = (r.rot * Math.PI) / 180;
  const [lx, ly] = edge === "l" ? [-r.w / 2, 0] : edge === "r" ? [r.w / 2, 0] : edge === "t" ? [0, -r.h / 2] : [0, r.h / 2];
  return { x: r.x + r.w / 2 + lx * Math.cos(a) - ly * Math.sin(a), y: r.y + r.h / 2 + lx * Math.sin(a) + ly * Math.cos(a) };
}
/** The box after scaling by k around q, then moving by (dx, dy). */
function after(r: { x: number; y: number; w: number; h: number; rot: number }, k: number, q: { x: number; y: number }, dx: number, dy: number) {
  const cx = q.x + k * (r.x + r.w / 2 - q.x) + dx;
  const cy = q.y + k * (r.y + r.h / 2 - q.y) + dy;
  return { x: cx - (r.w * k) / 2, y: cy - (r.h * k) / 2, w: r.w * k, h: r.h * k, rot: r.rot };
}
const OPP = { l: "r", r: "l", t: "b", b: "t" } as const;

describe("resize from a side", () => {
  const box = { x: 400, y: 300, w: 400, h: 225, rot: 0 };
  it("the right side follows the pointer, the left side stays put, and the box grows evenly", () => {
    const r = sideScale(box, "r", 200, 37, 1);
    expect(r.scale).toBeCloseTo(1.5, 3);
    const b = after(box, r.scale, { x: 600, y: 412.5 }, r.dx, r.dy);
    expect(b.x).toBeCloseTo(400, 3);
    expect(b.h).toBeCloseTo(337.5, 3);
  });
  for (const edge of ["l", "r", "t", "b"] as const)
    it(`turned 30°: dragging ${edge} keeps the opposite side where it was`, () => {
      const r0 = { ...box, rot: 30 };
      const r = sideScale(r0, edge, 60, -45, 0.8);
      const k = r.scale / 0.8;
      const c = { x: r0.x + r0.w / 2, y: r0.y + r0.h / 2 };
      const before = sideMid(r0, OPP[edge]);
      const now = sideMid(after(r0, k, c, r.dx, r.dy), OPP[edge]);
      expect(Math.hypot(now.x - before.x, now.y - before.y)).toBeLessThan(0.5);
    });
  it("text grows from its anchor (bottom left of a lower third): it's moved back so the opposite side stays", () => {
    const q = { x: 400, y: 525 };
    const r = sideScale(box, "l", -100, 0, 1, q);
    expect(r.scale).toBeCloseTo(1.25, 3);
    const b = after(box, r.scale, q, r.dx, r.dy);
    expect(b.x + b.w).toBeCloseTo(800, 3);
  });
  it("never smaller or bigger than allowed", () => {
    expect(sideScale(box, "r", -1000, 0, 1).scale).toBe(0.05);
    expect(sideScale(box, "r", 99999, 0, 1).scale).toBe(5);
  });
});
