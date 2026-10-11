import { describe, expect, it } from "vitest";
import { watermarkRect, type Watermark } from "@/lib/edit/doc";
import { logoExpr, logoState, logoWindow } from "@/lib/player/logo";

const L = "33333333-3333-4333-8333-333333333333";
const wm = (p: Partial<Watermark> = {}): Watermark => ({ mediaId: L, corner: "tr", size: 0.1, opacity: 1, margin: 0.03, ...p });
const evalExpr = (e: string) => new Function("t", "clip", "pow", `return ${e.replaceAll("\\,", ",")};`) as (t: number, c: (v: number, a: number, b: number) => number, p: (a: number, b: number) => number) => number;
const clip = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

describe("logo: when it shows and how it comes in", () => {
  it("a part of the video, or all of it", () => {
    expect(logoWindow({}, 10)).toEqual({ from: 0, to: 10 });
    expect(logoWindow({ from: 2, to: 5 }, 10)).toEqual({ from: 2, to: 5 });
    expect(logoWindow({ from: 8, to: 20 }, 10)).toEqual({ from: 8, to: 10 });
    const box = watermarkRect(wm(), 1920, 1080, 200, 100);
    expect(logoState(wm({ from: 2, to: 5 }), 1, 10, 1920, box).show).toBe(false);
    expect(logoState(wm({ from: 2, to: 5 }), 3, 10, 1920, box).show).toBe(true);
    expect(logoState(wm({ from: 2, to: 5 }), 6, 10, 1920, box).show).toBe(false);
  });
  it("fade, pop (grows with a small overshoot) and slide (from its own side), the same in the export", () => {
    const box = watermarkRect(wm(), 1920, 1080, 200, 100);
    const w = wm({ anim: { in: "pop", out: "slide" } });
    expect(logoState(w, 0, 10, 1920, box).alpha).toBe(0);
    expect(logoState(w, 0, 10, 1920, box).scale).toBeCloseTo(0.5, 6);
    expect(logoState(w, 0.5, 10, 1920, box)).toMatchObject({ alpha: 1, scale: 1, dx: 0 });
    // somewhere in the pop it's a bit bigger than its size
    expect(Math.max(...[0.3, 0.35, 0.4].map((t) => logoState(w, t, 10, 1920, box).scale))).toBeGreaterThan(1.01);
    // the logo is on the right: it slides out to the right
    expect(logoState(w, 10, 10, 1920, box).dx).toBeGreaterThan(0);
    const e = logoExpr(w, 10, 1920, box);
    const sc = evalExpr(e.scale!);
    const dx = evalExpr(`0${e.dx}`);
    for (const t of [0.1, 0.25, 0.4, 5, 9.7, 9.9]) {
      const s = logoState(w, t, 10, 1920, box);
      expect(sc(t, clip, Math.pow)).toBeCloseTo(s.scale, 4);
      expect(dx(t, clip, Math.pow)).toBeCloseTo(s.dx, 2);
    }
    expect(e.fades).toEqual(["fade=t=in:st=0.000:d=0.500:alpha=1"]);
  });
  it("with a box: the badge is bigger by its padding, and sits in the corner", () => {
    const plain = watermarkRect(wm(), 1920, 1080, 200, 100);
    const boxed = watermarkRect(wm({ plate: { color: "#ffffff", pad: 0.25 } }), 1920, 1080, 200, 100);
    expect(boxed.w).toBe(plain.w + 2 * Math.round(plain.w * 0.25));
    expect(boxed.x + boxed.w).toBe(plain.x + plain.w);
  });
});
