import type { TextClip } from "../edit/doc";
import { layoutText, textAnchor, type Measure, type TextLayout } from "./layout";
import { typeSteps, TYPE_STEPS_MAX } from "../player/anim";
import { applyH, boxQuad, hasCorners, homography, quadBounds, quadOk, rectQuad, type Quad } from "../player/quad";
import { drawWarpMesh, GlWarp } from "../player/glWarp";

/**
 * Draws text clips with the browser's canvas. The program preview draws them
 * every frame; the export gets the very same drawing as a PNG (FFmpeg here
 * has no text support), so the video file matches the preview.
 * All coordinates are canvas pixels of the project (W × H).
 */

type TextLike = Pick<TextClip, "text" | "style" | "transform"> & { wordTimes?: number[] };

let scratch: CanvasRenderingContext2D | null = null;
/** A 2D context only for measuring text. */
function measurer(): CanvasRenderingContext2D | null {
  if (scratch) return scratch;
  if (typeof document === "undefined") return null;
  scratch = document.createElement("canvas").getContext("2d");
  return scratch;
}

const measureOn =
  (ctx: CanvasRenderingContext2D): Measure =>
  (text, font) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  };

/** Where the text clip's lines and boxes go (null outside the browser). */
export function textLayout(clip: TextLike, W: number, H: number): TextLayout | null {
  const ctx = measurer();
  return ctx ? layoutText(clip, W, H, measureOn(ctx)) : null;
}

/** The point a text stretches from (its anchor where it is on the canvas). */
export function textStretchAnchor(clip: TextLike, W: number, H: number): { x: number; y: number } {
  const a = textAnchor(clip.style.preset, W, H);
  return { x: a.x + (clip.transform?.x ?? 0) * W, y: a.y + (clip.transform?.y ?? 0) * H };
}

/**
 * Draw a text clip onto ctx (already in project pixels: scale the context for a
 * smaller preview). Effects: outline, a gradient, letter spacing, shadow styles.
 */
export function drawText(ctx: CanvasRenderingContext2D, clip: TextLike, W: number, H: number, upTo = Infinity, progress = 0) {
  const lay = layoutText(clip, W, H, measureOn(ctx));
  // perspective (corners moved): drawn flat, then bent onto its four corners (lib/player/glWarp)
  if (hasCorners(clip.transform?.corners) && drawWarped(ctx, clip, lay, W, H, upTo, progress)) return;
  paint(ctx, clip, lay, upTo, progress, W, H, false);
}

/**
 * The text's box (project pixels, before turning): its lines with a little room, stretched from its anchor.
 * The preview's selection box is this box, and perspective corners are shares of it.
 */
export function textBox(clip: TextLike, lay: TextLayout, W: number, H: number): { x: number; y: number; w: number; h: number } {
  const pad = (lay.lines[0]?.size ?? 20) * 0.15;
  const r = { x: lay.bounds.x - pad, y: lay.bounds.y - pad, w: lay.bounds.w + pad * 2, h: lay.bounds.h + pad * 2 };
  const sx = clip.transform?.scaleX ?? 1;
  const sy = clip.transform?.scaleY ?? 1;
  if (Math.abs(sx - 1) <= 1e-9 && Math.abs(sy - 1) <= 1e-9) return r;
  const q = textStretchAnchor(clip, W, H);
  return { x: q.x + sx * (r.x - q.x), y: q.y + sy * (r.y - q.y), w: r.w * sx, h: r.h * sy };
}

/** Where a text with its corners moved lands, and the flat area (with room for the shadow / outline) that maps onto it; null if it can't be bent. */
function warpOf(clip: TextLike, lay: TextLayout, W: number, H: number): { src: { x: number; y: number; w: number; h: number }; dst: Quad } | null {
  const tr = clip.transform;
  const b = textBox(clip, lay, W, H);
  const quad = boxQuad({ cx: b.x + b.w / 2, cy: b.y + b.h / 2, w: b.w, h: b.h }, { rotation: tr?.rotation, skewX: tr?.skewX, skewY: tr?.skewY, corners: tr?.corners });
  if (!quadOk(quad)) return null;
  const M = homography(rectQuad(b.x, b.y, b.w, b.h), quad);
  const w0 = applyH(M, { x: b.x + b.w / 2, y: b.y + b.h / 2 }).w;
  const m = (lay.lines[0]?.size ?? 40) * 0.6;
  // (the room around is dropped if the shape leans so far it would pass the horizon)
  for (const k of [m, m / 3, 0]) {
    const src = { x: b.x - k, y: b.y - k, w: b.w + 2 * k, h: b.h + 2 * k };
    const pts = rectQuad(src.x, src.y, src.w, src.h).map((p) => applyH(M, p));
    if (pts.every((p) => p.w * w0 > 0)) return { src, dst: pts.map((p) => ({ x: p.x, y: p.y })) as Quad };
  }
  return null;
}

let warper: GlWarp | null | undefined;
function drawWarped(ctx: CanvasRenderingContext2D, clip: TextLike, lay: TextLayout, W: number, H: number, upTo: number, progress: number): boolean {
  if (typeof document === "undefined") return false;
  const plan = warpOf(clip, lay, W, H);
  if (!plan) return false;
  const { src, dst } = plan;
  // drawn flat at about the size it shows (the preview is smaller than the project; never past 4K)
  const m = ctx.getTransform();
  const f = Math.min(2, Math.max(0.25, Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1), 4096 / Math.max(1, src.w), 4096 / Math.max(1, src.h));
  const off = document.createElement("canvas");
  off.width = Math.max(1, Math.ceil(src.w * f));
  off.height = Math.max(1, Math.ceil(src.h * f));
  const o = off.getContext("2d");
  if (!o) return false;
  o.setTransform(f, 0, 0, f, -src.x * f, -src.y * f);
  paint(o, clip, lay, upTo, progress, W, H, true);
  const sw = src.w * f;
  const sh = src.h * f;
  if (warper === undefined) warper = GlWarp.create();
  const at = warper?.render(off, off.width, off.height, 0, 0, sw, sh, dst.map((p) => ({ x: p.x * f, y: p.y * f })) as Quad);
  if (warper && at) ctx.drawImage(warper.canvas, at.x / f, at.y / f, warper.canvas.width / f, warper.canvas.height / f);
  else drawWarpMesh(ctx, off, 0, 0, sw, sh, dst);
  return true;
}

/** Where a text with its corners moved can reach (for the typewriter's area), or null. */
export function warpedTextBounds(clip: TextLike, lay: TextLayout, W: number, H: number): { x: number; y: number; w: number; h: number } | null {
  if (!hasCorners(clip.transform?.corners)) return null;
  const plan = warpOf(clip, lay, W, H);
  return plan ? quadBounds(plan.dst) : null;
}

/** The drawing itself (`flat`: no turn or slant; perspective bends the flat text afterwards). */
function paint(ctx: CanvasRenderingContext2D, clip: TextLike, lay: TextLayout, upTo: number, progress: number, W: number, H: number, flat: boolean) {
  // typewriter: only the first `upTo` letters (line after line)
  let left = upTo;
  const st = clip.style;
  ctx.save();
  const tr = clip.transform;
  const rot = flat ? 0 : (tr?.rotation ?? 0);
  const skewX = flat ? 0 : (tr?.skewX ?? 0);
  const skewY = flat ? 0 : (tr?.skewY ?? 0);
  const flipX = !!tr?.flipX;
  const flipY = !!tr?.flipY;
  // free width / height: the letters stretch from the text's anchor (the point it grows from)
  const sx = tr?.scaleX ?? 1;
  const sy = tr?.scaleY ?? 1;
  const stretched = Math.abs(sx - 1) > 1e-9 || Math.abs(sy - 1) > 1e-9;
  if (rot || skewX || skewY || flipX || flipY || stretched) {
    const q = stretched ? textStretchAnchor(clip, W, H) : { x: 0, y: 0 };
    // (turned around the middle of the stretched text)
    const cx = q.x + sx * (lay.bounds.x + lay.bounds.w / 2 - q.x);
    const cy = q.y + sy * (lay.bounds.y + lay.bounds.h / 2 - q.y);
    ctx.translate(cx, cy);
    if (rot) ctx.rotate((rot * Math.PI) / 180);
    if (skewX || skewY) ctx.transform(1, Math.tan((skewY * Math.PI) / 180), Math.tan((skewX * Math.PI) / 180), 1, 0, 0);
    if (flipX || flipY) ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.translate(-cx, -cy);
    if (stretched) {
      ctx.translate(q.x, q.y);
      ctx.scale(sx, sy);
      ctx.translate(-q.x, -q.y);
    }
  }
  for (const b of lay.boxes) {
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, b.radius);
    ctx.fill();
  }
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.lineJoin = "round";
  const size0 = lay.lines[0]?.size ?? 40;
  if (lay.shadow) {
    // shadow sizes are in screen pixels (not scaled by the context): scale them with it
    const k = Math.hypot(ctx.getTransform().a, ctx.getTransform().b) || 1;
    const look = st.shadowStyle ?? "soft";
    ctx.shadowColor = look === "glow" ? st.accent : look === "strong" ? "rgba(0,0,0,0.9)" : "rgba(0,0,0,0.65)";
    ctx.shadowBlur = size0 * (look === "glow" ? 0.45 : look === "strong" ? 0.28 : 0.16) * k;
    ctx.shadowOffsetY = look === "glow" ? 0 : size0 * (look === "strong" ? 0.08 : 0.05) * k;
  }
  const sp = st.spacing ?? 0;
  // word-by-word captions: one word is "spoken" at a time, counted across all the lines
  const highlight = !!st.highlightStyle && st.highlightStyle !== "none";
  const totalWords = highlight ? lay.lines.reduce((n, ln) => n + wordsOf(ln.text).length, 0) : 0;
  const activeWord = Math.min(totalWords - 1, Math.max(0, Math.floor(progress * totalWords)));
  let wordsBefore = 0;
  for (const line of lay.lines) {
    if (left <= 0) break;
    const letters = [...line.text];
    const l = letters.length > left ? { ...line, text: letters.slice(0, left).join("") } : line;
    left -= letters.length;
    ctx.font = l.font;
    let fill: string | CanvasGradient = l.color;
    // a gradient on the main text color (the lower third's small line keeps its own)
    if (st.gradient && l.color === st.color) {
      const gr = ctx.createLinearGradient(0, l.y - l.size * 0.8, 0, l.y + l.size * 0.2);
      gr.addColorStop(0, st.color);
      gr.addColorStop(1, st.gradient);
      fill = gr;
    }
    ctx.fillStyle = fill;
    const outline = st.outline && l.color === st.color ? st.outline : null;
    if (outline) {
      ctx.strokeStyle = outline.color;
      // (half the line is outside the letters)
      ctx.lineWidth = outline.width * l.size * 2;
    }
    const put = (text: string, x: number) => {
      if (outline) ctx.strokeText(text, x, l.y);
      ctx.fillText(text, x, l.y);
    };

    // Word-by-word styled captions highlight for Reels & Shorts
    const words = wordsOf(l.text);
    if (highlight && totalWords > 1 && words.length > 0) {
      const activeIdx = activeWord - wordsBefore;
      wordsBefore += wordsOf(line.text).length;
      let curX = l.x;
      const hCol = st.highlightColor ?? st.accent ?? "#facc15";
      for (let wi = 0; wi < words.length; wi++) {
        const wStr = words[wi] + (wi < words.length - 1 ? " " : "");
        const wWidth = ctx.measureText(wStr).width;
        const isActive = wi === activeIdx;
        ctx.save();
        if (isActive) {
          ctx.fillStyle = hCol;
          if (st.highlightStyle === "bounce") {
            ctx.translate(0, -l.size * 0.12);
          } else if (st.highlightStyle === "pop") {
            // the word being said grows a little around its own middle
            const cx = curX + wWidth / 2;
            const cy = l.y - l.size * 0.35;
            ctx.translate(cx, cy);
            ctx.scale(1.18, 1.18);
            ctx.translate(-cx, -cy);
          } else if (st.highlightStyle === "glow") {
            ctx.shadowColor = hCol;
            ctx.shadowBlur = l.size * 0.4;
          } else if (st.highlightStyle === "box") {
            ctx.fillStyle = hCol;
            ctx.fillRect(curX - 2, l.y - l.size * 0.9, wWidth + 4, l.size * 1.15);
            ctx.fillStyle = "#000000";
          }
        } else if (wi > activeIdx) {
          ctx.globalAlpha = 0.65;
        }
        put(wStr, curX);
        ctx.restore();
        curX += wWidth;
      }
      continue;
    }

    if (!sp) put(l.text, l.x);
    else {
      // letter by letter, with room between them
      let x = l.x;
      for (const ch of [...l.text]) {
        put(ch, x);
        x += ctx.measureText(ch).width + sp * l.size;
      }
    }
  }
  ctx.restore();
}

/** The words of a caption line (runs of spaces don't make empty words). */
function wordsOf(text: string): string[] {
  return text.split(" ").filter((w) => w.length > 0);
}

/** Whether a text clip highlights one spoken word at a time (karaoke, bounce, glow, box). */
export function isWordHighlight(clip: TextLike): boolean {
  return !!clip.style.highlightStyle && clip.style.highlightStyle !== "none";
}

/** How many words a word-by-word caption steps through (0 when it doesn't highlight words). */
export function captionWordCount(clip: TextLike, W: number, H: number): number {
  if (!isWordHighlight(clip)) return 0;
  const lay = textLayout(clip, W, H);
  return lay ? lay.lines.reduce((n, ln) => n + wordsOf(ln.text).length, 0) : 0;
}

/** progress (0…1) that lands on word i of n: drawText highlights floor(progress × n). */
export const wordProgress = (i: number, n: number) => (n > 0 ? (Math.min(n - 1, Math.max(0, i)) + 0.5) / n : 0);

/** A caption's word timings, if they still match its words (an edited text falls back to even spacing). */
export function usableWordTimes(clip: { text: string; wordTimes?: number[] }): number[] | null {
  const t = clip.wordTimes;
  return t && t.length > 0 && t.length === wordsOf(clip.text.replace(/\n/g, " ")).length ? t : null;
}

/**
 * How far a word-by-word caption is, `into` seconds after it starts (for drawText's `progress`):
 * on the word being said by its timings, or evenly through the clip without them.
 */
export function captionProgress(clip: { text: string; wordTimes?: number[] }, into: number, len: number): number {
  const times = usableWordTimes(clip);
  if (times) {
    let said = 0;
    while (said < times.length && times[said] <= into + 1e-6) said++;
    return wordProgress(said - 1, times.length);
  }
  return len > 0 ? Math.min(1, Math.max(0, into / len)) : 0;
}

/** How many letters a text clip draws (for the typewriter). */
export function letterCount(clip: TextLike, W: number, H: number): number {
  const lay = textLayout(clip, W, H);
  return lay ? lay.lines.reduce((n, l) => n + [...l.text].length, 0) : [...clip.text.replace(/\s+/g, "")].length;
}

/**
 * A typewriter text for the export: every step (0 letters … all), one under
 * another, in one PNG of the text's area; `box` is where that area sits on the
 * canvas. The export shows the step for each moment (lib/render/compose).
 */
/** A typewriter text's steps and area (what the export needs to show them), without drawing. */
export function textSpriteOf(clip: TextLike, W: number, H: number): { frames: number; chars: number; box: { x: number; y: number; w: number; h: number } } {
  const lay = textLayout(clip, W, H);
  const n = letterCount(clip, W, H);
  // the text's area, with room for the shadow / outline, inside the canvas
  const m = (lay?.lines[0]?.size ?? 40) * 0.6;
  let b0 = lay?.bounds ?? { x: 0, y: 0, w: W, h: H };
  // (in perspective it reaches where its corners went)
  const wb = lay ? warpedTextBounds(clip, lay, W, H) : null;
  if (wb) {
    const x0 = Math.min(b0.x, wb.x);
    const y0 = Math.min(b0.y, wb.y);
    b0 = { x: x0, y: y0, w: Math.max(b0.x + b0.w, wb.x + wb.w) - x0, h: Math.max(b0.y + b0.h, wb.y + wb.h) - y0 };
  }
  const x = Math.min(W - 2, Math.max(0, Math.floor(b0.x - m)));
  const y = Math.min(H - 2, Math.max(0, Math.floor(b0.y - m)));
  const w = Math.max(2, Math.min(W - x, Math.ceil(b0.w + 2 * m)));
  const h = Math.max(2, Math.min(H - y, Math.ceil(b0.h + 2 * m)));
  return { frames: typeSteps(n), chars: n, box: { x, y, w, h } };
}

export async function renderTextSprite(clip: TextLike, W: number, H: number): Promise<Blob> {
  await document.fonts?.ready;
  const meta = textSpriteOf(clip, W, H);
  const n = meta.chars;
  const steps = meta.frames;
  const { x, y, w, h } = meta.box;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h * (steps + 1);
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw text.");
  for (let r = 0; r <= steps; r++) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, r * h, w, h);
    ctx.clip();
    ctx.translate(-x, r * h - y);
    drawText(ctx, clip, W, H, Math.round((r / steps) * n));
    ctx.restore();
  }
  return new Promise<Blob>((resolve, reject) => cv.toBlob((bl) => (bl ? resolve(bl) : reject(new Error("Couldn't draw the text."))), "image/png"));
}

/**
 * A word-by-word caption for the export: one row per word (row i highlights word i), in the
 * same box as the typewriter sprite. The export picks the row for each moment
 * (lib/render/compose.ts), so the highlight moves exactly like the preview.
 */
export function wordSpriteOf(clip: TextLike, W: number, H: number): { frames: number; chars: number; box: { x: number; y: number; w: number; h: number }; kind: "words"; times?: number[] } | null {
  const n = captionWordCount(clip, W, H);
  if (n < 2 || n > TYPE_STEPS_MAX) return null;
  const times = usableWordTimes(clip);
  return { frames: n, chars: 0, box: textSpriteOf(clip, W, H).box, kind: "words", ...(times && times.length === n ? { times } : {}) };
}

export async function renderWordSprite(clip: TextLike, W: number, H: number): Promise<Blob> {
  await document.fonts?.ready;
  const meta = wordSpriteOf(clip, W, H);
  if (!meta) return renderTextPng(clip, W, H);
  const { x, y, w, h } = meta.box;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h * meta.frames;
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw text.");
  for (let r = 0; r < meta.frames; r++) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, r * h, w, h);
    ctx.clip();
    ctx.translate(-x, r * h - y);
    drawText(ctx, clip, W, H, Infinity, wordProgress(r, meta.frames));
    ctx.restore();
  }
  return new Promise<Blob>((resolve, reject) => cv.toBlob((bl) => (bl ? resolve(bl) : reject(new Error("Couldn't draw the text."))), "image/png"));
}

/** The text clip as a transparent PNG the size of the project canvas (for the export). */
export async function renderTextPng(clip: TextLike, W: number, H: number): Promise<Blob> {
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw text.");
  await document.fonts?.ready;
  drawText(ctx, clip, W, H);
  return new Promise((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't draw the text."))), "image/png"));
}
