/**
 * About how big an export file will be, before making it.
 *
 * MP4, HEVC, WebM and the see-through WebM / MOV are made at a set bitrate
 * (lib/export/rates videoBitrate, also used by the browser export and the
 * server), so their size is that rate × the length. A light project (its clips'
 * own bitrate, contentCapBpp) is made lighter, the same way on both sides.
 *
 * AV1 and GIF aim for a quality, not a size, so their size depends on how busy
 * the picture is. That comes in as `bpp`: bits per pixel per frame of an H.264
 * (CRF 23) test encode of the project's own clips (GET
 * /api/videos/[id]/busyness). ProRes, pictures and sound hardly depend on the
 * picture. No server code: the dialog uses it.
 */
import { clipLength, docDuration, type TimelineDoc } from "../edit/doc";
import type { Quality } from "../settings";
import { AUDIO_KBPS, GIF_FPS, GIF_MAX_W, MP3_KBPS, videoBitrate, type BitrateCodec } from "./rates";
import type { ExportFormat } from "./presets";

/** A calm picture (pictures, text, slides) when there's no video to measure. */
export const STILL_BPP = 0.02;
/** A typical video when the measurement isn't back (or failed). */
export const TYPICAL_BPP = 0.035;

/** Size of AV1 (at each quality) next to H.264 CRF 23 (measured on moving test clips). */
const AV1_RATIO: Record<Quality, number> = { small: 0.32, balanced: 0.65, best: 1.15 };
const PRORES4444_BPP = 7.6;

export type SizeInput = {
  width: number;
  height: number;
  fps: number;
  /** seconds */
  duration: number;
  quality: Quality;
  hasSound: boolean;
  /** H.264 CRF 23 bits per pixel per frame of this project (null: not known yet → a typical value) */
  bpp: number | null;
  /** the size `bpp` was measured at (other sizes: a little more per pixel when smaller) */
  measuredAt?: { width: number; height: number };
  /** the clips' own bits per pixel at this size (contentCapBpp; null: not known, no cap) */
  capBpp?: number | null;
  /** the website pack also holds the ProRes master */
  master?: boolean;
  /** transparent canvas or keyed subject video */
  transparent?: boolean;
  /** whether server supports hardware HEVC alpha (false on Linux => uses ProRes 4444) */
  safariAlpha?: boolean;
};

const bytes = (bits: number) => Math.max(0, Math.round(bits / 8));

/** The codec a format is made with at a set bitrate (null: not one of those). */
export function bitrateCodecOf(format: ExportFormat, safariAlpha = true): BitrateCodec | null {
  switch (format) {
    case "mp4":
      return "h264";
    case "hevc":
      return "hevc";
    case "webm":
      return "vp9";
    case "webm-alpha":
      return "vp9-alpha";
    case "mov-alpha":
      // without Apple's encoder the MOV is ProRes 4444 (no set bitrate, a big file)
      return safariAlpha ? "hevc-alpha" : null;
    default:
      return null;
  }
}

/** Sound bitrate (kbit/s) of each video format. */
export function audioKbpsOf(format: ExportFormat): number {
  return format === "webm" ? AUDIO_KBPS.vp9 : format === "webm-alpha" ? AUDIO_KBPS.webm : format === "mov-alpha" ? AUDIO_KBPS.mov : format === "hevc" ? AUDIO_KBPS.hevc : AUDIO_KBPS.mp4;
}

/** About how many bytes the export in `format` will be. */
export function estimateBytes(format: ExportFormat, p: SizeInput): number {
  const D = Math.max(0, p.duration);
  const px = Math.max(1, p.width * p.height);
  let bpp = p.bpp ?? TYPICAL_BPP;
  // fewer pixels need a little more per pixel (and the other way round)
  if (p.bpp != null && p.measuredAt) bpp *= Math.min(2, Math.max(0.5, ((p.measuredAt.width * p.measuredAt.height) / px) ** 0.25));
  const sound = (kbps: number) => (p.hasSound ? kbps * 1000 * D : 0);
  const box = 1.015; // the file's own bookkeeping
  const codec = bitrateCodecOf(format, p.safariAlpha);
  if (codec) return bytes((videoBitrate(codec, p.quality, p.width, p.height, p.fps, p.capBpp) * D + sound(audioKbpsOf(format))) * box);
  switch (format) {
    case "av1":
      return bytes((px * p.fps * D * bpp * AV1_RATIO[p.quality] + sound(AUDIO_KBPS.av1)) * box);
    case "mov-alpha":
      // ProRes 4444 (a server without Apple's HEVC alpha encoder)
      return bytes((px * p.fps * D * PRORES4444_BPP + sound(AUDIO_KBPS.pcm)) * box);
    case "pack": {
      // one zip (not compressed again): WebM + MOV + a poster (+ the ProRes master)
      const poster = px * 0.6;
      const master = p.master ? bytes((px * p.fps * D * PRORES4444_BPP + sound(AUDIO_KBPS.pcm)) * box) : 0;
      return Math.round(estimateBytes("webm-alpha", p) + estimateBytes("mov-alpha", p) + poster + master);
    }
    case "gif": {
      // at most 640 px wide and 15 frames a second; a GIF grows fast with a busy picture
      const k = Math.min(1, GIF_MAX_W / Math.max(1, p.width));
      const gpx = p.width * k * p.height * k;
      const bits = Math.min(6, Math.max(0.5, 25 * bpp));
      return bytes(gpx * Math.min(p.fps, GIF_FPS) * D * bits);
    }
    case "png":
      return Math.round(px * 1.2);
    case "jpg":
      return Math.round(px * 0.2);
    case "mp3":
      return bytes(sound(MP3_KBPS[p.quality]));
    case "m4a":
      return bytes(sound(AUDIO_KBPS.m4a) * box);
    case "wav":
      return p.hasSound ? Math.round(192_000 * D + 44) : 0;
    default:
      return 0;
  }
}

/** Whether a format's size needs the picture measured (the others are known right away). */
export const needsBusyness = (f: ExportFormat) => f === "av1" || f === "gif";

/** What to measure for a timeline: its longest video clips (a sample from each one's middle) and how much of it is video. */
export type SizeBasis = {
  samples: { mediaId: string; at: number; weight: number; len?: number }[];
  /** share of the timeline that is video (the rest: pictures, text, backgrounds) */
  videoShare: number;
  width: number;
  height: number;
  fps: number;
};

/** Seconds measured from each clip (lib/ffmpeg/busyness). */
const SAMPLE = 2;

export function sizeBasisOf(doc: TimelineDoc): SizeBasis {
  const D = docDuration(doc);
  const vids: { mediaId: string; mid: number; len: number; main: boolean }[] = [];
  for (const t of doc.tracks) {
    if (t.kind === "audio" || (t.kind === "overlay" && t.hidden)) continue;
    for (const c of t.clips) if (c.type === "video") vids.push({ mediaId: c.mediaId, mid: (c.in + c.out) / 2, len: clipLength(c), main: t.kind === "main" });
  }
  const covered = Math.min(D, vids.filter((v) => v.main).reduce((a, v) => a + v.len, 0) || vids.reduce((a, v) => Math.max(a, v.len), 0));
  const top = [...vids].sort((a, b) => b.len - a.len).slice(0, 2);
  const total = top.reduce((a, v) => a + v.len, 0) || 1;
  return {
    samples: top.map((v) => ({ mediaId: v.mediaId, at: Math.max(0, Math.round(v.mid - SAMPLE / 2)), weight: Math.round((v.len / total) * 1000) / 1000, len: v.len })),
    videoShare: D > 0 ? Math.round((covered / D) * 1000) / 1000 : 0,
    width: doc.canvas.width,
    height: doc.canvas.height,
    fps: doc.canvas.fps,
  };
}

/** The project's bits per pixel from the measured samples (in the same order). */
export function bppOf(b: SizeBasis, measured: number[]): number {
  if (!b.samples.length) return STILL_BPP;
  const video = b.samples.reduce((a, s, i) => a + s.weight * (measured[i] ?? TYPICAL_BPP), 0);
  return video * b.videoShare + STILL_BPP * (1 - b.videoShare);
}

/** What is known about a clip's file: its size in bytes, picture size and length (lib/media/localMedia localInfo). */
export type FileInfo = (mediaId: string) => { size: number; width: number; height: number; duration: number } | null;

/** Bits per pixel a picture-and-text stretch needs at most. */
const STILL_CAP_BPP = 0.03;
/** Sound inside a clip's file (taken off its bitrate). */
const CLIP_AUDIO_BPS = 128_000;

/**
 * The project's clips' own bits per pixel per frame at the export size: no use
 * making a file heavier than what went in (a WhatsApp clip, a screen
 * recording). Each video clip's file bitrate, scaled to the export size and
 * weighted by its length; picture and text stretches count as a calm picture.
 * Null when a clip's file isn't known (then nothing is capped).
 */
export function contentCapBpp(doc: TimelineDoc, info: FileInfo, size?: { width: number; height: number }): number | null {
  const W = size?.width ?? doc.canvas.width;
  const H = size?.height ?? doc.canvas.height;
  const px = Math.max(1, W * H);
  const fps = Math.max(1, doc.canvas.fps || 30);
  const D = docDuration(doc);
  if (D <= 0) return null;
  let sum = 0;
  let weight = 0;
  let mainVideo = 0;
  let longest = 0;
  for (const t of doc.tracks) {
    if (t.kind === "audio" || (t.kind === "overlay" && t.hidden)) continue;
    for (const c of t.clips) {
      if (c.type !== "video") continue;
      const f = info(c.mediaId);
      if (!f || !(f.size > 0) || !(f.duration > 0)) return null;
      const bps = Math.max((f.size * 8) / f.duration / 2, (f.size * 8) / f.duration - CLIP_AUDIO_BPS);
      const srcPx = f.width > 0 && f.height > 0 ? f.width * f.height : px;
      const len = clipLength(c);
      sum += ((bps * (px / srcPx) ** 0.75) / (px * fps)) * len;
      weight += len;
      if (t.kind === "main") mainVideo += len;
      longest = Math.max(longest, len);
    }
  }
  if (!weight) return STILL_CAP_BPP;
  const share = Math.min(1, (mainVideo || longest) / D);
  return (sum / weight) * share + STILL_CAP_BPP * (1 - share);
}

/** The smallest and largest side an export can have (the canvas limits, lib/edit/doc canvasSchema). */
export const EXPORT_MIN_SIDE = 64;
export const EXPORT_MAX_SIDE = 3840;

/** A width or height typed for an export, as the export can make it: even (H.264 / HEVC need it) and within the limits. */
export function exportSide(v: number): number {
  if (!Number.isFinite(v)) return EXPORT_MIN_SIDE;
  return Math.min(EXPORT_MAX_SIDE, Math.max(EXPORT_MIN_SIDE, Math.round(v / 2) * 2));
}
