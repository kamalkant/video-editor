import { describe, expect, it } from "vitest";
import { detectFromFrames } from "@/lib/ffmpeg/key";

const W = 80;
const H = 45;
/** A frame painted by a function (x, y) → RGB. */
function frame(paint: (x: number, y: number) => [number, number, number]) {
  const buf = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [r, g, b] = paint(x, y);
      buf.set([r, g, b], (y * W + x) * 3);
    }
  return { buf, W, H };
}
const GREEN: [number, number, number] = [18, 175, 52];
const SMOKE: [number, number, number] = [120, 120, 125];

describe("background detection", () => {
  it("classic green screen from the borders", () => {
    const f = frame((x, y) => (x > 25 && x < 55 && y > 10 ? [220, 170, 140] : GREEN));
    expect(detectFromFrames([f])).toEqual({ hex: "#12AF34", kind: "green", via: "border" });
  });

  it("effect clip: smoke covers the borders, green still shows in the frame", () => {
    // smoke covers the frame; green only shows through near two corners
    const f = frame((x, y) => ((x > 62 && y < 10) || (x < 18 && y > 35) ? GREEN : SMOKE));
    expect(detectFromFrames([f])).toMatchObject({ kind: "green", hex: "#12AF34", via: "frame" });
  });

  it("a little green in a normal video is not a green screen", () => {
    const f = frame((x, y) => (x < 4 && y < 4 ? [40, 160, 50] : [150, 120, 100]));
    expect(detectFromFrames([f])).toBeNull();
  });

  it("black background (fire, sparks)", () => {
    const f = frame((x, y) => (x > 30 && x < 50 && y > 10 ? [255, 180, 60] : [6, 5, 8]));
    expect(detectFromFrames([f])).toMatchObject({ kind: "black" });
  });

  it("a big blue shirt in the middle is not a blue screen", () => {
    const f = frame((x, y) => (x > 20 && x < 60 && y > 5 ? [42, 58, 138] : [128, 128, 128]));
    expect(detectFromFrames([f])).toBeNull();
  });

  it("grey studio: nothing", () => {
    expect(detectFromFrames([frame(() => [128, 128, 128])])).toBeNull();
  });
});
