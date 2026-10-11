import { LIMITS } from "../settings";
import { runFfmpegLog, runFfprobe, SAFE_INPUT } from "./run";

export type VideoInfo = {
  container: string;
  videoCodec: string;
  /** Size after rotation metadata is applied (what FFmpeg decodes by default). */
  width: number;
  height: number;
  fps: number;
  duration: number;
  hasAudio: boolean;
  audioCodec: string | null;
  soundDetected: boolean;
  colorTransfer: string | null;
  size?: number;
  /** The picture has see-through parts (ProRes 4444, PNG / Animation codec, VP9 with alpha…). */
  alpha?: boolean;
};

export type MediaKind = "video" | "image" | "audio";

export type ProbeErrorCode =
  | "unreadable"
  | "unsupported_type"
  | "no_video"
  | "too_long"
  | "too_large_resolution"
  | "too_high_fps"
  | "hdr_not_supported";

export class ProbeError extends Error {
  constructor(
    public readonly code: ProbeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProbeError";
  }
}

type FfStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  duration?: string;
  color_transfer?: string;
  pix_fmt?: string;
  disposition?: { attached_pic?: number };
  side_data_list?: { rotation?: number }[];
  tags?: { rotate?: string; alpha_mode?: string; ALPHA_MODE?: string };
};

type FfProbe = { streams?: FfStream[]; format?: { format_name?: string; duration?: string } };

// MP4, MOV and M4V show as "mov,mp4,…"; MKV as "matroska,webm"
const ALLOWED_CONTAINERS = ["mov", "mp4", "matroska", "webm", "avi"];
/** Pixel formats with an alpha plane (yuva420p, rgba, argb, bgra, gbrap, ya8, pal8 can be too but isn't counted). */
const ALPHA_PIX = /^(yuva|gbrap|ya\d|rgba|bgra|argb|abgr|rgba64|bgra64)/;
const HDR_TRANSFERS = ["arib-std-b67", "smpte2084"];

export function parseRate(rate: string | undefined): number {
  if (!rate) return 0;
  const [n, d] = rate.split("/").map(Number);
  if (!d) return Number.isFinite(n) ? n : 0;
  return n / d;
}

/** Validate an ffprobe result against our limits; pure so it can be unit-tested. */
export function checkProbe(p: FfProbe): Omit<VideoInfo, "soundDetected"> {
  const formats = (p.format?.format_name ?? "").split(",");
  if (!formats.some((f) => ALLOWED_CONTAINERS.includes(f))) {
    throw new ProbeError("unsupported_type", "This file type isn't supported. Use an MP4, MOV, WebM, M4V, MKV or AVI video, a PNG/JPG/WebP picture, or an MP3/WAV/M4A sound.");
  }
  const videos = (p.streams ?? []).filter((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  if (videos.length !== 1) throw new ProbeError("no_video", "This file needs exactly one video track.");
  const v = videos[0];
  let width = v.width ?? 0;
  let height = v.height ?? 0;
  if (!width || !height) throw new ProbeError("unreadable", "We couldn't read this video.");

  const rotation = Number(v.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? v.tags?.rotate ?? 0);
  if (Math.abs(rotation) % 180 === 90) [width, height] = [height, width];

  const long = Math.max(width, height);
  const short = Math.min(width, height);
  if (long > LIMITS.maxLongSide || short > LIMITS.maxShortSide) {
    throw new ProbeError("too_large_resolution", `This video is ${width} × ${height}. The limit is 3840 × 2160.`);
  }
  const fps = parseRate(v.avg_frame_rate) || parseRate(v.r_frame_rate);
  if (!fps) throw new ProbeError("unreadable", "We couldn't read this video's frame rate.");
  if (fps > LIMITS.maxFps + 0.5) throw new ProbeError("too_high_fps", `This video is ${Math.round(fps)} fps. The limit is 60 fps.`);

  const duration = Number(p.format?.duration ?? v.duration ?? 0);
  if (!(duration > 0)) throw new ProbeError("unreadable", "We couldn't read this video's length.");
  if (duration > LIMITS.maxDurationSec + 0.05) {
    throw new ProbeError("too_long", `This video is ${Math.round(duration)} s long. The limit is ${LIMITS.maxDurationSec} s.`);
  }
  if (v.color_transfer && HDR_TRANSFERS.includes(v.color_transfer)) {
    throw new ProbeError("hdr_not_supported", "This is an HDR video. Export it as SDR (standard) and try again.");
  }
  const audio = (p.streams ?? []).find((s) => s.codec_type === "audio");
  return {
    container: formats.includes("webm") ? "webm" : formats.includes("mp4") ? "mp4" : formats[0],
    videoCodec: v.codec_name ?? "unknown",
    width,
    height,
    fps: Math.round(fps * 1000) / 1000,
    duration: Math.round(duration * 1000) / 1000,
    hasAudio: !!audio,
    audioCodec: audio?.codec_name ?? null,
    colorTransfer: v.color_transfer ?? null,
    ...(ALPHA_PIX.test(v.pix_fmt ?? "") || (v.tags?.alpha_mode ?? v.tags?.ALPHA_MODE) === "1" ? { alpha: true } : {}),
  };
}

/** Returns true when the first audio track is not near-silent. */
export async function detectSound(path: string): Promise<boolean> {
  try {
    const log = await runFfmpegLog(
      [...SAFE_INPUT, "-t", String(LIMITS.maxDurationSec), "-i", path, "-map", "0:a:0", "-af", "volumedetect", "-f", "null", "-"],
      { timeoutMs: 90_000 },
    );
    const m = /max_volume:\s*(-?[\d.]+|-inf) dB/.exec(log);
    if (!m || m[1] === "-inf") return false;
    return Number(m[1]) > -50;
  } catch {
    return false;
  }
}

const IMAGE_FORMATS = ["image2", "png_pipe", "jpeg_pipe", "webp_pipe", "bmp_pipe", "tiff_pipe"];
const AUDIO_FORMATS = ["mp3", "wav", "aac", "flac", "ogg", "mov", "mp4", "m4a", "matroska", "webm", "caf", "aiff"];

/** A still picture: size only (no frame rate, no length, no sound). */
export function checkImage(p: FfProbe): Omit<VideoInfo, "soundDetected"> {
  const v = (p.streams ?? []).find((s) => s.codec_type === "video");
  const width = v?.width ?? 0;
  const height = v?.height ?? 0;
  if (!width || !height) throw new ProbeError("unreadable", "We couldn't read this picture.");
  if (Math.max(width, height) > 8192) throw new ProbeError("too_large_resolution", `This picture is ${width} × ${height}. The limit is 8192 px.`);
  return { container: "image", videoCodec: v?.codec_name ?? "unknown", width, height, fps: 0, duration: 0, hasAudio: false, audioCodec: null, colorTransfer: null };
}

/** Sound only (music, voiceover). */
export function checkAudio(p: FfProbe): Omit<VideoInfo, "soundDetected"> {
  const a = (p.streams ?? []).find((s) => s.codec_type === "audio");
  if (!a) throw new ProbeError("unreadable", "We couldn't read this sound file.");
  const duration = Number(p.format?.duration ?? a.duration ?? 0);
  if (!(duration > 0)) throw new ProbeError("unreadable", "We couldn't read this sound file's length.");
  if (duration > LIMITS.maxAudioSec + 0.05) throw new ProbeError("too_long", `This sound is ${Math.round(duration / 60)} min long. The limit is ${LIMITS.maxAudioSec / 60} min.`);
  const formats = (p.format?.format_name ?? "").split(",");
  return { container: formats[0] ?? "audio", videoCodec: "none", width: 0, height: 0, fps: 0, duration: Math.round(duration * 1000) / 1000, hasAudio: true, audioCodec: a.codec_name ?? null, colorTransfer: null };
}

/** Which kind of media an ffprobe result is: a picture, sound only, or a video. */
export function mediaKindOf(p: FfProbe): MediaKind {
  const formats = (p.format?.format_name ?? "").split(",");
  const streams = p.streams ?? [];
  const pictures = streams.filter((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  if (formats.some((f) => IMAGE_FORMATS.includes(f))) return "image";
  if (!pictures.length && streams.some((s) => s.codec_type === "audio") && formats.some((f) => AUDIO_FORMATS.includes(f))) return "audio";
  return "video";
}

/** Probe any upload: a video (the checks above), a picture, or a sound file. */
export async function probeMedia(path: string): Promise<{ kind: MediaKind; info: VideoInfo }> {
  let json: FfProbe;
  try {
    const out = await runFfprobe([...SAFE_INPUT, "-print_format", "json", "-show_format", "-show_streams", path], { timeoutMs: 30_000 });
    json = JSON.parse(out) as FfProbe;
  } catch {
    throw new ProbeError("unreadable", "We couldn't read this file. It may be damaged or still downloading.");
  }
  const kind = mediaKindOf(json);
  if (kind === "image") return { kind, info: { ...checkImage(json), soundDetected: false } };
  if (kind === "audio") {
    const info = checkAudio(json);
    return { kind, info: { ...info, soundDetected: await detectSound(path) } };
  }
  const info = checkProbe(json);
  return { kind, info: { ...info, soundDetected: info.hasAudio ? await detectSound(path) : false } };
}

export async function probeVideo(path: string): Promise<VideoInfo> {
  let json: FfProbe;
  try {
    const out = await runFfprobe([...SAFE_INPUT, "-print_format", "json", "-show_format", "-show_streams", path], { timeoutMs: 30_000 });
    json = JSON.parse(out) as FfProbe;
  } catch {
    throw new ProbeError("unreadable", "We couldn't read this video. It may be damaged or still downloading.");
  }
  const info = checkProbe(json);
  const soundDetected = info.hasAudio ? await detectSound(path) : false;
  return { ...info, soundDetected };
}
