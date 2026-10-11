/**
 * Your logo (Brand Kit) on the video: when it shows (a part of the video or all
 * of it), how it comes in and goes out, and the badge it's drawn as (a box in
 * a brand color, rounded corners). The preview uses logoState and draws with
 * drawLogoBadge; the export draws the same badge as a PNG in the browser and
 * uses logoExpr (the same curves as FFmpeg expressions), like lib/player/anim.
 */
import type { Watermark } from "../edit/doc";

/** Seconds a logo takes to come in or go out. */
export const LOGO_ANIM = 0.5;
type Box = { x: number; y: number; w: number; h: number };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const n4 = (v: number) => (Math.round(v * 10000) / 10000).toString();
const f3 = (v: number) => (Math.round(v * 1000) / 1000).toFixed(3);
// "pop": grows from half size with a small overshoot (ease-out-back)
const C1 = 1.70158;
const C3 = C1 + 1;
const pop = (p: number) => 0.5 + 0.5 * (1 + C3 * (p - 1) ** 3 + C1 * (p - 1) ** 2);

/** The part of the video the logo shows in (seconds), inside a D-second video. */
export function logoWindow(wm: Pick<Watermark, "from" | "to">, D: number): { from: number; to: number } {
  const from = Math.min(D, Math.max(0, wm.from ?? 0));
  const to = Math.min(D, Math.max(from, wm.to ?? D));
  return { from, to };
}

/** Where a sliding logo comes from: off the nearest side of the canvas. */
const slideFrom = (box: Box, W: number) => (box.x + box.w / 2 > W / 2 ? W - box.x : -(box.x + box.w));

/** The logo at timeline time t: shown?, opacity (on top of its own), size factor, sideways offset (pixels). */
export function logoState(wm: Watermark, t: number, D: number, W: number, box: Box): { show: boolean; alpha: number; scale: number; dx: number } {
  const { from, to } = logoWindow(wm, D);
  if (t < from - 1e-6 || t > to + 1e-6 || to <= from) return { show: false, alpha: 0, scale: 1, dx: 0 };
  const d = Math.min(LOGO_ANIM, (to - from) / 2);
  const a = wm.anim ?? { in: "none", out: "none" };
  const s = { show: true, alpha: 1, scale: 1, dx: 0 };
  const off = slideFrom(box, W);
  if (a.in !== "none" && d > 0) {
    const p = clamp01((t - from) / d);
    if (a.in === "fade" || a.in === "pop") s.alpha *= p;
    if (a.in === "pop") s.scale *= pop(p);
    if (a.in === "slide") s.dx += off * (1 - p) ** 3;
  }
  if (a.out !== "none" && d > 0) {
    const q = clamp01((to - t) / d);
    if (a.out === "fade" || a.out === "pop") s.alpha *= q;
    if (a.out === "pop") s.scale *= pop(q);
    if (a.out === "slide") s.dx += off * (1 - q) ** 3;
  }
  return s;
}

/**
 * The same for FFmpeg: when it shows (overlay enable), the fades (on the logo
 * picture, whose time is the timeline's), a size factor for scale (null: none)
 * and an x offset to add to the overlay's x.
 */
export function logoExpr(wm: Watermark, D: number, W: number, box: Box): { enable: string; fades: string[]; scale: string | null; dx: string } {
  const { from, to } = logoWindow(wm, D);
  const d = Math.min(LOGO_ANIM, (to - from) / 2);
  const a = wm.anim ?? { in: "none", out: "none" };
  const fades: string[] = [];
  const scale: string[] = [];
  let dx = "";
  const off = slideFrom(box, W);
  const pIn = `clip((t-${n4(from)})/${n4(Math.max(d, 1e-3))}\\,0\\,1)`;
  const pOut = `clip((${n4(to)}-t)/${n4(Math.max(d, 1e-3))}\\,0\\,1)`;
  const popE = (p: string) => `(0.5+0.5*(1+${n4(C3)}*pow(${p}-1\\,3)+${n4(C1)}*pow(${p}-1\\,2)))`;
  if (d > 0) {
    if (a.in === "fade" || a.in === "pop") fades.push(`fade=t=in:st=${f3(from)}:d=${f3(d)}:alpha=1`);
    if (a.out === "fade" || a.out === "pop") fades.push(`fade=t=out:st=${f3(Math.max(from, to - d))}:d=${f3(d)}:alpha=1`);
    if (a.in === "pop") scale.push(popE(pIn));
    if (a.out === "pop") scale.push(popE(pOut));
    if (a.in === "slide") dx += `${off < 0 ? "-" : "+"}${n4(Math.abs(off))}*pow(1-${pIn}\\,3)`;
    if (a.out === "slide") dx += `${off < 0 ? "-" : "+"}${n4(Math.abs(off))}*pow(1-${pOut}\\,3)`;
  }
  return { enable: `between(t\\,${f3(from)}\\,${f3(to)})`, fades, scale: scale.length ? scale.join("*") : null, dx };
}

/**
 * Draw the logo badge into `box` (canvas pixels): the box in its color with
 * rounded corners, the logo inside it (or, without a box, the logo itself with
 * rounded corners). `pad`: room around the logo, in the same pixels.
 */
export function drawLogoBadge(ctx: CanvasRenderingContext2D, img: CanvasImageSource, iw: number, ih: number, wm: Pick<Watermark, "plate" | "radius">, box: Box, pad: number) {
  const r = (wm.radius ?? 0) * Math.min(box.w, box.h);
  const inner = { x: box.x + pad, y: box.y + pad, w: Math.max(1, box.w - pad * 2), h: Math.max(1, box.h - pad * 2) };
  ctx.save();
  if (wm.plate) {
    ctx.fillStyle = wm.plate.color;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, r);
    ctx.fill();
  } else if (r > 0) {
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, r);
    ctx.clip();
  }
  // the logo keeps its shape inside
  const k = Math.min(inner.w / Math.max(1, iw), inner.h / Math.max(1, ih));
  const dw = iw * k;
  const dh = ih * k;
  ctx.drawImage(img, inner.x + (inner.w - dw) / 2, inner.y + (inner.h - dh) / 2, dw, dh);
  ctx.restore();
}

/** Whether the badge needs drawing (a box or rounded corners); a plain logo is used as it is. */
export const logoHasBadge = (wm: Pick<Watermark, "plate" | "radius">) => !!wm.plate || (wm.radius ?? 0) > 0;
