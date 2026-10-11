import { rename, rm, stat } from "node:fs/promises";
import { runFfmpeg, SAFE_INPUT } from "../ffmpeg/run";
import { storagePath } from "../storage";
import { sourcePath, type VideoMeta } from "../videos";

/**
 * Derived versions of an upload, made once and kept next to it:
 *
 *   stabilize  the whole video with camera shake removed (FFmpeg deshake);
 *              same length and frame times as the original, so trims still fit
 *
 * The preview plays the derived file and the export reads it instead of the
 * original. (Reverse is made per clip range: lib/media/reverse.)
 */

export type DerivedKind = "stabilize";
export type DerivedStatus = {
  state: "idle" | "working" | "ready" | "failed";
  percent: number;
  error?: string;
};

export const derivedFile = (videoId: string, kind: DerivedKind) =>
  storagePath("videos", videoId, `derived-${kind}.mp4`);
export const derivedUrl = (videoId: string, kind: DerivedKind) =>
  `/api/videos/${videoId}/derived/${kind}`;

type Work = { percent: number; promise: Promise<string>; error?: string };
const g = globalThis as unknown as { __VDODerived?: Map<string, Work> };
const work = (g.__VDODerived ??= new Map());

async function exists(p: string) {
  try {
    return (await stat(p)).size > 0;
  } catch {
    return false;
  }
}

/** FFmpeg arguments for a derived file. */
export function derivedArgs(
  kind: DerivedKind,
  src: string,
  out: string,
  info: { width: number; height: number; fps: number; hasAudio: boolean },
): string[] {
  const kbps = Math.round(
    Math.min(
      20000,
      Math.max(
        3000,
        (info.width * info.height * (info.fps || 30) * 0.12) / 1000,
      ),
    ),
  );
  return [
    ...SAFE_INPUT,
    "-i",
    src,
    "-map",
    "0:v:0",
    ...(info.hasAudio ? ["-map", "0:a:0", "-c:a", "copy"] : []),
    // deshake: search ±32 px, fill the moved-in edges by mirroring (no black borders)
    "-vf",
    "deshake=rx=32:ry=32:edge=mirror,format=yuv420p",
    "-c:v",
    "h264_videotoolbox",
    "-b:v",
    `${kbps}k`,
    "-allow_sw",
    "1",
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    "-nostats",
    "-y",
    out,
  ];
}

export async function derivedStatus(
  video: VideoMeta,
  kind: DerivedKind,
): Promise<DerivedStatus> {
  const w = work.get(`${video.id}|${kind}`);
  if (w)
    return w.error
      ? { state: "failed", percent: w.percent, error: w.error }
      : { state: "working", percent: w.percent };
  if (await exists(derivedFile(video.id, kind)))
    return { state: "ready", percent: 100 };
  return { state: "idle", percent: 0 };
}

/** Make the derived file (or join the run already going). Resolves to its path. */
export function ensureDerived(
  video: VideoMeta,
  kind: DerivedKind,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const id = `${video.id}|${kind}`;
  const running = work.get(id);
  if (running && !running.error) {
    if (onProgress) {
      const t = setInterval(() => onProgress(running.percent), 500);
      void running.promise
        .finally(() => clearInterval(t))
        .catch(() => undefined);
    }
    return running.promise;
  }
  const w: Work = { percent: 0, promise: Promise.resolve("") };
  w.promise = (async () => {
    const out = derivedFile(video.id, kind);
    if (await exists(out)) return out;
    const tmp = `${out}.tmp.mp4`;
    try {
      await runFfmpeg(
        derivedArgs(kind, sourcePath(video.id), tmp, video.info),
        {
          timeoutMs: 60 * 60 * 1000,
          onProgress: (t) => {
            w.percent = Math.min(
              99,
              Math.round((100 * t) / Math.max(0.1, video.info.duration)),
            );
            onProgress?.(w.percent);
          },
        },
      );
      await rename(tmp, out);
      work.delete(id);
      return out;
    } catch (err) {
      w.error = "Couldn't stabilize this video.";
      await rm(tmp, { force: true });
      setTimeout(() => work.delete(id), 30_000);
      throw err;
    }
  })();
  work.set(id, w);
  return w.promise;
}
