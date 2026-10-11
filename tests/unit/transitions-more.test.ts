import { describe, expect, it } from "vitest";
import { revealShows, transitionExpr, transitionState, TRANSITION_TYPES } from "@/lib/player/transitions";
import { transitionSchema } from "@/lib/edit/doc";

// the export's reveal mask (geq) turned back into JS, to check it against the preview's rule
const mask = (e: string) => new Function("X", "Y", "W", "H", "T", "clip", "gte", "lte", "hypot", `return ${e.replaceAll("\\,", ",")};`) as (...a: unknown[]) => number;
const fns = [(v: number, a: number, b: number) => Math.min(b, Math.max(a, v)), (a: number, b: number) => (a >= b ? 1 : 0), (a: number, b: number) => (a <= b ? 1 : 0), Math.hypot] as const;

describe("more transitions", () => {
  it("every type can be saved in a project", () => {
    for (const type of TRANSITION_TYPES) expect(transitionSchema.safeParse({ type, duration: 0.5 }).success).toBe(true);
  });
  it("the reveal masks in the export show the same pixels as the preview", () => {
    const d = 1;
    for (const type of ["wipeLeft", "wipeRight", "wipeUp", "wipeDown", "circleOpen", "circleClose"] as const) {
      const f = mask(transitionExpr(type, 0, d, 320, 180).in.mask!);
      for (const T of [0.25, 0.5, 0.75]) {
        // (the export's curve runs a frame shorter, so it ends fully open: compare where it's clear)
        const st = transitionState(type, T / (d - 1 / 60)).in.reveal!;
        for (const [x, y] of [[10, 10], [100, 60], [160, 90], [250, 150], [310, 170]]) {
          const shown = revealShows(st, x, y, 320, 180);
          expect(f(x, y, 320, 180, T, ...fns) > 0, `${type} ${T} ${x},${y}`).toBe(shown);
        }
      }
    }
  });
  it("zoom and spin: a size (and a turn) that settles to 1 (and 0)", () => {
    expect(transitionState("zoomIn", 0).in.scale).toBeCloseTo(1.3, 6);
    expect(transitionState("zoomIn", 1).in.scale).toBeCloseTo(1, 6);
    expect(transitionState("zoomOut", 0).in.scale).toBeCloseTo(0.7, 6);
    expect(transitionState("spin", 0).in.rot).toBeCloseTo(-180, 6);
    expect(transitionState("spin", 1).in).toMatchObject({ scale: 1, alpha: 1 });
  });
});
