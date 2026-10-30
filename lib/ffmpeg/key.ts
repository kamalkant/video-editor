import type { VideoInfo } from "./probe";
import { runFfmpeg, SAFE_INPUT } from "./run";
import { detectFromFrames, hexToRgb, keyKind, median, toHex, type DetectedKey, type Rgb } from "../media/keyDetect";

export { detectFromFrames, hexToRgb, keyKind, toHex, type DetectedKey, type Rgb } from "../media/keyDetect";
type Frame = { buf: Uint8Array; W: number; H: number };

/** Decode one frame at time t as raw RGB24 (optionally scaled or cropped). */
export async function grabRgb(path: string, t: number, vf: string, signal?: AbortSignal): Promise<Buffer> {
  const r = await runFfmpeg(
    [...SAFE_INPUT, "-ss", t.toFixed(3), "-i", path, "-frames:v", "1", "-vf", vf, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
    { collectStdout: true, signal, timeoutMs: 20_000 },
  );
  return r.stdout;
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
