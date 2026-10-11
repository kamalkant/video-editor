import type { CropBox } from "../edit/geometry";
import { activeRemovalOps, type EditSpec } from "../edit/spec";
import { buildFilterGraph } from "./graph";
import type { VideoInfo } from "./probe";
import { runFfmpegLog, SAFE_INPUT } from "./run";

export type Bounds = { x1: number; y1: number; x2: number; y2: number };

/** Union of every per-frame box printed by FFmpeg's bbox filter. */
export function parseBboxLog(log: string): Bounds | null {
  let u: Bounds | null = null;
  for (const m of log.matchAll(/x1:(\d+) x2:(\d+) y1:(\d+) y2:(\d+)/g)) {
    const [x1, x2, y1, y2] = m.slice(1, 5).map(Number);
    u = u
      ? {
          x1: Math.min(u.x1, x1),
          y1: Math.min(u.y1, y1),
          x2: Math.max(u.x2, x2),
          y2: Math.max(u.y2, y2),
        }
      : { x1, y1, x2, y2 };
  }
  return u;
}

/** Add padding, keep inside the frame, make width/height even (needed by the video codecs). */
export function padBox(
  b: Bounds,
  padding: number,
  width: number,
  height: number,
): CropBox {
  const x = Math.max(0, b.x1 - padding);
  const y = Math.max(0, b.y1 - padding);
  const x2 = Math.min(width - 1, b.x2 + padding);
  const y2 = Math.min(height - 1, b.y2 + padding);
  let w = x2 - x + 1;
  let h = y2 - y + 1;
  w -= w % 2;
  h -= h % 2;
  return { x, y, w: Math.max(2, w), h: Math.max(2, h) };
}

const g = globalThis as unknown as { __VDOBounds?: Map<string, Bounds | null> };
const cache = (g.__VDOBounds ??= new Map());

/**
 * Find the area the person ever covers over the whole clip: one FFmpeg pass
 * (key graph → alpha → bbox, 12 frames per second). Cached per video and key
 * settings; padding is applied afterwards so changing it is instant.
 */
export async function findCropBox(
  key: string,
  path: string,
  info: VideoInfo,
  spec: EditSpec,
  signal?: AbortSignal,
  mask?: string | null,
): Promise<CropBox | null> {
  const ops = activeRemovalOps(spec);
  if (!ops.length) return null;
  const cacheKey = `${key}|${JSON.stringify(ops)}`;
  let bounds = cache.get(cacheKey);
  if (bounds === undefined) {
    const keyOnly: EditSpec = { ...spec, ops };
    const graph =
      buildFilterGraph(keyOnly, "preview", {
        fps: 12,
        maskInput: mask ? "[1:v]" : undefined,
      }) + ";[vout]alphaextract,bbox=min_val=24[bb]";
    const log = await runFfmpegLog(
      [
        ...SAFE_INPUT,
        "-i",
        path,
        ...(mask ? ["-i", mask] : []),
        "-filter_complex",
        graph,
        "-map",
        "[bb]",
        "-f",
        "null",
        "-",
      ],
      { signal, timeoutMs: 5 * 60 * 1000 },
    );
    bounds = parseBboxLog(log);
    if (cache.size > 50) cache.delete(cache.keys().next().value!);
    cache.set(cacheKey, bounds);
  }
  return bounds
    ? padBox(bounds, spec.output.crop.padding, info.width, info.height)
    : null;
}
