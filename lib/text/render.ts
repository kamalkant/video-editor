import type { TextClip, TextMark } from "../edit/doc";
import { layoutText, textAnchor, type Measure, type TextLayout, type TextLine, type TextPiece } from "./layout";
import { lettersOf } from "./marks";
import { typeSteps, TYPE_STEPS_MAX } from "../player/anim";
import { applyH, boxQuad, hasCorners, homography, quadBounds, quadOk, rectQuad, type Quad } from "../player/quad";
import { drawWarpMesh, GlWarp } from "../player/glWarp";
import { canMakeCanvas, fontSet, makeCanvas } from "../render/surface";

/**
 * Draws text clips with the browser's canvas. The program preview and the browser export draw them every
 * frame (lib/render/frame); the server export gets the very same drawing as a PNG (FFmpeg here has no text
 * support), so the video file matches the preview. All coordinates are canvas pixels of the project (W × H).
 */

type TextLike = Pick<TextClip, "text" | "style" | "transform"> & { wordTimes?: number[]; marks?: TextMark[] };

let scratch: CanvasRenderingContext2D | null = null;
/** A 2D context only for measuring text. */
function measurer(): CanvasRenderingContext2D | null {
  if (scratch) return scratch;
  if (!canMakeCanvas()) return null;
  scratch = makeCanvas(1, 1).getContext("2d");
  return scratch;
}

const measureOn =
  (ctx: CanvasRenderingContext2D): Measure =>
  (text, font) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  };

// layouts are kept (measuring every word every frame was most of a text's cost); a font that arrives makes them new
const layouts = new Map<string, TextLayout>();
let watching = false;
/** Forget the kept layouts (a font arrived: the letters have new widths). */
export function invalidateTextLayouts() {
  layouts.clear();
}
function layoutOf(clip: TextLike, W: number, H: number, measure: Measure): TextLayout {
  const fonts = watching ? null : fontSet();
  if (fonts) {
    watching = true;
    fonts.addEventListener("loadingdone", invalidateTextLayouts);
  }
  const t = clip.transform;
  const key = JSON.stringify([clip.text, clip.style, clip.marks ?? null, t.scale, t.x, t.y, W, H]);
  let lay = layouts.get(key);
  if (!lay) {
    lay = layoutText(clip, W, H, measure);
    if (layouts.size > 300) layouts.delete(layouts.keys().next().value!);
    layouts.set(key, lay);
  }
  return lay;
}

/** Where the text clip's lines and boxes go (null outside the browser). */
export function textLayout(clip: TextLike, W: number, H: number): TextLayout | null {
  const ctx = measurer();
  return ctx ? layoutOf(clip, W, H, measureOn(ctx)) : null;
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
  const lay = layoutOf(clip, W, H, measureOn(ctx));
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
let flatCanvas: HTMLCanvasElement | null = null;
function drawWarped(ctx: CanvasRenderingContext2D, clip: TextLike, lay: TextLayout, W: number, H: number, upTo: number, progress: number): boolean {
  if (!canMakeCanvas()) return false;
  const plan = warpOf(clip, lay, W, H);
  if (!plan) return false;
  const { src, dst } = plan;
  // drawn flat at about the size it shows (the preview is smaller than the project; never past 4K)
  const m = ctx.getTransform();
  const f = Math.min(2, Math.max(0.25, Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1), 4096 / Math.max(1, src.w), 4096 / Math.max(1, src.h));
  // (one work canvas, reused frame after frame)
  flatCanvas ??= makeCanvas();
  const off = flatCanvas;
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

/** A piece's text split for drawing: words with the spaces after them (karaoke highlights one word at a time). */
const tokensOf = (text: string) => text.match(/\S+\s*|\s+/g) ?? [];

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
  const karaoke = highlight && totalWords > 1;
  const hCol = st.highlightColor ?? st.accent ?? "#facc15";
  let word = -1;

  /** Draw text at x on the line's baseline: outline then fill, letter by letter with letter spacing (whole letters: Hindi stays joined). */
  const put = (text: string, x: number, y: number, size: number, outline: boolean) => {
    if (!sp) {
      if (outline) ctx.strokeText(text, x, y);
      ctx.fillText(text, x, y);
      return;
    }
    let at = x;
    for (const ch of lettersOf(text)) {
      if (outline) ctx.strokeText(ch, at, y);
      ctx.fillText(ch, at, y);
      at += ctx.measureText(ch).width + sp * size;
    }
  };
  const widthOf = (text: string, size: number) => ctx.measureText(text).width + (sp ? sp * size * lettersOf(text).length : 0);

  // (inside a word: a word can go on in the next piece, when its letters are styled differently)
  let inWord = false;
  const drawPiece = (pc: TextPiece, ln: TextLine, text: string) => {
    ctx.font = pc.font;
    let fill: string | CanvasGradient = pc.color;
    // a gradient on the text's own color (marked letters and the lower third's small line keep theirs)
    if (st.gradient && pc.main && !pc.marked) {
      const gr = ctx.createLinearGradient(0, ln.y - pc.size * 0.8, 0, ln.y + pc.size * 0.2);
      gr.addColorStop(0, st.color);
      gr.addColorStop(1, st.gradient);
      fill = gr;
    }
    const outline = st.outline && pc.main ? st.outline : null;
    if (outline) {
      ctx.strokeStyle = outline.color;
      // (half the line is outside the letters)
      ctx.lineWidth = outline.width * pc.size * 2;
    }
    const shownW = widthOf(text, pc.size) - (sp ? sp * pc.size : 0);
    // a marker-pen color behind the letters (no shadow under it)
    if (pc.highlight) {
      ctx.save();
      ctx.shadowColor = "transparent";
      ctx.fillStyle = pc.highlight;
      ctx.beginPath();
      ctx.roundRect(pc.x - pc.size * 0.08, ln.y - pc.size * 0.9, shownW + pc.size * 0.16, pc.size * 1.16, pc.size * 0.12);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = fill;
    if (!karaoke) put(text, pc.x, ln.y, pc.size, !!outline);
    else {
      // word-by-word captions: the word being said in the highlight color, the ones still to come lighter
      let x = pc.x;
      for (const tok of tokensOf(text)) {
        if (/^\s/.test(tok)) {
          put(tok, x, ln.y, pc.size, !!outline);
          x += widthOf(tok, pc.size);
          inWord = false;
          continue;
        }
        if (!inWord) word++;
        inWord = !/\s$/.test(tok);
        const w = widthOf(tok, pc.size);
        ctx.save();
        if (word === activeWord) {
          ctx.fillStyle = hCol;
          if (st.highlightStyle === "bounce") ctx.translate(0, -pc.size * 0.12);
          else if (st.highlightStyle === "pop") {
            // the word being said grows a little around its own middle
            const cx = x + w / 2;
            const cy = ln.y - pc.size * 0.35;
            ctx.translate(cx, cy);
            ctx.scale(1.18, 1.18);
            ctx.translate(-cx, -cy);
          } else if (st.highlightStyle === "glow") {
            ctx.shadowColor = hCol;
            ctx.shadowBlur = pc.size * 0.4;
          } else if (st.highlightStyle === "box") {
            ctx.fillRect(x - 2, ln.y - pc.size * 0.9, w + 4, pc.size * 1.15);
            ctx.fillStyle = "#000000";
          }
        } else if (word > activeWord) ctx.globalAlpha *= 0.65;
        put(tok, x, ln.y, pc.size, !!outline);
        ctx.restore();
        x += w;
      }
    }
    // a line under or through the letters, in their color
    if (pc.underline || pc.strike) {
      ctx.save();
      ctx.fillStyle = typeof fill === "string" ? fill : st.color;
      const th = Math.max(1, pc.size * 0.06);
      if (pc.underline) ctx.fillRect(pc.x, ln.y + pc.size * 0.1, shownW, th);
      if (pc.strike) ctx.fillRect(pc.x, ln.y - pc.size * 0.3, shownW, th);
      ctx.restore();
    }
  };

  for (const line of lay.lines) {
    if (left <= 0) break;
    inWord = false;
    for (const pc of line.pieces) {
      if (left <= 0) break;
      const ls = lettersOf(pc.text);
      const text = ls.length > left ? ls.slice(0, Math.max(0, left)).join("") : pc.text;
      left -= ls.length;
      if (text) drawPiece(pc, line, text);
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

/** How many letters a text clip draws (for the typewriter; whole letters, so a Hindi letter types at once). */
export function letterCount(clip: TextLike, W: number, H: number): number {
  const lay = textLayout(clip, W, H);
  return lay ? lay.lines.reduce((n, l) => n + lettersOf(l.text).length, 0) : lettersOf(clip.text.replace(/\s+/g, "")).length;
}

/**
 * The letter of the text at a point (project pixels, before the text's turn), as a position in its words:
 * for picking a word on the preview. null when the point is on no line.
 */
export function hitTestText(clip: TextLike, x: number, y: number, W: number, H: number): number | null {
  const lay = textLayout(clip, W, H);
  const ctx = measurer();
  if (!lay || !ctx) return null;
  let best: TextLine | null = null;
  let bestD = Infinity;
  for (const l of lay.lines) {
    if (!l.pieces.some((p) => p.from >= 0)) continue;
    const top = l.y - l.size;
    const bottom = l.y + l.size * 0.3;
    const d = y < top ? top - y : y > bottom ? y - bottom : 0;
    if (d < bestD) [best, bestD] = [l, d];
  }
  if (!best || bestD > best.size) return null;
  const pieces = best.pieces.filter((p) => p.from >= 0);
  const pc = pieces.find((p) => x < p.x + p.w) ?? pieces[pieces.length - 1];
  if (!pc) return null;
  // the letter boundary nearest to x inside the piece
  ctx.font = pc.font;
  let at = pc.x;
  let off = 0;
  const sp = clip.style.spacing ?? 0;
  for (const ch of lettersOf(pc.text)) {
    const w = ctx.measureText(ch).width + sp * pc.size;
    if (x < at + w / 2) break;
    at += w;
    off += ch.length;
  }
  // (Breaking-news capitals can differ in length from the words: share of the piece)
  const len = pc.to - pc.from;
  return pc.from + (pc.text.length === len ? off : Math.round((off / Math.max(1, pc.text.length)) * len));
}

/** The biggest side of a picture the export accepts (lib/renders MAX_SIDE). */
export const SPRITE_MAX_SIDE = 8192;

/**
 * The cells of a sprite (one picture of n cells of w × h each) laid out in a grid that fits SPRITE_MAX_SIDE:
 * how many columns, and how many cells fit (fewer than n when even the grid is too big).
 */
export function spriteGrid(n: number, w: number, h: number): { cols: number; fits: number } {
  const cols = Math.max(1, Math.min(n, Math.floor(SPRITE_MAX_SIDE / Math.max(1, w))));
  const rows = Math.max(1, Math.floor(SPRITE_MAX_SIDE / Math.max(1, h)));
  return { cols, fits: Math.min(n, cols * rows) };
}

/**
 * A typewriter text for the server export: every step (0 letters … all), in cells of one PNG of the text's
 * area (a grid: `cols` cells a row); `box` is where that area sits on the canvas. The export shows the step for
 * each moment (lib/render/compose).
 */
export function textSpriteOf(clip: TextLike, W: number, H: number): { frames: number; chars: number; box: { x: number; y: number; w: number; h: number }; cols: number } {
  const lay = textLayout(clip, W, H);
  const n = letterCount(clip, W, H);
  // the text's area, with room for the shadow / outline, inside the canvas
  const m = (lay?.lines[0]?.size ?? 40) * 0.6;
  let b0 = lay?.bounds ?? { x: 0, y: 0, w: W, h: H };
  // (turned or slanted: where its corners reach)
  if (lay && (clip.transform.rotation || clip.transform.skewX || clip.transform.skewY || (clip.transform.scaleX ?? 1) !== 1 || (clip.transform.scaleY ?? 1) !== 1)) {
    const b = textBox(clip, lay, W, H);
    const q = quadBounds(boxQuad({ cx: b.x + b.w / 2, cy: b.y + b.h / 2, w: b.w, h: b.h }, { rotation: clip.transform.rotation, skewX: clip.transform.skewX, skewY: clip.transform.skewY }));
    const x0 = Math.min(b0.x, q.x);
    const y0 = Math.min(b0.y, q.y);
    b0 = { x: x0, y: y0, w: Math.max(b0.x + b0.w, q.x + q.w) - x0, h: Math.max(b0.y + b0.h, q.y + q.h) - y0 };
  }
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
  // as many steps as letters (60 at most), fewer when a big text's cells wouldn't fit in one picture
  const grid = spriteGrid(typeSteps(n) + 1, w, h);
  return { frames: Math.max(1, grid.fits - 1), chars: n, box: { x, y, w, h }, cols: grid.cols };
}

/** Draw cell r of a sprite: the text as `draw` paints it, in its own w × h cell of the grid. */
async function spritePng(meta: { box: { x: number; y: number; w: number; h: number }; cols: number }, cells: number, draw: (ctx: CanvasRenderingContext2D, r: number) => void): Promise<Blob> {
  const { x, y, w, h } = meta.box;
  const cols = Math.max(1, meta.cols);
  const cv = document.createElement("canvas");
  cv.width = w * Math.min(cols, cells);
  cv.height = h * Math.ceil(cells / cols);
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw text.");
  for (let r = 0; r < cells; r++) {
    const cx = (r % cols) * w;
    const cy = Math.floor(r / cols) * h;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx, cy, w, h);
    ctx.clip();
    ctx.translate(cx - x, cy - y);
    draw(ctx, r);
    ctx.restore();
  }
  return new Promise<Blob>((resolve, reject) => cv.toBlob((bl) => (bl ? resolve(bl) : reject(new Error("Couldn't draw the text."))), "image/png"));
}

export async function renderTextSprite(clip: TextLike, W: number, H: number): Promise<Blob> {
  await document.fonts?.ready;
  const meta = textSpriteOf(clip, W, H);
  const steps = meta.frames;
  return spritePng(meta, steps + 1, (ctx, r) => drawText(ctx, clip, W, H, Math.round((r / steps) * meta.chars)));
}

/**
 * A word-by-word caption for the server export: one cell per word (cell i highlights word i), in the same box
 * as the typewriter sprite. The export picks the cell for each moment (lib/render/compose.ts), so the
 * highlight moves exactly like the preview.
 */
export function wordSpriteOf(clip: TextLike, W: number, H: number): { frames: number; chars: number; box: { x: number; y: number; w: number; h: number }; cols: number; kind: "words"; times?: number[] } | null {
  const n = captionWordCount(clip, W, H);
  if (n < 2 || n > TYPE_STEPS_MAX) return null;
  const tm = textSpriteOf(clip, W, H);
  const grid = spriteGrid(n, tm.box.w, tm.box.h);
  if (grid.fits < n) return null;
  const times = usableWordTimes(clip);
  return { frames: n, chars: 0, box: tm.box, cols: grid.cols, kind: "words", ...(times && times.length === n ? { times } : {}) };
}

export async function renderWordSprite(clip: TextLike, W: number, H: number): Promise<Blob> {
  await document.fonts?.ready;
  const meta = wordSpriteOf(clip, W, H);
  if (!meta) return renderTextPng(clip, W, H);
  return spritePng(meta, meta.frames, (ctx, r) => drawText(ctx, clip, W, H, Infinity, wordProgress(r, meta.frames)));
}

/** The text clip as a transparent PNG the size of the project canvas (for the server export). */
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
