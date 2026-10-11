import type { VideoInfo } from "./probe";
import { runFfmpeg, SAFE_INPUT } from "./run";

export type Rgb = [number, number, number];

export function toHex([r, g, b]: Rgb): string {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace(/^#/, "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Is this color a plausible green/blue screen color? */
export function keyKind([r, g, b]: Rgb): "green" | "blue" | null {
  if (g > r * 1.25 && g > b * 1.15 && g > 60) return "green";
  if (b > r * 1.25 && b > g * 1.1 && b > 60) return "blue";
  return null;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Decode one frame at time t as raw RGB24 (optionally scaled or cropped). */
export async function grabRgb(path: string, t: number, vf: string, signal?: AbortSignal): Promise<Buffer> {
  const r = await runFfmpeg(
    [...SAFE_INPUT, "-ss", t.toFixed(3), "-i", path, "-frames:v", "1", "-vf", vf, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
    { collectStdout: true, signal, timeoutMs: 20_000 },
  );
  return r.stdout;
}

/** `via: "frame"` = found only by the whole-frame fallback, i.e. probably an effects clip. */
export type DetectedKey = { hex: string; kind: "green" | "blue" | "black"; via?: "border" | "frame" };
type Frame = { buf: Uint8Array; W: number; H: number };

function medianRgb(list: Rgb[]): Rgb {
  return [median(list.map((p) => p[0])), median(list.map((p) => p[1])), median(list.map((p) => p[2]))];
}

/** The biggest cluster of screen-green/blue pixels (colors bucketed by 16). */
function screenCluster(samples: Rgb[]): Rgb[] {
  const buckets = new Map<string, Rgb[]>();
  for (const s of samples) {
    if (!keyKind(s)) continue;
    const k = s.map((v) => v >> 4).join(",");
    const list = buckets.get(k);
    if (list) list.push(s);
    else buckets.set(k, [s]);
  }
  let best: Rgb[] = [];
  for (const list of buckets.values()) if (list.length > best.length) best = list;
  return best;
}

/**
 * Pure part of the detector (unit-tested).
 * 1. Top and side borders, skipping corners (a watermark may sit there) and the
 *    bottom edge (the presenter usually covers it): the classic green screen.
 * 2. Fallback for effect clips (smoke, powder, sparks) that cover the borders:
 *    the most common strong green/blue anywhere in the frame.
 * 3. A near-black border means a "black background" clip (fire, sparks).
 */
export function detectFromFrames(frames: Frame[]): DetectedKey | null {
  const border: Rgb[] = [];
  const whole: Rgb[] = [];
  const edge: Rgb[] = []; // top + side edges incl. corners, never the bottom (a presenter covers it)
  for (const { buf, W, H } of frames) {
    const px = (x: number, y: number): Rgb => {
      const i = (y * W + x) * 3;
      return [buf[i], buf[i + 1], buf[i + 2]];
    };
    const band = Math.max(2, Math.round(W * 0.04));
    const skipX = Math.round(W * 0.12);
    const skipY = Math.round(H * 0.12);
    for (let y = 0; y < band; y++) for (let x = skipX; x < W - skipX; x += 2) border.push(px(x, y));
    for (let y = skipY; y < H - skipY; y += 2) {
      for (let x = 0; x < band; x++) border.push(px(x, y));
      for (let x = W - band; x < W; x++) border.push(px(x, y));
    }
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) whole.push(px(x, y));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (y < band || x < band || x >= W - band) edge.push(px(x, y));
  }
  if (!border.length) return null;

  // 1. the background dominates the borders
  const b = screenCluster(border);
  if (b.length >= border.length * 0.3) {
    const rgb = medianRgb(b);
    const kind = keyKind(rgb);
    if (kind) return { hex: toHex(rgb), kind, via: "border" };
  }
  // 2. effect clips: a strong screen color still covers a fair part of the frame
  const w = screenCluster(whole).filter(([r, g, bl]) => Math.max(r, g, bl) - Math.min(r, g, bl) > 60);
  if (w.length >= whole.length * 0.04) {
    const rgb = medianRgb(w);
    const kind = keyKind(rgb);
    // a real screen still shows at the frame edges (≥33% in real clips); blue clothes or
    // green objects in a normal video do not (≤4%)
    const near = edge.filter((p) => Math.abs(p[0] - rgb[0]) + Math.abs(p[1] - rgb[1]) + Math.abs(p[2] - rgb[2]) < 60).length;
    if (kind && near >= edge.length * 0.15) return { hex: toHex(rgb), kind, via: "frame" };
  }
  // 3. black background
  const dark = border.filter(([r, g, bl]) => Math.max(r, g, bl) < 45);
  if (dark.length >= border.length * 0.6) return { hex: toHex(medianRgb(dark)), kind: "black" };
  return null;
}

/** Find the background from a few frames of the clip (see detectFromFrames). */
export async function detectKeyColor(path: string, info: Pick<VideoInfo, "width" | "height" | "duration">): Promise<DetectedKey | null> {
  const W = 320;
  const H = Math.max(2, Math.round((info.height * W) / info.width / 2) * 2);
  const times = [0.1, 0.5, 0.9].map((f) => Math.min(info.duration * f, Math.max(0, info.duration - 0.1)));
  const frames: Frame[] = [];
  for (const t of times) {
    try {
      const buf = await grabRgb(path, t, `scale=${W}:${H}:flags=area`);
      if (buf.length >= W * H * 3) frames.push({ buf, W, H });
    } catch {
      /* skip unreadable frame */
    }
  }
  return detectFromFrames(frames);
}

/**
 * Does a picked color look like the background? It must be screen-like (green or
 * blue), and the same kind as the detected key, so blue clothes on a green screen,
 * skin or white are flagged. Shadowed parts of the screen still pass.
 */
export function looksLikeBackground(rgb: Rgb, detectedHex: string | null): boolean {
  const kind = keyKind(rgb);
  if (!kind) return false;
  return !detectedHex || kind === keyKind(hexToRgb(detectedHex));
}

/** Median color of a 5×5 patch around (x, y) in the decoded frame at time t. */
export async function pickColor(path: string, info: Pick<VideoInfo, "width" | "height">, x: number, y: number, t: number, detectedHex: string | null = null): Promise<{ hex: string; looksLikeKey: boolean }> {
  const cx = Math.min(Math.max(0, Math.round(x) - 2), info.width - 5);
  const cy = Math.min(Math.max(0, Math.round(y) - 2), info.height - 5);
  const buf = await grabRgb(path, t, `crop=5:5:${cx}:${cy}`);
  const px: Rgb[] = [];
  for (let i = 0; i + 2 < buf.length && px.length < 25; i += 3) px.push([buf[i], buf[i + 1], buf[i + 2]]);
  const rgb: Rgb = [median(px.map((p) => p[0])), median(px.map((p) => p[1])), median(px.map((p) => p[2]))];
  return { hex: toHex(rgb), looksLikeKey: looksLikeBackground(rgb, detectedHex) };
}
