import { rename, rm } from "node:fs/promises";
import { FAST_H264, runFfmpeg, runFfprobe, SAFE_INPUT } from "./run";

/**
 * Recordings from the browser (MediaRecorder) are awkward files: the frame
 * rate changes all the time, WebM ones often have no length, and seeking in
 * them is slow. Each one is re-encoded once, right after the upload:
 *
 *   video → MP4, constant 30 fps, H.264 (Apple's hardware encoder, fast) + AAC
 *   sound → M4A (AAC)
 *
 * After that it's a normal upload (probe, thumbnails, key detection).
 */

export type NormalizePlan = { video: { width: number; height: number } | null; audio: boolean };

/** FFmpeg arguments for one recording. `encoder` falls back to libx264 if the hardware one fails. */
export function normalizeArgs(src: string, out: string, plan: NormalizePlan, encoder: "h264_videotoolbox" | "libx264" = FAST_H264): string[] {
  const args: string[] = [...SAFE_INPUT, "-fflags", "+genpts", "-i", src];
  if (plan.video) {
    // about 0.12 bits per pixel per frame: sharp enough for screen text, small for a camera
    const kbps = Math.round(Math.min(20000, Math.max(2500, (plan.video.width * plan.video.height * 30 * 0.12) / 1000)));
    args.push("-map", "0:v:0");
    if (plan.audio) args.push("-map", "0:a:0");
    args.push("-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p");
    if (encoder === "h264_videotoolbox") args.push("-c:v", "h264_videotoolbox", "-b:v", `${kbps}k`, "-maxrate", `${Math.round(kbps * 1.5)}k`, "-bufsize", `${kbps * 2}k`, "-allow_sw", "1");
    else args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "20");
    args.push("-g", "60", "-r", "30");
    if (plan.audio) args.push("-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2");
    args.push("-movflags", "+faststart", "-f", "mp4");
  } else {
    args.push("-vn", "-map", "0:a:0", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart", "-f", "ipod");
  }
  args.push("-y", out);
  return args;
}

type Probe = { streams?: { codec_type?: string; width?: number; height?: number }[] };

/** What the recording holds (video size, sound). */
export async function planFor(path: string): Promise<NormalizePlan> {
  const out = await runFfprobe([...SAFE_INPUT, "-print_format", "json", "-show_streams", path], { timeoutMs: 30_000 });
  const j = JSON.parse(out) as Probe;
  const v = j.streams?.find((s) => s.codec_type === "video" && s.width && s.height);
  return { video: v ? { width: v.width!, height: v.height! } : null, audio: !!j.streams?.some((s) => s.codec_type === "audio") };
}

/** Re-encode the recording at `path` in place. */
export async function normalizeRecording(path: string): Promise<void> {
  const plan = await planFor(path);
  if (!plan.video && !plan.audio) throw new Error("The recording is empty.");
  const tmp = `${path}.norm`;
  try {
    try {
      await runFfmpeg(normalizeArgs(path, tmp, plan), { timeoutMs: 20 * 60 * 1000 });
    } catch (err) {
      if (!plan.video) throw err;
      await runFfmpeg(normalizeArgs(path, tmp, plan, "libx264"), { timeoutMs: 30 * 60 * 1000 });
    }
    await rename(tmp, path);
  } finally {
    await rm(tmp, { force: true });
  }
}
