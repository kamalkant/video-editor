import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { BLEND_MODES, blendChannel, blendOnto, type BlendMode } from "@/lib/render/blend";

/** A tiny graph builder, like lib/ops/types GraphBuilder. */
function graph() {
  const parts: string[] = [];
  let n = 0;
  return { parts, add: (s: string) => parts.push(s), label: (p: string) => `${p}${n++}` };
}

const N = 64;
/**
 * Every backdrop value across (x), every source value down (y), through blendOnto; returns RGBA bytes.
 * `backAlpha`: the backdrop's alpha (a transparent canvas: 0–255, varying down the second half).
 */
function run(mode: BlendMode, transparent: boolean): Buffer {
  const g = graph();
  const step = 255 / (N - 1);
  g.add(`color=c=black:s=${N}x${N}:r=1:d=1,format=rgba,geq=r='round(X*${step})':g='round(X*${step})':b='round(X*${step})':a='${transparent ? `if(lt(Y\\,${N / 2})\\,255\\,round((Y-${N / 2})*${(255 / (N / 2 - 1)).toFixed(6)}))` : "255"}'[comp]`);
  g.add(`color=c=black:s=${N}x${N}:r=1:d=1,format=rgba,geq=r='round(Y*${step})':g='round(Y*${step})':b='round(Y*${step})':a='255'[layer]`);
  const out = blendOnto(g, "comp", "layer", mode, transparent, "enable='between(t\\,0\\,10)'");
  const fc = g.parts.join(";");
  return execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-filter_complex", fc, "-map", `[${out}]`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"], { maxBuffer: 1 << 24 });
}

describe("blend modes in the export match the preview (W3C formulas, real FFmpeg)", () => {
  for (const mode of BLEND_MODES.filter((m) => m !== "normal")) {
    it(`${mode}: on an opaque canvas`, () => {
      const px = run(mode, false);
      const step = 255 / (N - 1);
      let worst = 0;
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const b = Math.round(x * step) / 255;
          const s = Math.round(y * step) / 255;
          const want = mode === "add" ? Math.min(1, b + s) : blendChannel(mode, b, s);
          worst = Math.max(worst, Math.abs(px[(y * N + x) * 4] - want * 255));
        }
      expect(worst).toBeLessThanOrEqual(2);
    });
  }
  it("on a transparent canvas a layer shows as Normal where nothing is behind it, blended where something is", () => {
    for (const mode of ["multiply", "screen", "soft-light"] as const) {
      const px = run(mode, true);
      const step = 255 / (N - 1);
      let worst = 0;
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const b = Math.round(x * step) / 255;
          const s = Math.round(y * step) / 255;
          const ab = y < N / 2 ? 1 : Math.round((y - N / 2) * (255 / (N / 2 - 1))) / 255;
          // the layer is opaque: its colour is (1 − αb)·Cs + αb·B(Cb, Cs)
          const want = (1 - ab) * s + ab * blendChannel(mode, b, s);
          worst = Math.max(worst, Math.abs(px[(y * N + x) * 4] - want * 255));
          expect(px[(y * N + x) * 4 + 3]).toBe(255);
        }
      expect(worst, mode).toBeLessThanOrEqual(3);
    }
  });
});
