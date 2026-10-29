import type { ElementLook } from "../edit/doc";
import { fontPx, type Measure } from "../text/layout";
import { BADGE, TICKER, progressAt, tickerLayout, tickerShift, wordsFont, type TickerLayout } from "./geometry";
import { canMakeCanvas, makeCanvas } from "../render/surface";

/**
 * Draws elements with the browser's canvas: the preview (every frame), the
 * Elements panel's pictures and the export (a PNG per element: FFmpeg here
 * can't draw). Everything goes in the box (0, 0, w, h); sizes are shares of it.
 */

type Ctx = CanvasRenderingContext2D;
type Box = { x: number; y: number; w: number; h: number };

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const WHITE = "#ffffff";

/** A hex color as CSS, with an alpha. */
export function rgba(hex: string, a = 1): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.round(Math.min(1, Math.max(0, a)) * 1000) / 1000})`;
}
/** The same color, darker (k: 0 … 1). */
function darken(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * (1 - k));
  return `rgb(${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}
export const measureOn =
  (ctx: Ctx): Measure =>
  (text, font) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  };

let scratch: Ctx | null = null;
/** Text widths in this browser (a badge's width, a ticker's layout), without a canvas of your own. */
export function browserMeasure(): Measure {
  scratch ??= canMakeCanvas() ? makeCanvas(1, 1).getContext("2d") : null;
  const ctx = scratch;
  return ctx ? measureOn(ctx) : (text, font) => text.length * fontPx(font) * 0.6;
}

const inset = (b: Box, d: number): Box => ({ x: b.x + d, y: b.y + d, w: Math.max(1, b.w - 2 * d), h: Math.max(1, b.h - 2 * d) });

/** A soft shadow for what's drawn next; the shape gets room for it inside the box. */
function shadowBox(ctx: Ctx, el: ElementLook, w: number, h: number): Box {
  if (!el.shadow) return { x: 0, y: 0, w, h };
  const m = Math.min(w, h);
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = m * 0.07;
  ctx.shadowOffsetY = m * 0.025;
  const p = m * 0.07;
  // (more room below: the shadow falls down)
  return { x: p, y: p * 0.7, w: Math.max(1, w - 2 * p), h: Math.max(1, h - 2 * p) };
}
function noShadow(ctx: Ctx) {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

/** Fill a shape (with the shadow), then its outline on top. */
function paint(ctx: Ctx, el: ElementLook, path: () => void, sw: number, rule: CanvasFillRule = "nonzero") {
  const outline = el.stroke !== "none" && sw > 0;
  if (el.fill !== "none") {
    ctx.fillStyle = rgba(el.fill, el.fillAlpha ?? 1);
    path();
    ctx.fill(rule);
    noShadow(ctx);
  }
  if (outline) {
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = sw;
    ctx.lineJoin = "round";
    path();
    ctx.stroke();
  }
  noShadow(ctx);
}

/** Split words into lines no wider than maxW. */
function wrap(ctx: Ctx, text: string, maxW: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxW) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

/** The element's words, as big as fit in the box (up to `maxLines` lines), centred. */
function drawWords(ctx: Ctx, el: ElementLook, b: Box, o: { size?: number; maxLines?: number } = {}) {
  const text = el.text?.trim();
  if (!text) return;
  const maxLines = o.maxLines ?? 1;
  let px = b.h * (o.size ?? 0.42);
  let lines: string[] = [text];
  for (let i = 0; i < 12; i++) {
    ctx.font = wordsFont(el, px);
    lines = maxLines > 1 ? wrap(ctx, text, b.w) : [text];
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (lines.length <= maxLines && widest <= b.w && lines.length * px * 1.12 <= b.h) break;
    px *= lines.length > maxLines ? 0.85 : Math.max(0.6, Math.min(0.95, b.w / Math.max(1, widest), b.h / (lines.length * px * 1.12)));
  }
  ctx.fillStyle = el.textColor ?? WHITE;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lh = px * 1.12;
  const y0 = b.y + b.h / 2 - ((lines.length - 1) * lh) / 2 + px * 0.04;
  lines.forEach((l, i) => ctx.fillText(l, b.x + b.w / 2, y0 + i * lh));
}

// ---------- shapes ----------

function rect(ctx: Ctx, el: ElementLook, w: number, h: number) {
  const sw = el.strokeWidth * Math.min(w, h);
  const b = inset(shadowBox(ctx, el, w, h), sw / 2);
  const r = Math.min(b.w, b.h) * (el.radius ?? 0);
  paint(ctx, el, () => {
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, r);
  }, sw);
  drawWords(ctx, el, inset(b, sw + Math.min(b.w, b.h) * 0.08), { maxLines: 3, size: 0.4 });
}

function ellipse(ctx: Ctx, el: ElementLook, w: number, h: number) {
  const sw = el.strokeWidth * Math.min(w, h);
  const b = inset(shadowBox(ctx, el, w, h), sw / 2);
  paint(ctx, el, () => {
    ctx.beginPath();
    ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
  }, sw);
  // (the square inside the circle)
  const k = 0.7;
  drawWords(ctx, el, { x: b.x + (b.w * (1 - k)) / 2, y: b.y + (b.h * (1 - k)) / 2, w: b.w * k, h: b.h * k }, { size: 0.62, maxLines: 2 });
}

/** Corners on a circle (starting at the top), stretched to fill the box. */
function cornersIn(b: Box, radii: number[]): [number, number][] {
  const n = radii.length;
  const pts = radii.map((r, i) => {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / n;
    return [Math.cos(a) * r, Math.sin(a) * r] as [number, number];
  });
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return pts.map(([x, y]) => [b.x + ((x - x0) / (x1 - x0 || 1)) * b.w, b.y + ((y - y0) / (y1 - y0 || 1)) * b.h]);
}
function polyPath(ctx: Ctx, pts: [number, number][]) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function polygon(ctx: Ctx, el: ElementLook, w: number, h: number) {
  const sw = el.strokeWidth * Math.min(w, h);
  const b = inset(shadowBox(ctx, el, w, h), sw / 2);
  const n = Math.max(3, el.points ?? 3);
  const pts = cornersIn(b, Array(n).fill(1));
  paint(ctx, el, () => polyPath(ctx, pts), sw);
  drawWords(ctx, el, { x: b.x + b.w * 0.25, y: b.y + b.h * (n === 3 ? 0.42 : 0.28), w: b.w * 0.5, h: b.h * (n === 3 ? 0.45 : 0.44) }, { size: 0.6 });
}

function star(ctx: Ctx, el: ElementLook, w: number, h: number) {
  const sw = el.strokeWidth * Math.min(w, h);
  const b = inset(shadowBox(ctx, el, w, h), sw / 2);
  const n = Math.max(3, el.points ?? 5);
  const inner = el.inner ?? 0.45;
  const radii = Array.from({ length: n * 2 }, (_, i) => (i % 2 ? inner : 1));
  const pts = cornersIn(b, radii);
  paint(ctx, el, () => polyPath(ctx, pts), sw);
  // (a burst's words sit inside its inner circle)
  const k = inner * 0.92;
  drawWords(ctx, el, { x: b.x + (b.w * (1 - k)) / 2, y: b.y + (b.h * (1 - k)) / 2 + b.h * 0.02, w: b.w * k, h: b.h * k }, { size: 0.5 });
}

// ---------- lines and arrows ----------

function line(ctx: Ctx, el: ElementLook, w: number, h: number) {
  const color = el.fill === "none" ? WHITE : el.fill;
  const b = shadowBox(ctx, el, w, h);
  const hand = el.variant === "hand";
  const fade = el.variant === "fade";
  const t = b.h * (hand ? 0.34 : fade ? 0.5 : 0.6);
  ctx.lineCap = "round";
  ctx.lineWidth = t;
  ctx.globalAlpha *= el.fillAlpha ?? 1;
  if (fade) {
    const g = ctx.createLinearGradient(b.x, 0, b.x + b.w, 0);
    g.addColorStop(0, rgba(color, 0));
    g.addColorStop(0.5, rgba(color, 1));
    g.addColorStop(1, rgba(color, 0));
    ctx.strokeStyle = g;
  } else ctx.strokeStyle = color;
  if (el.dash) ctx.setLineDash([t * 1.1, t * 2]);
  ctx.beginPath();
  const cy = b.y + b.h / 2;
  if (hand) {
    // a quick marker stroke: a little bend, a little tilt
    const bend = (el.curve ?? 0.35) * b.h * 0.45;
    ctx.moveTo(b.x + t / 2, cy + b.h * 0.12);
    ctx.quadraticCurveTo(b.x + b.w * 0.55, cy + bend, b.x + b.w - t / 2, cy - b.h * 0.12);
  } else {
    ctx.moveTo(b.x + t / 2, cy);
    ctx.lineTo(b.x + b.w - t / 2, cy);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  noShadow(ctx);
}

function arrow(ctx: Ctx, el: ElementLook, w: number, h: number) {
  const sw = el.strokeWidth * Math.min(w, h);
  const b = inset(shadowBox(ctx, el, w, h), sw / 2);
  const both = el.heads === "both";
  const none = el.heads === "none";
  const curve = el.curve ?? 0;
  if (Math.abs(curve) > 0.01) return curvedArrow(ctx, el, b, sw, curve, none);
  const L = none ? 0 : Math.min(b.h * 0.95, b.w * (both ? 0.3 : 0.45));
  const T = b.h * 0.36;
  const cy = b.y + b.h / 2;
  const x0 = b.x;
  const x1 = b.x + b.w;
  const pts: [number, number][] = none
    ? [[x0, cy - T / 2], [x1, cy - T / 2], [x1, cy + T / 2], [x0, cy + T / 2]]
    : both
      ? [[x0, cy], [x0 + L, b.y], [x0 + L, cy - T / 2], [x1 - L, cy - T / 2], [x1 - L, b.y], [x1, cy], [x1 - L, b.y + b.h], [x1 - L, cy + T / 2], [x0 + L, cy + T / 2], [x0 + L, b.y + b.h]]
      : [[x0, cy - T / 2], [x1 - L, cy - T / 2], [x1 - L, b.y], [x1, cy], [x1 - L, b.y + b.h], [x1 - L, cy + T / 2], [x0, cy + T / 2]];
  paint(ctx, el, () => polyPath(ctx, pts), sw);
}

/** A curved arrow: an arc bending up, its head at the right, pointing along the curve. */
function curvedArrow(ctx: Ctx, el: ElementLook, b: Box, sw: number, curve: number, noHead: boolean) {
  const T = b.h * 0.13;
  const L = noHead ? 0 : b.h * 0.34;
  const hw = b.h * 0.2;
  const up = curve > 0;
  const k = Math.abs(curve);
  const p0: [number, number] = [b.x + T, up ? b.y + b.h * 0.86 : b.y + b.h * 0.14];
  const p2: [number, number] = [b.x + b.w - L * 1.05, up ? b.y + b.h * (0.9 - 0.25 * k) : b.y + b.h * (0.1 + 0.25 * k)];
  const p1: [number, number] = [b.x + b.w * 0.45, up ? b.y + b.h * (0.9 - 1.25 * k) : b.y + b.h * (0.1 + 1.25 * k)];
  // the head: along the curve's end
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const d = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [dx / d, dy / d];
  const tip: [number, number] = [p2[0] + ux * L, p2[1] + uy * L];
  const head: [number, number][] = [tip, [p2[0] - uy * hw, p2[1] + ux * hw], [p2[0] + uy * hw, p2[1] - ux * hw]];
  const pass = (color: string, extra: number) => {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = T + extra;
    ctx.beginPath();
    ctx.moveTo(...p0);
    ctx.quadraticCurveTo(...p1, ...p2);
    ctx.stroke();
    if (!noHead) {
      polyPath(ctx, head);
      ctx.fill();
      if (extra > 0) {
        ctx.lineWidth = extra;
        ctx.stroke();
      }
    }
  };
  if (el.stroke !== "none" && sw > 0) {
    pass(el.stroke, sw * 2);
    noShadow(ctx);
  }
  pass(el.fill === "none" ? WHITE : rgba(el.fill, el.fillAlpha ?? 1), 0);
  noShadow(ctx);
}

/** A highlighter stroke: see-through, a little slanted. */
function marker(ctx: Ctx, el: ElementLook, w: number, h: number) {
  const b = shadowBox(ctx, el, w, h);
  const color = el.fill === "none" ? "#facc15" : el.fill;
  ctx.fillStyle = rgba(color, el.fillAlpha ?? 0.45);
  const s = b.h * 0.12;
  ctx.beginPath();
  ctx.moveTo(b.x + s * 2, b.y + s);
  ctx.lineTo(b.x + b.w, b.y);
  ctx.lineTo(b.x + b.w - s * 2, b.y + b.h - s);
  ctx.lineTo(b.x, b.y + b.h);
  ctx.closePath();
  ctx.fill();
  noShadow(ctx);
}

// ---------- stickers with words ----------

function bubble(ctx: Ctx, el: ElementLook, w: number, h: number) {
  const sw = el.strokeWidth * Math.min(w, h);
  const b = inset(shadowBox(ctx, el, w, h), sw / 2);
  if (el.variant === "thought") {
    const body: Box = { x: b.x, y: b.y, w: b.w, h: b.h * 0.8 };
    const cx = body.x + body.w / 2;
    const cy = body.y + body.h / 2;
    const rx = body.w / 2 / 1.12;
    const ry = body.h / 2 / 1.12;
    const n = 9;
    const path = () => {
      ctx.beginPath();
      // a cloud: bumps all round
      for (let i = 0; i <= n; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / n;
        const [x, y] = [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
        if (i === 0) ctx.moveTo(x, y);
        else {
          const m = a - Math.PI / n;
          ctx.quadraticCurveTo(cx + Math.cos(m) * rx * 1.32, cy + Math.sin(m) * ry * 1.32, x, y);
        }
      }
      ctx.closePath();
      const m = Math.min(b.w, b.h);
      ctx.moveTo(b.x + b.w * 0.22 + m * 0.07, b.y + b.h * 0.87);
      ctx.arc(b.x + b.w * 0.22, b.y + b.h * 0.87, m * 0.07, 0, Math.PI * 2);
      ctx.moveTo(b.x + b.w * 0.1 + m * 0.04, b.y + b.h * 0.96);
      ctx.arc(b.x + b.w * 0.1, b.y + b.h * 0.96, m * 0.04, 0, Math.PI * 2);
    };
    paint(ctx, el, path, sw);
    drawWords(ctx, el, { x: body.x + body.w * 0.16, y: body.y + body.h * 0.2, w: body.w * 0.68, h: body.h * 0.6 }, { size: 0.36, maxLines: 3 });
    return;
  }
  const x0 = b.x;
  const y0 = b.y;
  const x1 = b.x + b.w;
  const y1 = b.y + b.h * 0.78;
  const r = Math.min(b.w, y1 - y0) * 0.22;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(x0 + r, y0);
    ctx.lineTo(x1 - r, y0);
    ctx.arcTo(x1, y0, x1, y0 + r, r);
    ctx.lineTo(x1, y1 - r);
    ctx.arcTo(x1, y1, x1 - r, y1, r);
    // the tail, down on the left
    ctx.lineTo(x0 + b.w * 0.36, y1);
    ctx.lineTo(x0 + b.w * 0.13, b.y + b.h);
    ctx.lineTo(x0 + b.w * 0.2, y1);
    ctx.lineTo(x0 + r, y1);
    ctx.arcTo(x0, y1, x0, y1 - r, r);
    ctx.lineTo(x0, y0 + r);
    ctx.arcTo(x0, y0, x0 + r, y0, r);
    ctx.closePath();
  };
  paint(ctx, el, path, sw);
  drawWords(ctx, el, { x: x0 + b.w * 0.08, y: y0 + (y1 - y0) * 0.12, w: b.w * 0.84, h: (y1 - y0) * 0.76 }, { size: 0.4, maxLines: 3 });
}

function tag(ctx: Ctx, el: ElementLook, w: number, h: number) {
  const sw = el.strokeWidth * Math.min(w, h);
  const b = inset(shadowBox(ctx, el, w, h), sw / 2);
  const p = b.h * 0.42;
  const r = b.h * 0.14;
  const cy = b.y + b.h / 2;
  const x1 = b.x + b.w;
  const y1 = b.y + b.h;
  const hole = b.h * 0.1;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(b.x, cy);
    ctx.lineTo(b.x + p, b.y);
    ctx.lineTo(x1 - r, b.y);
    ctx.arcTo(x1, b.y, x1, b.y + r, r);
    ctx.lineTo(x1, y1 - r);
    ctx.arcTo(x1, y1, x1 - r, y1, r);
    ctx.lineTo(b.x + p, y1);
    ctx.closePath();
    // the hole for the string
    ctx.moveTo(b.x + p * 0.72 + hole, cy);
    ctx.arc(b.x + p * 0.72, cy, hole, 0, Math.PI * 2);
  };
  paint(ctx, el, path, sw, "evenodd");
  drawWords(ctx, el, { x: b.x + p * 1.15, y: b.y + b.h * 0.15, w: b.w - p * 1.15 - b.h * 0.2, h: b.h * 0.7 }, { size: 0.62 });
}

function ribbon(ctx: Ctx, el: ElementLook, w: number, h: number) {
  const b = shadowBox(ctx, el, w, h);
  const fill = el.fill === "none" ? "#2563eb" : el.fill;
  const bandH = b.h * 0.74;
  const tail = b.w * 0.14;
  // the ends, folded behind (darker), with a notch
  ctx.fillStyle = darken(fill, 0.32);
  for (const side of [0, 1]) {
    const xo = side ? b.x + b.w - tail * 1.4 : b.x;
    const notch = side ? xo + tail * 1.4 : xo;
    const inner = side ? xo : xo + tail * 1.4;
    ctx.beginPath();
    ctx.moveTo(inner, b.y + b.h * 0.26);
    ctx.lineTo(notch, b.y + b.h * 0.26);
    ctx.lineTo(side ? notch - tail * 0.45 : notch + tail * 0.45, b.y + b.h * 0.63);
    ctx.lineTo(notch, b.y + b.h);
    ctx.lineTo(inner, b.y + b.h);
    ctx.closePath();
    ctx.fill();
  }
  noShadow(ctx);
  ctx.fillStyle = rgba(fill, el.fillAlpha ?? 1);
  ctx.fillRect(b.x + tail, b.y, b.w - tail * 2, bandH);
  drawWords(ctx, el, { x: b.x + tail * 1.3, y: b.y + bandH * 0.12, w: b.w - tail * 2.6, h: bandH * 0.76 }, { size: 0.58 });
}

function badge(ctx: Ctx, el: ElementLook, w: number, h: number) {
  const sw = el.strokeWidth * Math.min(w, h);
  const b = inset(shadowBox(ctx, el, w, h), sw / 2);
  const skew = el.skew ?? 0;
  const slant = Math.abs(skew) * b.h;
  const body: Box = { x: b.x + slant / 2, y: b.y, w: Math.max(1, b.w - slant), h: b.h };
  const r = Math.min(body.w, body.h) * (el.radius ?? 0);
  paint(ctx, el, () => {
    ctx.save();
    // slanted around its middle ("BREAKING")
    ctx.transform(1, 0, skew, 1, -skew * (b.y + b.h / 2), 0);
    ctx.beginPath();
    ctx.roundRect(body.x, body.y, body.w, body.h, r);
    ctx.restore();
  }, sw);
  // the dot or icon, then the words: centred as a group
  const H = b.h;
  const lead = el.icon ? BADGE.icon * H : el.dot ? BADGE.dot * H : 0;
  const gap = lead ? BADGE.gap * H : 0;
  let px = BADGE.text * H;
  ctx.font = wordsFont(el, px);
  let tw = el.text ? ctx.measureText(el.text).width : 0;
  const room = body.w - BADGE.pad * H * 1.2 - lead - gap;
  if (tw > room && tw > 0) {
    px *= Math.max(0.3, room / tw);
    ctx.font = wordsFont(el, px);
    tw = ctx.measureText(el.text!).width;
  }
  const x0 = body.x + (body.w - (lead + gap + tw)) / 2;
  const cy = b.y + H / 2;
  const mark = el.labelColor ?? el.textColor ?? WHITE;
  if (el.icon) {
    ctx.save();
    ctx.translate(x0, cy - lead / 2);
    ctx.scale(lead / 100, lead / 100);
    ctx.fillStyle = mark;
    heartPath(ctx);
    ctx.fill();
    ctx.restore();
  } else if (el.dot) {
    ctx.fillStyle = mark;
    ctx.beginPath();
    ctx.arc(x0 + lead / 2, cy, lead / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (el.text) {
    ctx.fillStyle = el.textColor ?? WHITE;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(el.text, x0 + lead + gap, cy + px * 0.05);
  }
}

// ---------- drawn stickers (a 100 × 100 design each) ----------

function heartPath(ctx: Ctx) {
  ctx.beginPath();
  ctx.moveTo(50, 90);
  ctx.bezierCurveTo(22, 70, 4, 52, 4, 32);
  ctx.bezierCurveTo(4, 16, 16, 6, 30, 6);
  ctx.bezierCurveTo(40, 6, 47, 12, 50, 20);
  ctx.bezierCurveTo(53, 12, 60, 6, 70, 6);
  ctx.bezierCurveTo(84, 6, 96, 16, 96, 32);
  ctx.bezierCurveTo(96, 52, 78, 70, 50, 90);
  ctx.closePath();
}
const circle = (ctx: Ctx, x: number, y: number, r: number) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
};
const poly = (ctx: Ctx, pts: [number, number][]) => polyPath(ctx, pts);

/** Each sticker: its main shape (filled with the element's color), and its marks (the second color). */
const ICONS: Record<string, { shape: (ctx: Ctx) => void; marks?: (ctx: Ctx, mark: string) => void }> = {
  heart: {
    shape: heartPath,
    marks: (ctx) => {
      ctx.fillStyle = "rgba(255, 255, 255, 0.38)";
      ctx.beginPath();
      ctx.ellipse(28, 26, 10, 6, -0.6, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  check: {
    shape: (ctx) => circle(ctx, 50, 50, 46),
    marks: (ctx, m) => strokeMarks(ctx, m, 11, [[[28, 52], [44, 68], [73, 35]]]),
  },
  cross: {
    shape: (ctx) => circle(ctx, 50, 50, 46),
    marks: (ctx, m) => strokeMarks(ctx, m, 11, [[[32, 32], [68, 68]], [[68, 32], [32, 68]]]),
  },
  warning: {
    shape: (ctx) => {
      // (rounded corners: a thick stroke in the same color follows)
      poly(ctx, [[50, 10], [92, 84], [8, 84]]);
    },
    marks: (ctx, m) => {
      ctx.fillStyle = m;
      ctx.beginPath();
      ctx.roundRect(45, 34, 10, 30, 5);
      ctx.fill();
      circle(ctx, 50, 73, 5.5);
      ctx.fill();
    },
  },
  info: {
    shape: (ctx) => circle(ctx, 50, 50, 46),
    marks: (ctx, m) => {
      ctx.fillStyle = m;
      circle(ctx, 50, 29, 7);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(43.5, 42, 13, 36, 5);
      ctx.fill();
    },
  },
  question: {
    shape: (ctx) => circle(ctx, 50, 50, 46),
    marks: (ctx, m) => {
      ctx.fillStyle = m;
      ctx.font = '800 66px ui-rounded, "SF Pro Rounded", ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", 50, 54);
    },
  },
  bolt: { shape: (ctx) => poly(ctx, [[60, 4], [18, 56], [46, 56], [36, 96], [82, 40], [54, 40]]) },
  crown: {
    shape: (ctx) => {
      poly(ctx, [[10, 80], [6, 30], [30, 50], [50, 16], [70, 50], [94, 30], [90, 80]]);
    },
    marks: (ctx, m) => {
      ctx.fillStyle = m;
      for (const [x, y] of [[6, 30], [50, 16], [94, 30]] as const) {
        circle(ctx, x, y, 6);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
      ctx.fillRect(10, 70, 80, 10);
    },
  },
  music: {
    shape: (ctx) => {
      ctx.beginPath();
      ctx.ellipse(30, 78, 13, 10, -0.4, 0, Math.PI * 2);
      ctx.moveTo(87, 68);
      ctx.ellipse(74, 68, 13, 10, -0.4, 0, Math.PI * 2);
      ctx.rect(36, 24, 8, 54);
      ctx.rect(80, 14, 8, 54);
      ctx.moveTo(36, 24);
      ctx.lineTo(88, 12);
      ctx.lineTo(88, 28);
      ctx.lineTo(36, 40);
      ctx.closePath();
    },
  },
  pin: {
    shape: (ctx) => {
      ctx.beginPath();
      ctx.moveTo(50, 96);
      ctx.bezierCurveTo(34, 76, 14, 58, 14, 38);
      ctx.arc(50, 38, 36, Math.PI, 0);
      ctx.bezierCurveTo(86, 58, 66, 76, 50, 96);
      ctx.closePath();
    },
    marks: (ctx, m) => {
      ctx.fillStyle = m;
      circle(ctx, 50, 38, 13);
      ctx.fill();
    },
  },
  bell: {
    shape: (ctx) => {
      ctx.beginPath();
      ctx.moveTo(50, 12);
      ctx.bezierCurveTo(30, 12, 22, 30, 22, 48);
      ctx.lineTo(22, 64);
      ctx.lineTo(12, 78);
      ctx.lineTo(88, 78);
      ctx.lineTo(78, 64);
      ctx.lineTo(78, 48);
      ctx.bezierCurveTo(78, 30, 70, 12, 50, 12);
      ctx.closePath();
      ctx.moveTo(56, 10);
      ctx.arc(50, 10, 6, 0, Math.PI * 2);
    },
    marks: (ctx, m) => {
      ctx.fillStyle = m;
      circle(ctx, 50, 86, 9);
      ctx.fill();
    },
  },
  cursor: { shape: (ctx) => poly(ctx, [[22, 6], [22, 84], [41, 67], [54, 95], [68, 89], [55, 61], [80, 61]]) },
  click: {
    shape: (ctx) => {
      circle(ctx, 50, 50, 11);
    },
    marks: (ctx) => {
      // the ripples, in the same color
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 6;
      circle(ctx, 50, 50, 26);
      ctx.stroke();
      ctx.globalAlpha *= 0.55;
      ctx.lineWidth = 5;
      circle(ctx, 50, 50, 42);
      ctx.stroke();
    },
  },
  smile: {
    shape: (ctx) => circle(ctx, 50, 50, 46),
    marks: (ctx, m) => {
      ctx.fillStyle = m;
      circle(ctx, 35, 40, 6);
      ctx.fill();
      circle(ctx, 65, 40, 6);
      ctx.fill();
      ctx.strokeStyle = m;
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(50, 50, 25, 0.18 * Math.PI, 0.82 * Math.PI);
      ctx.stroke();
    },
  },
  sun: {
    shape: (ctx) => {
      circle(ctx, 50, 50, 23);
    },
    marks: (ctx) => {
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        ctx.moveTo(50 + Math.cos(a) * 33, 50 + Math.sin(a) * 33);
        ctx.lineTo(50 + Math.cos(a) * 45, 50 + Math.sin(a) * 45);
      }
      ctx.stroke();
    },
  },
  play: {
    shape: (ctx) => {
      ctx.beginPath();
      ctx.roundRect(4, 18, 92, 64, 20);
    },
    marks: (ctx, m) => {
      ctx.fillStyle = m;
      poly(ctx, [[41, 34], [41, 66], [68, 50]]);
      ctx.fill();
    },
  },
};
export const ICON_IDS = Object.keys(ICONS);

function strokeMarks(ctx: Ctx, color: string, width: number, lines: [number, number][][]) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const pts of lines) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
}

function icon(ctx: Ctx, el: ElementLook, w: number, h: number) {
  const ic = ICONS[el.icon ?? ""] ?? ICONS.heart;
  const b = shadowBox(ctx, el, w, h);
  const s = Math.min(b.w, b.h);
  const outline = el.stroke !== "none" && el.strokeWidth > 0 ? el.strokeWidth * 100 : 0;
  // (the design is 100 wide; an outline needs room round it)
  const k = s / (100 + outline * 2);
  ctx.save();
  ctx.translate(b.x + (b.w - s) / 2 + outline * k, b.y + (b.h - s) / 2 + outline * k);
  ctx.scale(k, k);
  const fill = el.fill === "none" ? WHITE : rgba(el.fill, el.fillAlpha ?? 1);
  // round the corners of the warning triangle
  const roundish = el.icon === "warning" ? 12 : 0;
  if (outline) {
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = outline * 2 + roundish;
    ctx.lineJoin = "round";
    ic.shape(ctx);
    ctx.stroke();
    noShadow(ctx);
  }
  ctx.fillStyle = fill;
  ic.shape(ctx);
  ctx.fill();
  if (roundish) {
    ctx.strokeStyle = fill;
    ctx.lineWidth = roundish;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  noShadow(ctx);
  ic.marks?.(ctx, el.textColor ?? WHITE);
  ctx.restore();
}

function emoji(ctx: Ctx, el: ElementLook, w: number, h: number) {
  const e = el.emoji;
  if (!e) return;
  const b = shadowBox(ctx, el, w, h);
  const s = Math.min(b.w, b.h);
  let px = s * 0.84;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `${px}px ${EMOJI_FONT}`;
  let m = ctx.measureText(e);
  // as big as fits: its drawn part, not the font's line
  const inkW = m.actualBoundingBoxLeft + m.actualBoundingBoxRight || px;
  const inkH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent || px;
  px *= Math.min(b.w / inkW, b.h / inkH) * 0.98;
  ctx.font = `${px}px ${EMOJI_FONT}`;
  m = ctx.measureText(e);
  const x = b.x + b.w / 2 + (m.actualBoundingBoxLeft - m.actualBoundingBoxRight) / 2;
  const y = b.y + b.h / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  ctx.fillText(e, x, y);
  noShadow(ctx);
}

// ---------- news graphics that move ----------

/** A progress bar `p` (0 … 1) full: the done part in its color, the rest in the track's. */
export function drawProgress(ctx: Ctx, el: ElementLook, w: number, h: number, p: number) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, Math.min(w, h) * (el.radius ?? 0));
  ctx.clip();
  ctx.fillStyle = rgba(el.track ?? WHITE, el.trackAlpha ?? 0.3);
  ctx.fillRect(p * w, 0, w - p * w, h);
  ctx.fillStyle = rgba(el.fill === "none" ? "#ef4444" : el.fill, el.fillAlpha ?? 1);
  ctx.fillRect(0, 0, p * w, h);
  ctx.restore();
}
/** For the export: the full bar and the empty bar side by side (2w × h); FFmpeg slides a window over them. */
export function drawProgressPair(ctx: Ctx, el: ElementLook, w: number, h: number) {
  ctx.fillStyle = rgba(el.fill === "none" ? "#ef4444" : el.fill, el.fillAlpha ?? 1);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = rgba(el.track ?? WHITE, el.trackAlpha ?? 0.3);
  ctx.fillRect(w, 0, w, h);
}
/** For the export: the bar's shape (rounded ends), white. */
export function drawProgressMask(ctx: Ctx, el: ElementLook, w: number, h: number) {
  ctx.fillStyle = WHITE;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, Math.min(w, h) * (el.radius ?? 0));
  ctx.fill();
}

/** A ticker's band and its label box (the words move over the band, under the label). */
export function drawTickerBand(ctx: Ctx, el: ElementLook, w: number, h: number, lay: TickerLayout) {
  ctx.fillStyle = rgba(el.fill === "none" ? "#0b1220" : el.fill, el.fillAlpha ?? 1);
  ctx.fillRect(0, 0, w, h);
  if (el.label && lay.winX > 0) {
    ctx.fillStyle = el.labelColor ?? "#dc2626";
    ctx.fillRect(0, 0, lay.winX, h);
    ctx.fillStyle = el.textColor ?? WHITE;
    ctx.font = wordsFont(el, TICKER.label * h);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(el.label, lay.winX / 2, h / 2 + h * 0.02);
  }
}
/** A ticker's strip of words (its copies, a dot between them), from x = 0. */
export function drawTickerStrip(ctx: Ctx, el: ElementLook, h: number, lay: TickerLayout) {
  if (!el.text) return;
  ctx.font = wordsFont(el, lay.textPx);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const textW = ctx.measureText(el.text).width;
  for (let i = 0; i < lay.copies; i++) {
    const x = i * lay.period;
    ctx.fillStyle = el.textColor ?? WHITE;
    ctx.fillText(el.text, x, h / 2 + h * 0.02);
    ctx.fillStyle = rgba(el.textColor ?? WHITE, 0.7);
    ctx.beginPath();
    ctx.arc(x + textW + (lay.period - textW) / 2, h / 2, h * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
}
/** A ticker at time t: the words slide left and loop, the same as the export. */
export function drawTicker(ctx: Ctx, el: ElementLook, w: number, h: number, t: number) {
  const lay = tickerLayout(el, w, h, measureOn(ctx));
  drawTickerBand(ctx, el, w, h, lay);
  ctx.save();
  ctx.beginPath();
  ctx.rect(lay.winX, 0, lay.winW, h);
  ctx.clip();
  const shift = tickerShift(t, (el.speed ?? 2.2) * h, lay.stripW);
  ctx.translate(lay.winX - shift, 0);
  drawTickerStrip(ctx, el, h, lay);
  ctx.translate(lay.stripW, 0);
  drawTickerStrip(ctx, el, h, lay);
  ctx.restore();
}

// ---------- broadcast & motion elements ----------

function drawPulse(ctx: Ctx, el: ElementLook, w: number, h: number, t: number) {
  const color = el.fill === "none" ? "#ef4444" : el.fill;
  const alpha = el.fillAlpha ?? 1;
  const hasText = Boolean(el.text && el.text.trim());

  if (el.subFill && el.subFill !== "none") {
    const r = Math.min(w, h) * (el.radius ?? 0.5);
    ctx.fillStyle = rgba(el.subFill, el.fillAlpha ?? 0.9);
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, r);
    ctx.fill();
    if (el.stroke !== "none" && el.strokeWidth > 0) {
      ctx.strokeStyle = el.stroke;
      ctx.lineWidth = el.strokeWidth * Math.min(w, h);
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, r);
      ctx.stroke();
    }
  }

  const cy = h / 2;
  const cx = hasText ? h * 0.44 : w / 2;
  const maxR = (hasText ? h : Math.min(w, h)) * 0.42;
  const coreR = maxR * 0.42;
  const phase = (t * 1.5) % 1;

  for (let i = 0; i < 2; i++) {
    const p = (phase + i * 0.5) % 1;
    const r = coreR + (maxR - coreR) * p;
    const a = (1 - p) * 0.65 * alpha;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = rgba(color, a);
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
  ctx.fillStyle = rgba(color, alpha);
  ctx.fill();

  if (hasText) {
    const textX = h * 0.88;
    const availW = Math.max(10, w - textX - h * 0.15);
    let px = h * 0.5;
    ctx.font = wordsFont(el, px);
    let tw = ctx.measureText(el.text!).width;
    if (tw > availW && tw > 0) {
      px *= Math.max(0.3, availW / tw);
      ctx.font = wordsFont(el, px);
    }
    ctx.fillStyle = el.textColor ?? WHITE;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(el.text!, textX, cy + px * 0.04);
  }
}

function drawAudioWave(ctx: Ctx, el: ElementLook, w: number, h: number, t: number) {
  const color = el.fill === "none" ? "#06b6d4" : el.fill;
  const alpha = el.fillAlpha ?? 1;
  const hasText = Boolean(el.text && el.text.trim());

  let labelH = 0;
  if (hasText) {
    labelH = h * 0.26;
    ctx.font = wordsFont(el, labelH * 0.8);
    ctx.fillStyle = el.textColor ?? "#94a3b8";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(el.text!, w / 2, labelH * 0.45);
  }

  const waveY = labelH;
  const waveH = h - labelH;
  const barCount = 20;
  const gap = (w / barCount) * 0.25;
  const barW = Math.max(2, (w - gap * (barCount - 1)) / barCount);

  ctx.fillStyle = rgba(color, alpha);
  for (let i = 0; i < barCount; i++) {
    const f1 = Math.sin(t * 6 + i * 0.65);
    const f2 = Math.cos(t * 3.8 - i * 0.45);
    const f3 = Math.sin(t * 9.2 + i * 1.2);
    const raw = Math.abs(f1 * 0.5 + f2 * 0.35 + f3 * 0.25);
    const norm = 0.15 + 0.82 * Math.min(1, Math.max(0, raw));
    const barH = Math.max(3, waveH * norm);
    const x = i * (barW + gap);
    const y = waveY + (waveH - barH) / 2;
    const r = Math.min(barW / 2, barH / 2);
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, r);
    ctx.fill();
  }
}

function drawLowerThird(ctx: Ctx, el: ElementLook, w: number, h: number) {
  const topH = h * 0.32;
  const bottomH = h * 0.68;
  const label = el.label ?? "BREAKING NEWS";
  const headline = el.text ?? "HEADLINE GOES HERE";
  const sub = el.subText;

  const skew = el.skew ?? -0.15;
  const slant = Math.abs(skew) * topH;
  ctx.font = wordsFont(el, topH * 0.58);
  const labelTextW = ctx.measureText(label).width;
  const tabW = Math.min(w * 0.7, Math.max(w * 0.3, labelTextW + topH * 1.4));

  ctx.save();
  ctx.transform(1, 0, skew, 1, -skew * (topH / 2), 0);
  ctx.fillStyle = rgba(el.fill === "none" ? "#dc2626" : el.fill, el.fillAlpha ?? 1);
  ctx.fillRect(slant / 2, 0, tabW, topH);
  ctx.restore();

  ctx.fillStyle = el.labelColor ?? WHITE;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, topH * 0.4, topH / 2);

  const subBg = el.subFill && el.subFill !== "none" ? el.subFill : "#0b1220";
  ctx.fillStyle = rgba(subBg, 0.94);
  ctx.fillRect(0, topH, w, bottomH);

  const accentW = Math.max(4, w * 0.012);
  ctx.fillStyle = rgba(el.fill === "none" ? "#dc2626" : el.fill, 1);
  ctx.fillRect(0, topH, accentW, bottomH);

  if (el.stroke !== "none" && el.strokeWidth > 0) {
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = el.strokeWidth * Math.min(w, h);
    ctx.strokeRect(0, topH, w, bottomH);
  }

  const textX = accentW + topH * 0.4;
  const textAvailW = w - textX - topH * 0.4;

  if (sub && sub.trim()) {
    let headPx = bottomH * 0.38;
    ctx.font = wordsFont(el, headPx);
    let headW = ctx.measureText(headline).width;
    if (headW > textAvailW && headW > 0) {
      headPx *= Math.max(0.4, textAvailW / headW);
      ctx.font = wordsFont(el, headPx);
    }
    ctx.fillStyle = el.textColor ?? WHITE;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(headline, textX, topH + bottomH * 0.34);

    let subPx = bottomH * 0.28;
    ctx.font = wordsFont({ ...el, bold: false }, subPx);
    let subW = ctx.measureText(sub).width;
    if (subW > textAvailW && subW > 0) {
      subPx *= Math.max(0.4, textAvailW / subW);
      ctx.font = wordsFont({ ...el, bold: false }, subPx);
    }
    ctx.fillStyle = el.subTextColor ?? "#94a3b8";
    ctx.fillText(sub, textX, topH + bottomH * 0.72);
  } else {
    let headPx = bottomH * 0.52;
    ctx.font = wordsFont(el, headPx);
    let headW = ctx.measureText(headline).width;
    if (headW > textAvailW && headW > 0) {
      headPx *= Math.max(0.4, textAvailW / headW);
      ctx.font = wordsFont(el, headPx);
    }
    ctx.fillStyle = el.textColor ?? WHITE;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(headline, textX, topH + bottomH / 2);
  }
}

function drawLocationBug(ctx: Ctx, el: ElementLook, w: number, h: number) {
  const bg = el.fill === "none" ? "#0b1220" : el.fill;
  const r = Math.min(w, h) * (el.radius ?? 0.25);

  ctx.fillStyle = rgba(bg, el.fillAlpha ?? 0.92);
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, r);
  ctx.fill();

  if (el.stroke !== "none" && el.strokeWidth > 0) {
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = el.strokeWidth * Math.min(w, h);
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, r);
    ctx.stroke();
  }

  const cy = h / 2;
  const hasDot = el.dot !== false;
  const dotR = h * 0.14;
  let curX = h * 0.35;

  if (hasDot) {
    ctx.beginPath();
    ctx.arc(curX + dotR, cy, dotR, 0, Math.PI * 2);
    ctx.fillStyle = "#ef4444";
    ctx.fill();
    curX += dotR * 2 + h * 0.25;
  }

  const locText = (el.text ?? "LOCATION").toUpperCase();
  const subText = el.subText?.toUpperCase();

  const px = h * 0.44;
  ctx.font = wordsFont(el, px);
  ctx.fillStyle = el.textColor ?? WHITE;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(locText, curX, cy + px * 0.04);
  curX += ctx.measureText(locText).width;

  if (subText) {
    ctx.fillStyle = "#64748b";
    ctx.fillText(" · ", curX, cy + px * 0.04);
    curX += ctx.measureText(" · ").width;

    ctx.fillStyle = el.subTextColor ?? "#ef4444";
    ctx.fillText(subText, curX, cy + px * 0.04);
  }
}

// ---------- camera & viewfinder elements ----------

function drawViewfinder(ctx: Ctx, el: ElementLook, w: number, h: number, t: number) {
  const strokeColor = el.stroke === "none" ? WHITE : el.stroke;
  const accentColor = el.fill === "none" ? "#ef4444" : el.fill;
  const lw = Math.max(1.5, Math.min(w, h) * (el.strokeWidth || 0.005));

  // 1. Outer 4 corner brackets
  const insetX = w * 0.04;
  const insetY = h * 0.05;
  const armX = Math.min(w * 0.16, h * 0.28);
  const armY = armX * (h / w);

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lw;
  ctx.lineCap = "square";
  ctx.lineJoin = "miter";

  // Top-left bracket
  ctx.beginPath();
  ctx.moveTo(insetX, insetY + armY);
  ctx.lineTo(insetX, insetY);
  ctx.lineTo(insetX + armX, insetY);
  ctx.stroke();

  // Top-right bracket
  ctx.beginPath();
  ctx.moveTo(w - insetX - armX, insetY);
  ctx.lineTo(w - insetX, insetY);
  ctx.lineTo(w - insetX, insetY + armY);
  ctx.stroke();

  // Bottom-left bracket
  ctx.beginPath();
  ctx.moveTo(insetX, h - insetY - armY);
  ctx.lineTo(insetX, h - insetY);
  ctx.lineTo(insetX + armX, h - insetY);
  ctx.stroke();

  // Bottom-right bracket
  ctx.beginPath();
  ctx.moveTo(w - insetX - armX, h - insetY);
  ctx.lineTo(w - insetX, h - insetY);
  ctx.lineTo(w - insetX, h - insetY - armY);
  ctx.stroke();

  // 2. Top-left: Blinking red REC dot + "REC"
  const recX = insetX + w * 0.035;
  const recY = insetY + h * 0.08;
  const dotR = Math.min(w, h) * 0.02;
  const isBlinkOn = (t * 2) % 2 < 1.3;

  if (isBlinkOn) {
    ctx.beginPath();
    ctx.arc(recX, recY, dotR * 1.3, 0, Math.PI * 2);
    ctx.fillStyle = rgba(accentColor, 0.35);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(recX, recY, dotR, 0, Math.PI * 2);
    ctx.fillStyle = accentColor;
    ctx.fill();
  }

  const recFontSize = Math.min(w, h) * 0.046;
  ctx.font = wordsFont(el, recFontSize);
  ctx.fillStyle = el.textColor ?? WHITE;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(el.text ?? "REC", recX + dotR * 2.2, recY);

  // 3. Top-right: Battery indicator
  const batRight = w - insetX - w * 0.035;
  const batW = Math.min(w, h) * 0.095;
  const batH = batW * 0.46;
  const nubW = batW * 0.08;
  const nubH = batH * 0.44;
  const batX = batRight - batW - nubW;
  const batY = recY - batH / 2;

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = Math.max(1.5, lw * 0.9);
  ctx.strokeRect(batX, batY, batW, batH);

  ctx.fillStyle = strokeColor;
  ctx.fillRect(batX + batW, batY + (batH - nubH) / 2, nubW, nubH);

  const level = Math.max(0.05, Math.min(1, (el.batteryLevel ?? 85) / 100));
  const levelColor = level > 0.4 ? "#22c55e" : level > 0.2 ? "#f59e0b" : "#ef4444";
  const batPad = Math.max(1.5, batH * 0.12);
  const fillW = Math.max(2, (batW - batPad * 2) * level);
  ctx.fillStyle = levelColor;
  ctx.fillRect(batX + batPad, batY + batPad, fillW, batH - batPad * 2);

  // 4. Center: Autofocus Target & Crosshair
  const cx = w / 2;
  const cy = h / 2;
  const boxS = Math.min(w, h) * 0.22;
  const barL = boxS * 0.28;
  const halfS = boxS / 2;

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lw;

  ctx.beginPath();
  ctx.moveTo(cx - halfS, cy - halfS + barL);
  ctx.lineTo(cx - halfS, cy - halfS);
  ctx.lineTo(cx - halfS + barL, cy - halfS);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx + halfS - barL, cy - halfS);
  ctx.lineTo(cx + halfS, cy - halfS);
  ctx.lineTo(cx + halfS, cy - halfS + barL);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - halfS, cy + halfS - barL);
  ctx.lineTo(cx - halfS, cy + halfS);
  ctx.lineTo(cx - halfS + barL, cy + halfS);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx + halfS - barL, cy + halfS);
  ctx.lineTo(cx + halfS, cy + halfS);
  ctx.lineTo(cx + halfS, cy + halfS - barL);
  ctx.stroke();

  const chSize = boxS * 0.2;
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = Math.max(1.5, lw * 1.1);
  ctx.beginPath();
  ctx.moveTo(cx - chSize, cy);
  ctx.lineTo(cx + chSize, cy);
  ctx.moveTo(cx, cy - chSize);
  ctx.lineTo(cx, cy + chSize);
  ctx.stroke();

  // 5. Bottom-left: Real-time Live Running Timecode
  const tcX = insetX + w * 0.035;
  const tcY = h - insetY - h * 0.08;
  const baseOffset = el.timecodeOffset ?? 38.4;
  const totalSec = Math.floor(baseOffset + t);
  const hrs = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const secs = String(totalSec % 60).padStart(2, "0");
  const timecodeStr = `${hrs}:${mins}:${secs}`;

  const tcFontSize = Math.min(w, h) * 0.044;
  ctx.font = wordsFont(el, tcFontSize);
  ctx.fillStyle = el.textColor ?? WHITE;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(timecodeStr, tcX, tcY);

  // 6. Bottom-center: Lens aperture meter & tick scale
  const apY = tcY - h * 0.04;
  const apText = el.aperture ?? "f 1.8";
  const apFontSize = Math.min(w, h) * 0.038;
  ctx.font = wordsFont(el, apFontSize);
  ctx.fillStyle = el.textColor ?? WHITE;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(apText, cx, apY);

  const gaugeW = Math.min(w * 0.32, h * 0.45);
  const gaugeY = tcY + h * 0.02;
  const tickCount = 11;
  const tickStep = gaugeW / (tickCount - 1);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = Math.max(1, lw * 0.8);
  for (let i = 0; i < tickCount; i++) {
    const tx = cx - gaugeW / 2 + i * tickStep;
    const isMid = i === Math.floor(tickCount / 2);
    const th = isMid ? Math.min(w, h) * 0.032 : Math.min(w, h) * 0.016;
    ctx.beginPath();
    ctx.moveTo(tx, gaugeY - th / 2);
    ctx.lineTo(tx, gaugeY + th / 2);
    ctx.stroke();
  }

  const triS = Math.min(w, h) * 0.016;
  ctx.fillStyle = strokeColor;
  ctx.beginPath();
  ctx.moveTo(cx, gaugeY + Math.min(w, h) * 0.018);
  ctx.lineTo(cx - triS, gaugeY + Math.min(w, h) * 0.018 + triS * 1.5);
  ctx.lineTo(cx + triS, gaugeY + Math.min(w, h) * 0.018 + triS * 1.5);
  ctx.closePath();
  ctx.fill();

  // 7. Bottom-right: Resolution tag ("4K HD")
  const resRight = w - insetX - w * 0.035;
  const resY = tcY;
  const resFontSize = Math.min(w, h) * 0.042;
  ctx.font = wordsFont(el, resFontSize);
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  const rawTag = el.resolutionTag ?? "4K HD";
  if (rawTag.includes("HD")) {
    const prefix = rawTag.replace("HD", "").trim();
    const hdW = ctx.measureText("HD").width + resFontSize * 0.6;
    const hdH = resFontSize * 1.35;
    const hdX = resRight - hdW;

    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.roundRect(hdX, resY - hdH / 2, hdW, hdH, 3);
    ctx.fill();

    ctx.fillStyle = WHITE;
    ctx.textAlign = "center";
    ctx.fillText("HD", hdX + hdW / 2, resY + resFontSize * 0.04);

    if (prefix) {
      ctx.textAlign = "right";
      ctx.fillText(prefix, hdX - resFontSize * 0.4, resY + resFontSize * 0.04);
    }
  } else {
    ctx.fillStyle = WHITE;
    ctx.fillText(rawTag, resRight, resY + resFontSize * 0.04);
  }
}

function drawFocusTarget(ctx: Ctx, el: ElementLook, w: number, h: number, t: number) {
  const strokeColor = el.stroke === "none" ? WHITE : el.stroke;
  const accentColor = el.fill === "none" ? "#ef4444" : el.fill;
  const lw = Math.max(1.5, Math.min(w, h) * (el.strokeWidth || 0.025));

  const cx = w / 2;
  const cy = h / 2;
  const pulse = 1 + 0.03 * Math.sin(t * Math.PI * 2);
  const size = Math.min(w, h) * 0.88 * pulse;
  const arm = size * 0.28;
  const half = size / 2;

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lw;
  ctx.lineCap = "square";

  ctx.beginPath();
  ctx.moveTo(cx - half, cy - half + arm);
  ctx.lineTo(cx - half, cy - half);
  ctx.lineTo(cx - half + arm, cy - half);

  ctx.moveTo(cx + half - arm, cy - half);
  ctx.lineTo(cx + half, cy - half);
  ctx.lineTo(cx + half, cy - half + arm);

  ctx.moveTo(cx - half, cy + half - arm);
  ctx.lineTo(cx - half, cy + half);
  ctx.lineTo(cx - half + arm, cy + half);

  ctx.moveTo(cx + half - arm, cy + half);
  ctx.lineTo(cx + half, cy + half);
  ctx.lineTo(cx + half, cy + half - arm);
  ctx.stroke();

  const ch = size * 0.22;
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = Math.max(1.5, lw * 1.1);
  ctx.beginPath();
  ctx.moveTo(cx - ch, cy);
  ctx.lineTo(cx + ch, cy);
  ctx.moveTo(cx, cy - ch);
  ctx.lineTo(cx, cy + ch);
  ctx.stroke();
}

function drawBattery(ctx: Ctx, el: ElementLook, w: number, h: number) {
  const strokeColor = el.stroke === "none" ? WHITE : el.stroke;
  const lw = Math.max(1.5, Math.min(w, h) * (el.strokeWidth || 0.06));

  const nubW = w * 0.08;
  const nubH = h * 0.44;
  const bodyW = w - nubW - lw * 2;
  const bodyH = h - lw * 2;
  const x = lw;
  const y = lw;

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lw;
  const r = Math.min(bodyW, bodyH) * 0.12;
  ctx.beginPath();
  ctx.roundRect(x, y, bodyW, bodyH, r);
  ctx.stroke();

  ctx.fillStyle = strokeColor;
  ctx.fillRect(x + bodyW, y + (bodyH - nubH) / 2, nubW, nubH);

  const level = Math.max(0.05, Math.min(1, (el.batteryLevel ?? 85) / 100));
  const levelColor = level > 0.4 ? "#22c55e" : level > 0.2 ? "#f59e0b" : "#ef4444";
  const pad = Math.max(2, bodyH * 0.14);
  const fillW = Math.max(2, (bodyW - pad * 2) * level);
  ctx.fillStyle = levelColor;
  ctx.beginPath();
  ctx.roundRect(x + pad, y + pad, fillW, bodyH - pad * 2, r * 0.6);
  ctx.fill();
}

// ----------

export type DrawOpts = { into?: number; len?: number };

/** Draw an element into the box (0, 0, w, h). The preview, the Elements panel and the export all use this. */
export function drawElement(ctx: Ctx, el: ElementLook, w: number, h: number, o: DrawOpts = {}) {
  if (!(w >= 1 && h >= 1)) return;
  ctx.save();
  try {
    switch (el.kind) {
      case "rect":
        return rect(ctx, el, w, h);
      case "ellipse":
        return ellipse(ctx, el, w, h);
      case "polygon":
        return polygon(ctx, el, w, h);
      case "star":
        return star(ctx, el, w, h);
      case "line":
        return line(ctx, el, w, h);
      case "arrow":
        return arrow(ctx, el, w, h);
      case "marker":
        return marker(ctx, el, w, h);
      case "bubble":
        return bubble(ctx, el, w, h);
      case "tag":
        return tag(ctx, el, w, h);
      case "ribbon":
        return ribbon(ctx, el, w, h);
      case "badge":
        return badge(ctx, el, w, h);
      case "icon":
        return icon(ctx, el, w, h);
      case "emoji":
        return emoji(ctx, el, w, h);
      case "progress":
        return drawProgress(ctx, el, w, h, progressAt(o.into ?? 0, o.len ?? 1));
      case "ticker":
        return drawTicker(ctx, el, w, h, o.into ?? 0);
      case "pulse":
        return drawPulse(ctx, el, w, h, o.into ?? 0);
      case "audioWave":
        return drawAudioWave(ctx, el, w, h, o.into ?? 0);
      case "lowerThird":
        return drawLowerThird(ctx, el, w, h);
      case "locationBug":
        return drawLocationBug(ctx, el, w, h);
      case "viewfinder":
        return drawViewfinder(ctx, el, w, h, o.into ?? 0);
      case "focusTarget":
        return drawFocusTarget(ctx, el, w, h, o.into ?? 0);
      case "battery":
        return drawBattery(ctx, el, w, h);
    }
  } finally {
    ctx.restore();
  }
}

/** Kinds that change while they play (the preview draws them every frame). */
export const movesByItself = (el: Pick<ElementLook, "kind">) =>
  el.kind === "progress" || el.kind === "ticker" || el.kind === "pulse" || el.kind === "audioWave" || el.kind === "viewfinder" || el.kind === "focusTarget" || el.kind === "locationBug";
