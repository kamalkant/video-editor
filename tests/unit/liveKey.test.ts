import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { DEFAULT_SPEC } from "@/lib/edit/spec";
import { referenceAlpha, referenceBlackAlpha, referenceBlackColor, referenceDespill, type Rgb } from "@/lib/editor/liveKey";
import { buildFilterGraph } from "@/lib/ffmpeg/graph";

/** FFmpeg's own chromakey alpha (0-255) for a flat frame of one color. */
function ffmpegAlpha(rgb: Rgb, key: string, sim: number, blend: number): number {
  const hex = rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
  const out = execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=0x${hex}:s=16x16:d=0.04`,
    "-frames:v", "1", "-vf", `format=yuv444p,chromakey=0x${key.replace("#", "")}:${sim}:${blend},format=yuva444p,alphaextract`,
    "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1",
  ]);
  return out[8 * 16 + 8];
}

const KEY = "#12AF34";
const COLORS: Record<string, Rgb> = {
  key: [18, 175, 52],
  nearKey: [30, 160, 60],
  white: [255, 255, 255],
  grey: [128, 128, 128],
  lightSkin: [241, 194, 125],
  paleSkin: [255, 219, 172],
  darkHair: [59, 42, 32],
  halfSkinGreen: [130, 185, 89],
  blueShirt: [40, 58, 138],
};

describe("live key matches FFmpeg chromakey", () => {
  for (const [sim, blend] of [
    [0.05, 0.15],
    [0.15, 0.05],
    [0.1, 0.2],
  ]) {
    for (const [name, rgb] of Object.entries(COLORS)) {
      it(`${name} at ${sim}:${blend}`, () => {
        const ours = Math.round(referenceAlpha(rgb, KEY, sim, blend) * 255);
        expect(Math.abs(ours - ffmpegAlpha(rgb, KEY, sim, blend))).toBeLessThanOrEqual(6);
      });
    }
  }

  it("despills only edge pixels", () => {
    expect(referenceDespill([241, 194, 125], 1, false, 100)).toEqual([241, 194, 125]);
    const edge = referenceDespill([100, 180, 80], 0.5, false, 100);
    expect(edge[1]).toBeCloseTo(90, 5);
    expect(referenceDespill([100, 180, 80], 0.5, false, 40)[1]).toBeCloseTo(144, 5);
  });
});

/** Our real black-background graph on a flat frame → [r, g, b, a]. */
function ffmpegBlack(rgb: Rgb, threshold: number): number[] {
  const hex = rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
  const spec = { ...DEFAULT_SPEC, ops: [{ id: "black", type: "blackKey" as const, enabled: true, params: { threshold, restoreColor: true } }] };
  const graph = buildFilterGraph(spec, "preview");
  const out = execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=0x${hex}:s=16x16:d=0.04`,
    "-filter_complex", graph, "-map", "[vout]", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1",
  ]);
  const i = (8 * 16 + 8) * 4;
  return [out[i], out[i + 1], out[i + 2], out[i + 3]];
}

describe("live black-background removal matches the FFmpeg graph", () => {
  const colors: Record<string, Rgb> = { ember30: [76, 45, 6], ember60: [153, 90, 12], spark: [255, 150, 20], grey: [80, 80, 80], blue: [20, 60, 200], dark: [12, 9, 6] };
  for (const [name, rgb] of Object.entries(colors)) {
    it(name, () => {
      const [r, g, b, a] = ffmpegBlack(rgb, 0.03);
      expect(Math.abs(Math.round(referenceBlackAlpha(rgb, 0.03) * 255) - a)).toBeLessThanOrEqual(6);
      if (a > 20) {
        const want = referenceBlackColor(rgb);
        for (const [got, w] of [[r, want[0]], [g, want[1]], [b, want[2]]]) expect(Math.abs(got - w)).toBeLessThanOrEqual(12);
      }
    });
  }
});
