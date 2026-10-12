import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { activeAiOp, type EditSpec } from "../edit/spec";
import { maskParamsOf, type AiMaskParams } from "../ops/aiMatte";
import { FFMPEG, runFfmpeg, runFfprobe, SAFE_INPUT } from "../ffmpeg/run";
import { storagePath } from "../storage";
import { sourcePath, type VideoMeta } from "../videos";
import {
  ensureTool,
  maskFrame,
  probeForMatte,
  toolArgs,
  TOOL_VERSION,
  type MatteProbe,
} from "./tool";

/**
 * AI masks: one gray frame per video frame, made once per clip and mask
 * settings, stored as a lossless FFV1 video next to the upload. Sliders that
 * only refine the mask (smoothing, edge, feather, hardness) never re-run Vision.
 */

export type MaskStatus = {
  state: "idle" | "working" | "ready" | "failed";
  percent: number;
  error?: string;
};

export const maskKey = (p: AiMaskParams) =>
  createHash("sha1")
    .update(JSON.stringify([TOOL_VERSION, p.mode, p.quality, p.despeckle]))
    .digest("hex")
    .slice(0, 16);

const dir = (videoId: string) => storagePath("videos", videoId, "mattes");
export const maskFile = (videoId: string, key: string) =>
  storagePath("videos", videoId, "mattes", `${key}.mkv`);
// ".packed2": the playing preview now carries the clip's sound (the first version was silent)
export const packedFile = (videoId: string, key: string) =>
  storagePath("videos", videoId, "mattes", `${key}.packed2.mp4`);

type Work = { percent: number; promise: Promise<string>; error?: string };
const g = globalThis as unknown as {
  __VDOMasks?: Map<string, Work>;
  __VDOFrames?: Map<string, Buffer>;
  __VDOProbes?: Map<string, Promise<{ probe: MatteProbe; input: string }>>;
  __VDOPacked?: Map<string, Promise<string>>;
};
const work = (g.__VDOMasks ??= new Map());
const frames = (g.__VDOFrames ??= new Map());
const probes = (g.__VDOProbes ??= new Map());
const packing = (g.__VDOPacked ??= new Map());

async function exists(p: string) {
  try {
    return (await stat(p)).size > 0;
  } catch {
    return false;
  }
}

/**
 * What the tool reads: the upload itself, or (for WebM, which Apple's
 * AVFoundation can't open) a same-timing MP4 copy made once.
 */
function toolInput(
  video: VideoMeta,
): Promise<{ probe: MatteProbe; input: string }> {
  let p = probes.get(video.id);
  if (!p) {
    p = (async () => {
      const src = sourcePath(video.id);
      try {
        return { probe: await probeForMatte(src), input: src };
      } catch {
        const copy = storagePath("videos", video.id, "ai-source.mp4");
        if (!(await exists(copy))) {
          await runFfmpeg(
            [
              ...SAFE_INPUT,
              "-i",
              src,
              "-map",
              "0:v:0",
              "-c:v",
              "libx264",
              "-crf",
              "12",
              "-preset",
              "veryfast",
              "-pix_fmt",
              "yuv420p",
              "-fps_mode",
              "passthrough",
              "-an",
              "-y",
              copy,
            ],
            { timeoutMs: 10 * 60 * 1000 },
          );
        }
        return { probe: await probeForMatte(copy), input: copy };
      }
    })().catch((e) => {
      probes.delete(video.id);
      throw e;
    });
    probes.set(video.id, p);
  }
  return p;
}

export async function maskStatus(
  video: VideoMeta,
  p: AiMaskParams,
): Promise<MaskStatus> {
  const key = maskKey(p);
  const w = work.get(`${video.id}|${key}`);
  if (w)
    return w.error
      ? { state: "failed", percent: w.percent, error: w.error }
      : { state: "working", percent: w.percent };
  if (await exists(maskFile(video.id, key)))
    return { state: "ready", percent: 100 };
  return { state: "idle", percent: 0 };
}

/** Start making the mask (or join the run already going). Resolves to the mask file. */
export function ensureMask(
  video: VideoMeta,
  p: AiMaskParams,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const key = maskKey(p);
  const id = `${video.id}|${key}`;
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
    const out = maskFile(video.id, key);
    if (await exists(out)) return out;
    const { probe, input } = await toolInput(video);
    const bin = await ensureTool();
    await mkdir(dir(video.id), { recursive: true });
    const tmp = `${out}.${process.pid}.tmp.mkv`;
    await new Promise<void>((resolve, reject) => {
      const tool = spawn(bin, toolArgs(input, p), {
        stdio: ["ignore", "pipe", "pipe"],
      });
      const enc = spawn(
        FFMPEG,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-f",
          "rawvideo",
          "-pix_fmt",
          "gray",
          "-s",
          `${probe.width}x${probe.height}`,
          "-r",
          probe.fpsRational,
          "-i",
          "pipe:0",
          "-c:v",
          "ffv1",
          "-level",
          "3",
          "-g",
          "1",
          "-slices",
          "4",
          "-y",
          tmp,
        ],
        { stdio: ["pipe", "ignore", "pipe"] },
      );
      let toolErr = "";
      let encErr = "";
      tool.stdout.pipe(enc.stdin);
      tool.stderr.on("data", (d: Buffer) => {
        const s = d.toString();
        toolErr = (toolErr + s).slice(-4000);
        const m = [...s.matchAll(/frame (\d+)\/(\d+)/g)].pop();
        if (m) {
          w.percent = Math.min(
            99,
            Math.round((100 * Number(m[1])) / Math.max(1, Number(m[2]))),
          );
          onProgress?.(w.percent);
        }
      });
      enc.stderr.on(
        "data",
        (d: Buffer) => (encErr = (encErr + d.toString()).slice(-4000)),
      );
      let toolCode: number | null = null;
      tool.on("error", reject);
      enc.on("error", reject);
      tool.on("close", (c) => (toolCode = c));
      enc.on("close", (c) => {
        if (toolCode !== 0 && toolCode !== null)
          return reject(
            new Error(`AI tool failed: ${toolErr.trim().split("\n").pop()}`),
          );
        if (c !== 0)
          return reject(
            new Error(
              `Saving the mask failed: ${encErr.trim().split("\n").pop()}`,
            ),
          );
        resolve();
      });
    });
    // every video frame must have its mask frame, or edges would drift out of step
    const count = await countFrames(tmp);
    if (Math.abs(count - probe.frameCount) > 1) {
      await rm(tmp, { force: true });
      throw new Error(
        `The mask has ${count} frames but the video has ${probe.frameCount}.`,
      );
    }
    await rename(tmp, out);
    await writeFile(
      `${out}.json`,
      JSON.stringify({
        version: TOOL_VERSION,
        params: p,
        frames: count,
        probe,
      }),
    );
    w.percent = 100;
    return out;
  })();
  work.set(id, w);
  w.promise.then(
    () => work.delete(id),
    (e: Error) => {
      w.error = e.message || "The AI mask couldn't be made.";
      // forget the failure after a while so it can be retried
      setTimeout(() => work.get(id) === w && work.delete(id), 30_000).unref?.();
    },
  );
  return w.promise;
}

async function countFrames(file: string): Promise<number> {
  const out = await runFfprobe(
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-count_packets",
      "-show_entries",
      "stream=nb_read_packets",
      "-of",
      "csv=p=0",
      file,
    ],
    { timeoutMs: 120_000 },
  );
  return Number(out.trim()) || 0;
}

/**
 * The mask frame at time t as a raw gray file: from the finished mask if it
 * exists, else made on the spot for this one frame (0.1–0.5 s).
 */
export async function maskFrameFile(
  video: VideoMeta,
  p: AiMaskParams,
  t: number,
  signal?: AbortSignal,
): Promise<{ file: string; raw: { w: number; h: number } | null }> {
  const key = maskKey(p);
  const full = maskFile(video.id, key);
  if (await exists(full)) return { file: full, raw: null };
  const { probe, input } = await toolInput(video);
  const fi = Math.max(0, Math.round(t * fpsOf(probe.fpsRational)));
  const ck = `${video.id}|${key}|${fi}`;
  let buf = frames.get(ck);
  if (!buf) {
    buf = await maskFrame(
      input,
      probe,
      p,
      fi / fpsOf(probe.fpsRational),
      signal,
    );
    if (frames.size > 40) frames.delete(frames.keys().next().value!);
    frames.set(ck, buf);
  }
  await mkdir(dir(video.id), { recursive: true });
  const file = storagePath(
    "videos",
    video.id,
    "mattes",
    `frame-${key}-${fi}.gray`,
  );
  if (!(await exists(file))) await writeFile(file, buf);
  return { file, raw: { w: probe.width, h: probe.height } };
}

/** "24000/1001" → 23.976… */
function fpsOf(r: string): number {
  const [a, b] = r.split("/").map(Number);
  return b ? a / b : a;
}

/**
 * Preview for playing: the video with its mask stacked underneath (top =
 * picture, bottom = mask) in one H.264 file, so the browser shows both in
 * perfect step. Made once after the mask, at up to 1280 px wide.
 */
export function ensurePacked(
  video: VideoMeta,
  p: AiMaskParams,
): Promise<string> {
  const id = `${video.id}|${maskKey(p)}`;
  // one run per clip and setting: the editor asks every second while it's being made
  let run = packing.get(id);
  if (!run) {
    run = makePacked(video, p).finally(() => packing.delete(id));
    packing.set(id, run);
  }
  return run;
}

async function makePacked(video: VideoMeta, p: AiMaskParams): Promise<string> {
  const key = maskKey(p);
  const out = packedFile(video.id, key);
  if (await exists(out)) return out;
  const mask = await ensureMask(video, p);
  const w = Math.min(1280, video.info.width);
  const tmp = `${out}.${process.pid}.tmp.mp4`;
  await runFfmpeg(
    [
      ...SAFE_INPUT,
      "-i",
      sourcePath(video.id),
      "-i",
      mask,
      "-filter_complex",
      `[0:v]setpts=N/FRAME_RATE/TB,scale=${w}:-2:flags=bicubic,format=yuv420p[c];[1:v]setpts=N/FRAME_RATE/TB,scale=${w}:-2:flags=bicubic,format=yuv420p[m];[c][m]vstack=inputs=2[v]`,
      // the voice stays in the preview video (it plays in the editor while AI Removal is on)
      "-map",
      "[v]",
      ...(video.info.hasAudio
        ? ["-map", "0:a:0", "-c:a", "aac", "-b:a", "128k"]
        : ["-an"]),
      "-c:v",
      "h264_videotoolbox",
      "-q:v",
      "65",
      "-allow_sw",
      "1",
      "-movflags",
      "+faststart",
      "-y",
      tmp,
    ],
    { timeoutMs: 10 * 60 * 1000 },
  );
  await rename(tmp, out);
  return out;
}

/** Details saved next to a finished mask (frame count, settings). */
export async function readMaskMeta(
  videoId: string,
  key: string,
): Promise<{ frames: number } | null> {
  try {
    return JSON.parse(await readFile(`${maskFile(videoId, key)}.json`, "utf8"));
  } catch {
    return null;
  }
}

/** The finished mask a spec needs (made first if missing), or null without AI Removal. */
export async function maskForSpec(
  video: VideoMeta,
  spec: EditSpec,
): Promise<string | null> {
  const op = activeAiOp(spec);
  return op ? ensureMask(video, maskParamsOf(op.params)) : null;
}

/** The mask for one preview frame, or null without AI Removal. */
export async function previewMaskForSpec(
  video: VideoMeta,
  spec: EditSpec,
  t: number,
  signal?: AbortSignal,
) {
  const op = activeAiOp(spec);
  return op ? maskFrameFile(video, maskParamsOf(op.params), t, signal) : null;
}
