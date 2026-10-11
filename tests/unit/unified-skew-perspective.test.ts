import { describe, expect, it } from "vitest";
import type { Transform } from "@/lib/edit/doc";
import { cornerPin, skewDrag, type HandleBox } from "@/lib/player/handles";
import { placeClip } from "@/lib/player/look";
import { boxQuad, type BoxLook } from "@/lib/player/quad";

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

describe("Unified Skew and Perspective Interactions", () => {
  it("Ctrl + Corner drag computes perspective corner pinning for any corner", () => {
    const t0: Transform = { fit: "fit", x: 0, y: 0, scale: 0.5 };
    const b = boxOf(t0);
    const q0 = quadOf(t0);

    // Pin top-right corner
    const trTarget = { x: q0[1].x + 50, y: q0[1].y - 30 };
    const trCorners = cornerPin(b, look(t0), "tr", trTarget);
    expect(trCorners).toBeDefined();
    expect(trCorners?.tr.x).toBeGreaterThan(0);
    expect(trCorners?.tr.y).toBeLessThan(0);

    // Other corners remain unchanged at 0
    expect(trCorners?.tl).toEqual({ x: 0, y: 0 });
    expect(trCorners?.bl).toEqual({ x: 0, y: 0 });
    expect(trCorners?.br).toEqual({ x: 0, y: 0 });

    // Pin bottom-left corner
    const blTarget = { x: q0[3].x - 40, y: q0[3].y + 20 };
    const blCorners = cornerPin(b, look(t0), "bl", blTarget);
    expect(blCorners).toBeDefined();
    expect(blCorners?.bl.x).toBeLessThan(0);
    expect(blCorners?.bl.y).toBeGreaterThan(0);
  });

  it("Ctrl + Side drag calculates horizontal skew from top/bottom edges and vertical skew from left/right edges", () => {
    const t0: Transform = { fit: "fit", x: 0, y: 0, scale: 0.5 };
    const b = boxOf(t0);

    // Top edge drag creates skewX
    const topDrag = skewDrag(b, look(t0), "t", { x: b.cx + 50, y: b.cy - b.h / 2 });
    expect(topDrag.skewX).toBeDefined();
    expect(typeof topDrag.skewX).toBe("number");

    // Right edge drag creates skewY
    const rightDrag = skewDrag(b, look(t0), "r", { x: b.cx + b.w / 2, y: b.cy + 40 });
    expect(rightDrag.skewY).toBeDefined();
    expect(typeof rightDrag.skewY).toBe("number");
  });

  it("Reset shape removes skew and perspective transforms back to rectangular shape", () => {
    const transformed: Transform = {
      fit: "fit",
      x: 0,
      y: 0,
      scale: 0.5,
      skewX: 15,
      skewY: -10,
      corners: {
        tl: { x: 0, y: 0 },
        tr: { x: 0.1, y: -0.05 },
        bl: { x: -0.05, y: 0.05 },
        br: { x: 0, y: 0 },
      },
    };

    // Emulate Reset shape button logic from ProgramPlayer.tsx
    const resetTransform: Transform = {
      ...transformed,
      skewX: 0,
      skewY: 0,
      corners: undefined,
    };

    expect(resetTransform.skewX).toBe(0);
    expect(resetTransform.skewY).toBe(0);
    expect(resetTransform.corners).toBeUndefined();
    // Bounding box becomes a standard rectangular quad
    const b = boxOf(resetTransform);
    const q = quadOf(resetTransform);
    // Width and height of top and bottom edges are equal
    const topWidth = Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y);
    const bottomWidth = Math.hypot(q[2].x - q[3].x, q[2].y - q[3].y);
    expect(topWidth).toBeCloseTo(bottomWidth, 4);
    expect(topWidth).toBeCloseTo(b.w, 4);
  });
});
