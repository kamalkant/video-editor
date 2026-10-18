/**
 * About how big an export file will be, before making it.
 *
 * The video encoders aim for a quality, not a size, so the size depends on how
 * busy the picture is. That comes in as `bpp`: bits per pixel per frame of an
 * H.264 (CRF 23) test encode of the project's own clips (GET
 * /api/videos/[id]/busyness). Every other format is a measured ratio to that
 * (lib/export/rates settings, checked on test clips). ProRes, pictures and
 * sound hardly depend on the picture. No server code: the dialog uses it.
 */
import { clipLength, docDuration, type TimelineDoc } from "../edit/doc";
import type { Quality } from "../settings";
import { AUDIO_KBPS, GIF_FPS, GIF_MAX_W, MP3_KBPS } from "./rates";
import type { ExportFormat } from "./presets";

/** A calm picture (pictures, text, slides) when there's no video to measure. */
export const STILL_BPP = 0.02;
/** A typical video when the measurement isn't back (or failed). */
export const TYPICAL_BPP = 0.035;

/** Size of each video codec (at each quality) next to H.264 CRF 23 (measured on moving test clips). */
const RATIO: Record<"mp4" | "hevc" | "av1" | "webm" | "webm-alpha" | "mov-alpha", Record<Quality, number>> = {
  mp4: { small: 0.5, balanced: 1, best: 1.8 },
  hevc: { small: 0.35, balanced: 0.7, best: 1.25 },
  av1: { small: 0.32, balanced: 0.65, best: 1.15 },
  webm: { small: 0.42, balanced: 0.85, best: 1.5 },
  // see-through files also carry the alpha (the outline): a bit more
  "webm-alpha": { small: 0.4, balanced: 0.75, best: 1.3 },
  "mov-alpha": { small: 0.35, balanced: 0.65, best: 1.1 },
};
/** ProRes: about this many bits per pixel per frame, whatever the picture. */
const PRORES_BPP = 3.9;
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
  /** the website pack also holds the ProRes master */
  master?: boolean;
  /** transparent canvas or keyed subject video */
  transparent?: boolean;
};

const bytes = (bits: number) => Math.max(0, Math.round(bits / 8));

/** About how many bytes the export in `format` will be. */
export function estimateBytes(format: ExportFormat, p: SizeInput): number {
  const D = Math.max(0, p.duration);
  const px = Math.max(1, p.width * p.height);
  let bpp = p.bpp ?? TYPICAL_BPP;
  // If video is transparent / keyed avatar, background is removed so active pixels take fewer bits
  const isAlphaFormat = format === "webm-alpha" || format === "mov-alpha";
  if (p.transparent || isAlphaFormat) {
    bpp *= 0.65;
  }
  // fewer pixels need a little more per pixel (and the other way round)
  if (p.bpp != null && p.measuredAt) bpp *= Math.min(2, Math.max(0.5, ((p.measuredAt.width * p.measuredAt.height) / px) ** 0.25));
  const video = (ratio: number) => px * p.fps * D * bpp * ratio;
  const sound = (kbps: number) => (p.hasSound ? kbps * 1000 * D : 0);
  const box = 1.015; // the file's own bookkeeping
  switch (format) {
    case "mp4":
    case "hevc":
    case "av1":
    case "webm":
    case "webm-alpha":
    case "mov-alpha": {
      const a = format === "webm" ? AUDIO_KBPS.vp9 : format === "webm-alpha" ? AUDIO_KBPS.webm : format === "mov-alpha" ? AUDIO_KBPS.mov : AUDIO_KBPS.mp4;
      return bytes((video(RATIO[format][p.quality]) + sound(a)) * box);
    }
    case "prores":
      return bytes((px * p.fps * D * PRORES_BPP + sound(AUDIO_KBPS.pcm)) * box);
    case "prores4444":
      return bytes((px * p.fps * D * PRORES4444_BPP + sound(AUDIO_KBPS.pcm)) * box);
    case "pack": {
      // one zip (not compressed again): WebM + MOV + a poster (+ the ProRes master)
      const poster = px * 0.6;
      const master = p.master ? estimateBytes("prores4444", p) : 0;
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
  }
}

/** Whether a format's size needs the picture measured (the others are known right away). */
export const needsBusyness = (f: ExportFormat) => !["png", "jpg", "mp3", "m4a", "wav", "prores", "prores4444"].includes(f);

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
