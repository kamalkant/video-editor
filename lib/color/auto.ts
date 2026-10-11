import type { ColorAdjust } from "../edit/doc";

/**
 * Auto color: a few frames are measured (brightness spread, average, how
 * colorful, color cast) and corrections are chosen that bring them to
 * pleasant targets. The result is ordinary color settings the user can tweak.
 */

export type FrameStats = { mean: number; p2: number; p98: number; chroma: number; meanR: number; meanB: number };

/** Measure RGB pixels (0–255, 3 bytes each). */
export function statsOf(rgb: Uint8Array): FrameStats {
  const n = Math.floor(rgb.length / 3);
  if (!n) return { mean: 0.5, p2: 0, p98: 1, chroma: 0.2, meanR: 0.5, meanB: 0.5 };
  const hist = new Array(256).fill(0);
  let sum = 0;
  let chroma = 0;
  let r = 0;
  let b = 0;
  for (let i = 0; i < n; i++) {
    const R = rgb[i * 3];
    const G = rgb[i * 3 + 1];
    const B = rgb[i * 3 + 2];
    const y = Math.round(0.2126 * R + 0.7152 * G + 0.0722 * B);
    hist[y]++;
    sum += y;
    chroma += Math.max(R, G, B) - Math.min(R, G, B);
    r += R;
    b += B;
  }
  const pct = (p: number) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= p * n) return v / 255;
    }
    return 1;
  };
  return { mean: sum / n / 255, p2: pct(0.02), p98: pct(0.98), chroma: chroma / n / 255, meanR: r / n / 255, meanB: b / n / 255 };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Corrections for measured frames (brightness gain first, then contrast — the order of lib/player/look). */
export function autoColor(s: FrameStats): ColorAdjust {
  const spread = Math.max(0.05, s.p98 - s.p2);
  const mean = Math.max(0.02, s.mean);
  let gain = 1;
  let contrast = 1;
  for (let i = 0; i < 3; i++) {
    contrast = clamp(0.86 / (spread * gain), 0.85, 1.6);
    gain = clamp(((0.47 - 0.5) / contrast + 0.5) / mean, 0.65, 1.45);
  }
  const saturation = clamp(0.24 / Math.max(0.02, s.chroma), 0.9, 1.35);
  const temperature = clamp((s.meanB - s.meanR) * 2.2, -0.5, 0.5);
  return { brightness: r2(gain - 1), contrast: r2(contrast), saturation: r2(saturation), temperature: r2(temperature) };
}
