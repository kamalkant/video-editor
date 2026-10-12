import { z } from "zod";
import { DEFAULT_OUTPUT, opInstanceSchema, sanitizeSpec, type OpInstance } from "../edit/spec";

/**
 * The timeline filmstrip ("film"): one picture per video with frames in a grid, 54 px high,
 * each at the video's own shape. The timeline lays them side by side at their shape, so they
 * never stretch when zooming (the old strip was pulled to the clip's width).
 */
export const FILM_COLS = 16;
export const FILM_H = 108;

/** How many frames the film has: about two a second, 12 to 240 (never more than the video has). */
export function filmCount(duration: number, fps: number): number {
  const n = Math.min(240, Math.max(12, Math.ceil(duration * 2)));
  return Math.max(1, Math.min(n, Math.floor(duration * fps) || 1));
}

/** One frame's size in the film (even width, as FFmpeg's scale needs). */
export function filmFrameW(width: number, height: number): number {
  return Math.max(2, Math.round((FILM_H * (width || 16)) / (height || 9) / 2) * 2);
}

/** The frame that shows this source time. */
export function filmIndex(t: number, duration: number, n: number): number {
  return Math.min(n - 1, Math.max(0, Math.floor((t / Math.max(1e-6, duration)) * n)));
}

export type FilmTile = { key: number; left: number; width: number; bgSize: string; bgPos: string };

/**
 * The tiles a clip shows between `from` and `to` (px inside the clip; only what's on screen is
 * drawn). Each tile is `tileH` high at the frame's shape and shows the source second under its middle.
 */
export function filmTiles(o: {
  /** the clip's width on screen and the part of it in view (px) */
  width: number;
  from: number;
  to: number;
  tileH: number;
  media: { width: number; height: number; duration: number; fps: number };
  /** source seconds at the clip's left edge, and on screen px per source second */
  srcIn: number;
  srcOut: number;
  srcPerSec: number;
  reversed?: boolean;
}): FilmTile[] {
  const n = filmCount(o.media.duration, o.media.fps);
  const fw = filmFrameW(o.media.width, o.media.height);
  const s = o.tileH / FILM_H;
  const tileW = fw * s;
  if (!(tileW > 0) || !(o.width > 0)) return [];
  const rows = Math.ceil(n / FILM_COLS);
  const bgSize = `${FILM_COLS * tileW}px ${rows * o.tileH}px`;

  // Visible horizontal range in clip coordinates
  const clipMin = Math.max(0, o.from);
  const clipMax = Math.min(o.width, o.to);
  if (clipMin >= clipMax) return [];

  const out: FilmTile[] = [];

  if (o.reversed) {
    // In reversed playback, the clip left edge is at source time srcOut
    // Media time t is at clip coordinate x = (srcOut - t) * srcPerSec
    // originX is the position of media.duration in clip coordinates:
    const originX = (o.srcOut - o.media.duration) * o.srcPerSec;
    const firstM = Math.max(0, Math.floor((clipMin - originX) / tileW));
    const maxM = Math.ceil((o.media.duration * o.srcPerSec) / tileW);
    const lastM = Math.min(maxM, Math.ceil((clipMax - originX) / tileW));

    for (let m = firstM; m < lastM; m++) {
      const tileLeft = originX + m * tileW;
      const t = Math.max(0, Math.min(o.media.duration, o.media.duration - (m + 0.5) * (tileW / o.srcPerSec)));
      const i = filmIndex(t, o.media.duration, n);
      out.push({
        key: m,
        left: tileLeft,
        width: tileW,
        bgSize,
        bgPos: `${-(i % FILM_COLS) * tileW}px ${-Math.floor(i / FILM_COLS) * o.tileH}px`,
      });
    }
  } else {
    // Media-anchored filmstrip: media t = 0 is at originX = -srcIn * srcPerSec
    const originX = -o.srcIn * o.srcPerSec;
    const firstM = Math.max(0, Math.floor((clipMin - originX) / tileW));
    const maxM = Math.ceil((o.media.duration * o.srcPerSec) / tileW);
    const lastM = Math.min(maxM, Math.ceil((clipMax - originX) / tileW));

    for (let m = firstM; m < lastM; m++) {
      const tileLeft = originX + m * tileW;
      const t = Math.max(0, Math.min(o.media.duration, (m + 0.5) * (tileW / o.srcPerSec)));
      const i = filmIndex(t, o.media.duration, n);
      out.push({
        key: m,
        left: tileLeft,
        width: tileW,
        bgSize,
        bgPos: `${-(i % FILM_COLS) * tileW}px ${-Math.floor(i / FILM_COLS) * o.tileH}px`,
      });
    }
  }

  return out;
}

/** The see-through settings for the film's URL (only switched-on ones; base64url JSON). Empty: none. */
export function filmOpsParam(ops: OpInstance[]): string {
  const on = ops.filter((o) => o.enabled);
  if (!on.length) return "";
  const bytes = new TextEncoder().encode(JSON.stringify(on));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Read the film's settings back (server): checked and cleaned like any edit. Throws on bad input. */
export function parseFilmOps(param: string): OpInstance[] {
  if (param.length > 20_000) throw new Error("too long");
  const json = new TextDecoder().decode(Uint8Array.from(atob(param.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));
  const ops = z.array(opInstanceSchema).max(20).parse(JSON.parse(json));
  return sanitizeSpec({ version: 1, ops, output: DEFAULT_OUTPUT }).ops.filter((o) => o.enabled);
}

/**
 * Where each frame of a film goes, for a film made in the browser (lib/media/localMedia) with the same
 * layout as the server's (lib/ffmpeg/preview renderFilm): frame i shows the middle of slot i, at column
 * i % FILM_COLS and row ⌊i / FILM_COLS⌋, each `fw` × FILM_H.
 */
export function filmSlots(duration: number, fps: number, width: number, height: number) {
  const n = filmCount(duration, fps);
  const fw = filmFrameW(width, height);
  const rows = Math.ceil(n / FILM_COLS);
  return {
    n,
    fw,
    canvasW: FILM_COLS * fw,
    canvasH: rows * FILM_H,
    at: (i: number) => ({ t: ((i + 0.5) * duration) / n, x: (i % FILM_COLS) * fw, y: Math.floor(i / FILM_COLS) * FILM_H }),
  };
}
