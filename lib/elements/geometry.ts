import type { ElementClip, ElementLook, Transform } from "../edit/doc";
import { hasKeys, motionAt, motionSpan } from "../edit/keyframes";
import { workScale, type Rect } from "../player/layout";
import { pivotCenter } from "../player/quad";
import { fontStack, type Measure } from "../text/layout";

/**
 * Where elements go and how big they are (pure: the preview, the export and
 * the tests use the same numbers). An element's box is fitted to the canvas by
 * its own shape (width ÷ height), then scaled and moved like a picture. Unlike
 * a picture, a quarter turn never changes its size: an arrow turned upright
 * stays as long.
 */

/** The export draws an element at most this big on a side. */
export const ELEMENT_MAX_SIDE = 4096;
/** A ticker's strip of words may be longer (lib/renders allows 8192). */
export const MAX_STRIP = 8192;
/** A stretched box never gets thinner than this (canvas pixels). */
export const MIN_SIDE = 4;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);

/** An element's box at scale 1 on a W × H canvas: as big as fits, in its own shape. */
export function elementUnit(aspect: number, W: number, H: number): { w: number; h: number } {
  const a = clamp(aspect, 0.02, 200);
  return a >= W / H ? { w: W, h: W / a } : { w: H * a, h: H };
}

/** Where an element is `into` seconds in (keyframes move it): its box before turning, its angle and opacity. */
export function elementRect(c: ElementClip, into: number, W: number, H: number): Rect & { rot: number; opacity: number } {
  const u = elementUnit(c.el.aspect, W, H);
  const m = motionAt(c, into);
  const w = u.w * m.scale;
  const h = u.h * m.scale;
  // (it turns, sizes and skews around its pivot: lib/player/quad)
  const p = pivotCenter(W / 2 + m.x * W, H / 2 + m.y * H, w, h, u.w, u.h, { rotation: m.rotation, skewX: m.skewX, skewY: m.skewY, pivot: c.transform.pivot });
  return { x: p.x - w / 2, y: p.y - h / 2, w, h, rot: m.rotation, opacity: m.opacity };
}

/**
 * The scale the export draws an element at: its size on the canvas, or (when
 * keyframes change its size) its biggest, capped like a moving picture's.
 */
export function elementRefScale(c: ElementClip, W: number, H: number): number {
  if (!hasKeys(c)) return c.transform.scale;
  const span = motionSpan(c);
  if (!span.moving) return motionAt(c, 0).scale;
  const u = elementUnit(c.el.aspect, W, H);
  return workScale(u.w, u.h, span.max.scale, W, H);
}

/** The picture the export gets for an element (the browser draws it): even pixels, at most ELEMENT_MAX_SIDE a side. */
export function elementWork(c: ElementClip, W: number, H: number): { w: number; h: number } {
  const u = elementUnit(c.el.aspect, W, H);
  const s = elementRefScale(c, W, H);
  const k = Math.min(1, ELEMENT_MAX_SIDE / (u.w * s), ELEMENT_MAX_SIDE / (u.h * s));
  return { w: even(u.w * s * k), h: even(u.h * s * k) };
}

export type Edge = "l" | "r" | "t" | "b";

/**
 * One side of an element dragged by (dx, dy) canvas pixels: its new shape, size
 * and place. The opposite side stays where it was (turned boxes too);
 * `fromMiddle` (Alt) moves both sides.
 */
export function stretchElement(r: Rect & { rot: number }, edge: Edge, dx: number, dy: number, W: number, H: number, fromMiddle = false): { aspect: number; x: number; y: number; scale: number } {
  const a = (r.rot * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  // the pointer's move along the box's own sides
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  const across = edge === "l" || edge === "r";
  const sign = edge === "r" || edge === "b" ? 1 : -1;
  const d = (across ? lx : ly) * sign * (fromMiddle ? 2 : 1);
  const w = across ? Math.max(MIN_SIDE, r.w + d) : r.w;
  const h = across ? r.h : Math.max(MIN_SIDE, r.h + d);
  // the middle moves half as far, along that side (so the other side stays put)
  const shift = fromMiddle ? 0 : ((across ? w - r.w : h - r.h) / 2) * sign;
  const cx = r.x + r.w / 2 + (across ? shift * cos : -shift * sin);
  const cy = r.y + r.h / 2 + (across ? shift * sin : shift * cos);
  const aspect = clamp(w / h, 0.02, 200);
  const u = elementUnit(aspect, W, H);
  return { aspect: r4(aspect), x: r4(clamp(cx / W - 0.5, -2, 2)), y: r4(clamp(cy / H - 0.5, -2, 2)), scale: r4(clamp(w / u.w, 0.05, 5)) };
}

/** Where a new element goes. */
export type Place = "center" | "top-left" | "top-right" | "bottom" | "lower-left";

/**
 * A new element's shape and place: `size` is a share of the canvas height (h)
 * or width (w); both make a bar of that size (the progress bar, the ticker).
 */
export function placeElement(aspect: number, size: { w?: number; h?: number }, at: Place, W: number, H: number): { aspect: number; transform: Transform } {
  let bw: number;
  let bh: number;
  if (size.w != null && size.h != null) {
    bw = size.w * W;
    bh = Math.max(MIN_SIDE, size.h * H);
  } else if (size.w != null) {
    bw = size.w * W;
    bh = bw / aspect;
  } else {
    bh = (size.h ?? 0.25) * H;
    bw = bh * aspect;
  }
  // never bigger than the canvas
  const k = Math.min(1, W / bw, H / bh);
  bw *= k;
  bh *= k;
  const shape = clamp(bw / bh, 0.02, 200);
  const u = elementUnit(shape, W, H);
  const m = Math.round(0.04 * Math.min(W, H));
  const cx = at === "top-left" || at === "lower-left" ? m + bw / 2 : at === "top-right" ? W - m - bw / 2 : W / 2;
  const cy = at === "top-left" || at === "top-right" ? m + bh / 2 : at === "bottom" ? H - bh / 2 : at === "lower-left" ? H * 0.8 - bh / 2 : H / 2;
  return { aspect: r4(shape), transform: { fit: "fit", x: r4(cx / W - 0.5), y: r4(cy / H - 0.5), scale: r4(clamp(bw / u.w, 0.05, 5)) } };
}

/** The font of an element's words (bold unless it says otherwise). */
export const wordsFont = (el: Pick<ElementLook, "font" | "bold">, px: number) => `${el.bold === false ? 400 : 700} ${Math.max(1, Math.round(px))}px ${fontStack(el.font ?? "sans")}`;

/** A badge, in shares of its height (the drawing uses the same numbers): the words' size, the room at each end, the dot / icon and the gap after it. */
export const BADGE = { text: 0.5, pad: 0.42, dot: 0.3, icon: 0.46, gap: 0.2 };

/** How wide (÷ its height) a badge must be for its words. */
export function badgeAspect(el: ElementLook, measure: Measure): number {
  const H0 = 100;
  const tw = el.text ? measure(el.text, wordsFont(el, BADGE.text * H0)) : 0;
  const lead = el.icon ? BADGE.icon + BADGE.gap : el.dot ? BADGE.dot + BADGE.gap : 0;
  const w = (BADGE.pad * 2 + lead + Math.abs(el.skew ?? 0)) * H0 + tw;
  return r4(clamp(w / H0, 1, 200));
}

/**
 * A badge whose words changed: as wide as they need, as tall as before. The
 * side nearest the frame's edge stays put ("LIVE" in the top left grows to the right).
 */
export function refitBadge(c: ElementClip, measure: Measure, W: number, H: number): { aspect: number; transform: Transform } | null {
  if (c.el.kind !== "badge") return null;
  const aspect = badgeAspect(c.el, measure);
  if (Math.abs(aspect - c.el.aspect) < 1e-3) return null;
  const t = c.transform;
  const u0 = elementUnit(c.el.aspect, W, H);
  const h = u0.h * t.scale;
  const w0 = u0.w * t.scale;
  const w1 = h * aspect;
  const u1 = elementUnit(aspect, W, H);
  const cx0 = W / 2 + t.x * W;
  const cx1 = cx0 <= W / 2 ? cx0 - w0 / 2 + w1 / 2 : cx0 + w0 / 2 - w1 / 2;
  return { aspect, transform: { ...t, scale: r4(clamp(w1 / u1.w, 0.05, 5)), x: r4(clamp(cx1 / W - 0.5, -2, 2)) } };
}

/** A news ticker, in shares of its height: the words, the label's words, the room around them, the gap between repeats. */
export const TICKER = { text: 0.46, label: 0.42, labelPad: 0.4, gap: 1.6 };

export type TickerLayout = {
  /** where the moving words show: from x = winX, winW wide (the label is on the left of it) */
  winX: number;
  winW: number;
  /** the words' size */
  textPx: number;
  /** one repeat (the words and the gap after them) and how many are in the strip */
  period: number;
  copies: number;
  /** the strip of words (copies × period): it's shown twice, side by side, and slides */
  stripW: number;
};

/** Where a ticker's parts go in a w × h box (canvas pixels). */
export function tickerLayout(el: ElementLook, w: number, h: number, measure: Measure): TickerLayout {
  const labelW = el.label ? Math.min(w * 0.45, measure(el.label, wordsFont(el, TICKER.label * h)) + TICKER.labelPad * 2 * h) : 0;
  const winX = Math.round(labelW);
  const winW = Math.max(2, Math.round(w) - winX);
  let textPx = TICKER.text * h;
  let textW = el.text ? measure(el.text, wordsFont(el, textPx)) : 0;
  const gap = TICKER.gap * h;
  // very long words at a big size: smaller, so the strip stays inside what the export takes
  if (textW + gap > MAX_STRIP) {
    const k = (MAX_STRIP - gap) / textW;
    textPx *= k;
    textW *= k;
  }
  const period = Math.max(Math.round(h), Math.round(textW + gap));
  const copies = Math.max(1, Math.ceil(winW / period));
  return { winX, winW, textPx, period, copies, stripW: period * copies };
}

/** How far the ticker's strip has slid at time t (0 … stripW): it loops without a jump. */
export const tickerShift = (t: number, pxPerSec: number, stripW: number) => (((pxPerSec * t) % stripW) + stripW) % stripW;

/** How full a progress bar is `into` seconds into its clip (0 … 1). */
export const progressAt = (into: number, len: number) => clamp(into / Math.max(1e-6, len), 0, 1);
