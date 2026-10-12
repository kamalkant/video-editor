import { rm, stat } from "node:fs/promises";
import type { VideoInfo } from "./probe";
import { FAST_H264, runFfmpeg, SAFE_INPUT } from "./run";

/**
 * Some videos FFmpeg reads fine but a browser can't play (ProRes or HEVC .mov, AVI, MKV with
 * H.264, PCM sound in a .mov…). Those get a playable copy next to the source, for the preview
 * only: the export, thumbnails, keying and the film strip all keep using the original file, so
 * quality and transparency in the export are untouched.
 *
 *   "none"        plays as it is (H.264 in MP4/MOV/M4V with AAC/MP3 sound, VP8/VP9/AV1 in WebM)
 *   "remux"       H.264 in another box, or a sound the browser can't play: the picture is copied
 *                 as it is into an MP4 (fast), the sound becomes AAC
 *   "mp4"         anything else: H.264 + AAC, same size and frame rate
 *   "webm-alpha"  a see-through video (ProRes 4444, PNG/QuickTime Animation, VP9 with alpha…):
 *                 VP9 with alpha in a WebM, so the preview stays see-through
 */
export type PlayableMode = "none" | "remux" | "mp4" | "webm-alpha";

const WEB_VIDEO = ["vp8", "vp9", "av1"];
// sounds every browser plays in an MP4 box
const MP4_SOUND = ["aac", "mp3"];
const WEBM_SOUND = ["opus", "vorbis"];

export function playableMode(kind: "video" | "image" | "audio", info: Pick<VideoInfo, "container" | "videoCodec" | "audioCodec" | "hasAudio" | "alpha">): PlayableMode {
  if (kind !== "video") return "none";
  const c = info.container;
  const v = info.videoCodec;
  const soundOk = (ok: string[]) => !info.hasAudio || !info.audioCodec || ok.includes(info.audioCodec);
  if (info.alpha && (c !== "webm" || !WEB_VIDEO.includes(v))) return "webm-alpha";
  if ((c === "webm" || c === "matroska") && WEB_VIDEO.includes(v) && soundOk(WEBM_SOUND)) return "none";
  if (c === "mp4" && (v === "h264" || v === "av1" || v === "vp9") && soundOk(MP4_SOUND)) return "none";
  // H.264 (or AV1/VP9) that only needs a new box or a new sound
  if (v === "h264") return "remux";
  return "mp4";
}

/** The copy's file name for a mode ("none": no copy). */
export const playableFile = (mode: PlayableMode) => (mode === "webm-alpha" ? "playable.webm" : mode === "none" ? null : "playable.mp4");

/** FFmpeg arguments for the copy. `encoder` falls back to libx264 if Apple's hardware one fails. */
export function playableArgs(src: string, out: string, mode: Exclude<PlayableMode, "none">, info: Pick<VideoInfo, "width" | "height" | "hasAudio">, encoder: "h264_videotoolbox" | "libx264" = FAST_H264): string[] {
  const args = [...SAFE_INPUT, "-i", src, "-map", "0:v:0", ...(info.hasAudio ? ["-map", "0:a:0?"] : []), "-map_metadata", "-1"];
  if (mode === "remux") {
    args.push("-c:v", "copy");
    if (info.hasAudio) args.push("-c:a", "aac", "-b:a", "192k");
    args.push("-movflags", "+faststart", "-f", "mp4");
  } else if (mode === "webm-alpha") {
    args.push("-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuva420p", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "30", "-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1", "-auto-alt-ref", "0");
    if (info.hasAudio) args.push("-c:a", "libopus", "-b:a", "160k", "-ar", "48000");
    args.push("-f", "webm");
  } else {
    args.push("-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p");
    // about 0.15 bits per pixel per frame at 30 fps: plenty for a preview
    const kbps = Math.round(Math.min(40000, Math.max(3000, (info.width * info.height * 30 * 0.15) / 1000)));
    if (encoder === "h264_videotoolbox") args.push("-c:v", "h264_videotoolbox", "-b:v", `${kbps}k`, "-allow_sw", "1");
    else args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "20");
    if (info.hasAudio) args.push("-c:a", "aac", "-b:a", "192k");
    args.push("-movflags", "+faststart", "-f", "mp4");
  }
  args.push("-y", out);
  return args;
}

/** Make the copy at `out` (it's removed again if making it fails). */
export async function makePlayable(src: string, out: string, mode: Exclude<PlayableMode, "none">, info: Pick<VideoInfo, "width" | "height" | "hasAudio">): Promise<void> {
  try {
    try {
      await runFfmpeg(playableArgs(src, out, mode, info), { timeoutMs: 30 * 60 * 1000 });
    } catch (err) {
      if (mode !== "mp4") throw err;
      await runFfmpeg(playableArgs(src, out, mode, info, "libx264"), { timeoutMs: 45 * 60 * 1000 });
    }
    if (!(await stat(out)).size) throw new Error("empty copy");
  } catch (err) {
    await rm(out, { force: true });
    throw err;
  }
}
