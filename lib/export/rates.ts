/**
 * Encoder settings of the export formats, shared by the export (lib/render/compose)
 * and the size estimate (lib/export/size). No server code here: the browser uses it too.
 */
import type { Quality } from "../settings";

export const MP4_CRF: Record<Quality, number> = { small: 28, balanced: 23, best: 19 };
export const AV1_CRF: Record<Quality, number> = { small: 40, balanced: 34, best: 28 };
export const VP9_CRF: Record<Quality, number> = { small: 38, balanced: 32, best: 26 };
export const MP3_KBPS: Record<Quality, number> = { small: 128, balanced: 192, best: 320 };

/** Sound in each kind of file (kbit/s). PCM (ProRes, WAV) is 48 kHz stereo 16-bit. */
export const AUDIO_KBPS = {
  mp4: 160,
  hevc: 160,
  av1: 160,
  vp9: 128,
  /** WebM + alpha (website file) */
  webm: 64,
  /** MOV + alpha (website file) */
  mov: 96,
  m4a: 192,
  pcm: 1536,
} as const;

export const GIF_FPS = 15;
export const GIF_MAX_W = 640;
