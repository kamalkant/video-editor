import { outputGeometry, type CropBox } from "../edit/geometry";
import { isWhole, selectExpr, type Segment } from "../edit/timeline";
import type { EditSpec } from "../edit/spec";
import { videoBitrate, type BitrateCodec } from "../export/rates";
import { LIMITS } from "../settings";
import { buildFilterGraph, type Target } from "./graph";
import type { VideoInfo } from "./probe";
import { APPLE_MEDIA, SAFE_INPUT } from "./run";

export type OutputKind = "webm" | "mov" | "poster" | "master";

export const OUTPUT_FILES: Record<OutputKind, { name: string; mime: string; target: Target; label: string }> = {
  webm: { name: "avatar.webm", mime: "video/webm", target: "webm", label: "Making Chrome file" },
  mov: { name: "avatar-safari.mov", mime: "video/quicktime", target: "hevc", label: "Making Safari file" },
  poster: { name: "poster.png", mime: "image/png", target: "poster", label: "Making poster image" },
  master: { name: "master-prores.mov", mime: "video/quicktime", target: "prores", label: "Making ProRes master" },
};

const BT709 = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"];

export { outputGeometry };

/** The select expression for a cut timeline, or null when the whole clip is kept. */
export function cutSelect(clips: Segment[] | undefined, info: Pick<VideoInfo, "fps"> & { duration?: number }): string | null {
  if (!clips?.length) return null;
  if (info.duration !== undefined && isWhole(clips, info.duration, info.fps)) return null;
  return selectExpr(clips, info.fps);
}

/** Full FFmpeg argument list for one output file. */
export function buildEncodeArgs(
  kind: OutputKind,
  spec: EditSpec,
  info: Pick<VideoInfo, "width" | "height" | "fps" | "hasAudio"> & { duration?: number },
  input: string,
  output: string,
  opts: {
    /** Report progress on stdout (-progress pipe:1). Default on. */
    progress?: boolean;
    /** Encode only part of the clip (used for the size estimate). */
    range?: { start: number; duration: number };
    /** Crop box from findCropBox(), when "Crop empty area" is on. */
    crop?: CropBox | null;
    /** The AI mask video (needed when AI Removal is on). */
    mask?: string | null;
    /** Apply the timeline's cuts (default on; off for the size-estimate sample). */
    timeline?: boolean;
  } = {},
): string[] {
  const s = spec.output;
  const withProgress = opts.progress ?? true;
  const range = opts.range;
  const crop = s.crop.enabled ? opts.crop : null;
  const { width, fps, outW, outH, outFps } = outputGeometry(s, info, crop);
  const target = OUTPUT_FILES[kind].target;
  const mask = opts.mask ?? null;
  // the bitrate the Export dialog's size shows (lib/export/rates)
  const rate = (c: BitrateCodec) => {
    const T = Math.round(videoBitrate(c, s.quality, outW, outH, outFps, s.capBpp) / 1000);
    return ["-b:v", `${T}k`, "-maxrate", `${Math.round(T * 1.5)}k`, "-bufsize", `${T * 2}k`];
  };
  const keepAudio = s.audio === "keep" && info.hasAudio;
  const select = opts.timeline !== false ? cutSelect(spec.timeline?.clips, info) : null;
  let graph = buildFilterGraph(spec, target, { width, fps, crop, maskInput: mask ? "[1:v]" : undefined, select: select ?? undefined });
  // the sound is cut the same way as the picture
  const audioCut = select && keepAudio && kind !== "poster";
  if (audioCut) graph += `;[0:a]aselect=${select},asetpts=N/SR/TB[aout]`;
  const audioMap = audioCut ? ["-map", "[aout]"] : ["-map", "0:a:0?"];
  // the mask is read over exactly the same range as the video
  const window = range ? ["-ss", range.start.toFixed(3), "-t", range.duration.toFixed(3)] : ["-t", String(LIMITS.maxDurationSec)];
  const args = [...SAFE_INPUT, ...window, "-i", input, ...(mask ? [...window, "-i", mask] : []), "-filter_complex", graph, "-map", "[vout]"];
  switch (kind) {
    case "webm":
      args.push(
        "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0",
        ...rate("vp9-alpha"), "-row-mt", "1", "-deadline", "good", "-cpu-used", "2",
        ...BT709,
      );
      if (keepAudio) args.push(...audioMap, "-c:a", "libopus", "-b:a", "64k");
      else args.push("-an");
      break;
    case "mov":
      if (APPLE_MEDIA) {
        args.push(
          "-c:v", "hevc_videotoolbox", "-allow_sw", "1", "-alpha_quality", "0.75",
          ...rate("hevc-alpha"), "-tag:v", "hvc1", ...BT709, "-movflags", "+faststart",
        );
        if (keepAudio) args.push(...audioMap, "-c:a", "aac", "-b:a", "96k");
        else args.push("-an");
      } else {
        args.push("-c:v", "prores_ks", "-profile:v", "4", "-pix_fmt", "yuva444p10le", ...BT709, "-movflags", "+faststart");
        if (keepAudio) args.push(...audioMap, "-c:a", "pcm_s16le");
        else args.push("-an");
      }
      break;
    case "master":
      args.push("-c:v", "prores_ks", "-profile:v", "4", "-pix_fmt", "yuva444p10le", ...BT709, "-movflags", "+faststart");
      if (keepAudio) args.push(...audioMap, "-c:a", "pcm_s16le");
      else args.push("-an");
      break;
    case "poster":
      args.push("-frames:v", "1", "-an", "-c:v", "png");
      break;
  }
  if (withProgress && kind !== "poster") args.push("-progress", "pipe:1", "-nostats");
  args.push("-y", output);
  return args;
}
