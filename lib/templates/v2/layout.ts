import type { Anchor, Ratio } from "./spec";

/** The canvas of each shape (1080p class). */
export const CANVAS: Record<Ratio, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
};

/** The area text and graphics keep to (shares of the canvas): the edges leave room for phone and TV crops. */
export const SAFE: Record<Ratio, { l: number; t: number; r: number; b: number }> = {
  "16:9": { l: 0.06, t: 0.08, r: 0.06, b: 0.08 },
  "9:16": { l: 0.07, t: 0.12, r: 0.07, b: 0.2 },
  "1:1": { l: 0.07, t: 0.08, r: 0.07, b: 0.08 },
};

/**
 * Text sizes are written for 16:9; a narrow canvas takes smaller text, so a line still fits. (Text grows with
 * the canvas height: a 1080 × 1920 canvas would draw it 1.8 times as big, on a canvas 0.56 times as wide.)
 */
export const textScale = (r: Ratio): number => {
  // (the share of 16:9's line width each shape can give: a 16:9 title at most 55 % wide fits the safe area)
  return r === "16:9" ? 1 : r === "1:1" ? 0.62 : 0.48;
};

/**
 * Where an anchor is, as the clip's transform offset (the centre, in canvas widths / heights from the middle).
 * `inset`: how far from the safe area's edge the centre sits (a share of the canvas), for left / right / top / bottom.
 */
export function offsetOf(a: Anchor, r: Ratio, inset = { x: 0.2, y: 0.12 }): { x: number; y: number } {
  const s = SAFE[r];
  const w = 1 - s.l - s.r;
  const h = 1 - s.t - s.b;
  const mid = { x: (s.l - s.r) / 2, y: (s.t - s.b) / 2 };
  const px = a.x === "left" ? -(w / 2 - Math.min(inset.x, w / 2)) : a.x === "right" ? w / 2 - Math.min(inset.x, w / 2) : 0;
  const py = a.y === "top" ? -(h / 2 - Math.min(inset.y, h / 2)) : a.y === "bottom" ? h / 2 - Math.min(inset.y, h / 2) : 0;
  return { x: mid.x + px + (a.dx ?? 0) * w, y: mid.y + py + (a.dy ?? 0) * h };
}

/** Does a centre offset stay inside the safe area (with `slack` for the clip's own half size)? */
export const insideSafe = (o: { x: number; y: number }, r: Ratio, slack = 0): boolean => {
  const s = SAFE[r];
  return o.x >= -0.5 + s.l - slack && o.x <= 0.5 - s.r + slack && o.y >= -0.5 + s.t - slack && o.y <= 0.5 - s.b + slack;
};
