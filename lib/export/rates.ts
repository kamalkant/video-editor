/**
 * Encoder settings of the export formats, shared by the export (lib/render/compose,
 * lib/export/localExport) and the size estimate (lib/export/size). No server code
 * here: the browser uses it too.
 */
import type { Quality } from "../settings";

export const MP4_CRF: Record<Quality, number> = { small: 28, balanced: 23, best: 19 };
export const AV1_CRF: Record<Quality, number> = { small: 40, balanced: 34, best: 28 };
export const MP3_KBPS: Record<Quality, number> = { small: 128, balanced: 192, best: 320 };

/** Sound in each kind of file (kbit/s). PCM (ProRes, WAV) is 48 kHz stereo 16-bit. */
export const AUDIO_KBPS = {
  mp4: 128,
  hevc: 128,
  av1: 128,
  vp9: 96,
  /** WebM + alpha (website file) */
  webm: 64,
  /** MOV + alpha (website file) */
  mov: 96,
  m4a: 192,
  pcm: 1536,
} as const;

export const GIF_FPS = 15;
export const GIF_MAX_W = 640;

/**
 * The video files are made at a set bitrate (not a set quality), so the size
 * shown before making one is the size it comes out at. H.264 bits per pixel
 * per frame; 1080p30: about 2.8 / 4.4 / 6.8 Mbit/s.
 */
export const VIDEO_BPP: Record<Quality, number> = { small: 0.045, balanced: 0.07, best: 0.11 };

/** The video codecs made at a bitrate: H.264, HEVC, VP9, VP9 + alpha, HEVC + alpha. */
export type BitrateCodec = "h264" | "hevc" | "vp9" | "vp9-alpha" | "hevc-alpha";

/**
 * Bitrate of each codec next to H.264 for about the same picture. A see-through
 * file is mostly empty around the subject (its outline included), so it needs less.
 */
export const CODEC_FACTOR: Record<BitrateCodec, number> = {
  h264: 1,
  hevc: 0.65,
  vp9: 0.7,
  "vp9-alpha": 0.4,
  "hevc-alpha": 0.45,
};

/** How much of the clips' own bitrate each quality may use (see contentCapBpp in lib/export/size). */
const CAP_SHARE: Record<Quality, number> = { small: 0.6, balanced: 0.85, best: 1.2 };

const MIN_BPS = 300_000;
const MAX_BPS = 40_000_000;

/**
 * Video bits per second for a file. `capBpp`: the clips' own bits per pixel at
 * this size (lib/export/size contentCapBpp), so a light clip isn't made heavier.
 */
export function videoBitrate(codec: BitrateCodec, quality: Quality, width: number, height: number, fps: number, capBpp?: number | null): number {
  const bpp = capBpp != null && capBpp > 0 ? Math.min(VIDEO_BPP[quality], capBpp * CAP_SHARE[quality]) : VIDEO_BPP[quality];
  const bps = Math.max(1, width * height) * Math.max(1, fps) * bpp * CODEC_FACTOR[codec];
  return Math.round(Math.min(MAX_BPS, Math.max(MIN_BPS, bps)));
}
