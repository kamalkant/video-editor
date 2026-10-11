import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MP4_CRF } from "../export/rates";
import { runFfmpeg, SAFE_INPUT } from "./run";

/** Seconds of the clip that are encoded to measure it. */
export const SAMPLE_SECONDS = 2;
/** The test encode is never bigger than this (a 4K project is measured smaller; lib/export/size scales it). */
const MAX_SIDE = 1920;

const g = globalThis as unknown as { __VDOBusy?: Map<string, number> };
const cache = (g.__VDOBusy ??= new Map());

/**
 * How busy a clip's picture is, for the export size estimate: bits per pixel
 * per frame of a short H.264 CRF 23 encode (the MP4 "Balanced" setting) from
 * `at` seconds into the upload, fitted into w × h like the export does.
 * Returns the size it was measured at too.
 */
export async function measureBusyness(
  id: string,
  path: string,
  sourceSeconds: number,
  at: number,
  w: number,
  h: number,
  fps: number,
  signal?: AbortSignal,
): Promise<{ bpp: number; width: number; height: number }> {
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const even = (v: number) => Math.max(2, Math.round((v * k) / 2) * 2);
  const W = even(w);
  const H = even(h);
  const F = Math.min(60, Math.max(1, Math.round(fps)));
  const start = Math.max(
    0,
    Math.min(Math.round(at), Math.floor(sourceSeconds - SAMPLE_SECONDS)),
  );
  const len = Math.max(0.2, Math.min(SAMPLE_SECONDS, sourceSeconds - start));
  const key = `${id}|${start}|${W}x${H}|${F}`;
  const hit = cache.get(key);
  if (hit != null) return { bpp: hit, width: W, height: H };
  const dir = await mkdtemp(join(tmpdir(), "VDO-busy-"));
  try {
    const out = join(dir, "sample.mp4");
    const vf = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,fps=${F},format=yuv420p`;
    await runFfmpeg(
      [
        ...SAFE_INPUT,
        "-ss",
        String(start),
        "-t",
        len.toFixed(3),
        "-i",
        path,
        "-an",
        "-vf",
        vf,
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        String(MP4_CRF.balanced),
        "-y",
        out,
      ],
      { signal, timeoutMs: 60_000 },
    );
    const size = (await stat(out)).size;
    // (a clip shorter than the sample: count its real frames)
    const frames = Math.max(1, Math.round(F * len));
    const bpp = Math.round(((size * 8) / (W * H * frames)) * 10000) / 10000;
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
    cache.set(key, bpp);
    return { bpp, width: W, height: H };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
