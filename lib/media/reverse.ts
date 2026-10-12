import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fastH264Args, runFfmpeg, SAFE_INPUT } from "../ffmpeg/run";
import { storagePath } from "../storage";
import { sourcePath, type VideoMeta } from "../videos";

/**
 * Reverse: a copy of one part of a video [a, b] playing backwards (picture
 * and sound). FFmpeg's reverse filter keeps every frame in memory, so the
 * part is done in 2-second pieces, each reversed, then joined last-first.
 * Made once per part and kept next to the upload.
 */

const CHUNK = 2;
const ms = (v: number) => Math.round(v * 1000);
export const reversedFile = (videoId: string, a: number, b: number) =>
  storagePath("videos", videoId, `reversed-${ms(a)}-${ms(b)}.mp4`);
export const reversedUrl = (videoId: string, a: number, b: number) =>
  `/api/videos/${videoId}/reversed?a=${ms(a)}&b=${ms(b)}`;

type Work = { percent: number; promise: Promise<string>; error?: string };
const g = globalThis as unknown as { __VDOReversed?: Map<string, Work> };
const work = (g.__VDOReversed ??= new Map());

async function exists(p: string) {
  try {
    return (await stat(p)).size > 0;
  } catch {
    return false;
  }
}

/** The pieces of [a, b], last one first: [start, length]. */
export function reversePieces(
  a: number,
  b: number,
  chunk = CHUNK,
): [number, number][] {
  const out: [number, number][] = [];
  for (let end = b; end > a + 1e-6; end -= chunk) {
    const start = Math.max(a, end - chunk);
    out.push([start, end - start]);
  }
  return out;
}

export async function reversedStatus(
  video: VideoMeta,
  a: number,
  b: number,
): Promise<{
  state: "idle" | "working" | "ready" | "failed";
  percent: number;
}> {
  const w = work.get(`${video.id}|${ms(a)}|${ms(b)}`);
  if (w)
    return w.error
      ? { state: "failed", percent: w.percent }
      : { state: "working", percent: w.percent };
  if (await exists(reversedFile(video.id, a, b)))
    return { state: "ready", percent: 100 };
  return { state: "idle", percent: 0 };
}

/** Make the reversed part (or join the run already going). Resolves to its path. */
export function ensureReversed(
  video: VideoMeta,
  a: number,
  b: number,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const id = `${video.id}|${ms(a)}|${ms(b)}`;
  const running = work.get(id);
  if (running && !running.error) return running.promise;
  const w: Work = { percent: 0, promise: Promise.resolve("") };
  w.promise = (async () => {
    const out = reversedFile(video.id, a, b);
    if (await exists(out)) return out;
    const dir = `${out}.parts`;
    await mkdir(dir, { recursive: true });
    try {
      const pieces = reversePieces(a, b);
      const names: string[] = [];
      const kbps = Math.round(
        Math.min(
          20000,
          Math.max(
            3000,
            (video.info.width *
              video.info.height *
              (video.info.fps || 30) *
              0.12) /
              1000,
          ),
        ),
      );
      for (let i = 0; i < pieces.length; i++) {
        const [s, len] = pieces[i];
        const name = `p${String(i).padStart(4, "0")}.mp4`;
        await runFfmpeg(
          [
            ...SAFE_INPUT,
            "-ss",
            s.toFixed(3),
            "-t",
            len.toFixed(3),
            "-i",
            sourcePath(video.id),
            "-map",
            "0:v:0",
            "-vf",
            "reverse,format=yuv420p",
            ...fastH264Args(kbps),
            ...(video.info.hasAudio
              ? [
                  "-map",
                  "0:a:0",
                  "-af",
                  "areverse",
                  "-c:a",
                  "aac",
                  "-b:a",
                  "160k",
                  "-ar",
                  "48000",
                ]
              : []),
            "-y",
            join(dir, name),
          ],
          { timeoutMs: 10 * 60 * 1000 },
        );
        names.push(name);
        w.percent = Math.round(((i + 1) / pieces.length) * 95);
        onProgress?.(w.percent);
      }
      await writeFile(
        join(dir, "list.txt"),
        names.map((n) => `file '${n}'`).join("\n"),
      );
      const tmp = `${out}.tmp.mp4`;
      await runFfmpeg(
        [
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          join(dir, "list.txt"),
          "-c",
          "copy",
          "-movflags",
          "+faststart",
          "-y",
          tmp,
        ],
        { timeoutMs: 10 * 60 * 1000 },
      );
      await rename(tmp, out);
      work.delete(id);
      return out;
    } catch (err) {
      w.error = "Couldn't reverse this clip.";
      setTimeout(() => work.delete(id), 30_000);
      throw err;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  })();
  work.set(id, w);
  return w.promise;
}
