import type { ElementClip } from "../edit/doc";
import { drawElement, drawProgressMask, drawProgressPair, drawTickerBand, drawTickerStrip, measureOn } from "./draw";
import { elementWork, tickerLayout } from "./geometry";

/**
 * The pictures the export needs for one element (FFmpeg here can't draw):
 * drawn by the same code as the preview, at the size the export shows it.
 */
export type ElementParts = {
  /** the element (a progress bar: full and empty side by side, 2w wide; a ticker: its band and label) */
  png: Blob;
  w: number;
  h: number;
  /** a progress bar with rounded ends: its shape */
  mask?: Blob;
  /** a ticker: its words (w wide), where they show (from x, win wide) and how fast they slide (px a second) */
  strip?: { png: Blob; w: number; x: number; win: number; speed: number };
};

function canvasOf(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
const blobOf = (c: HTMLCanvasElement) => new Promise<Blob | null>((res) => c.toBlob(res, "image/png"));

export async function renderElementParts(c: ElementClip, W: number, H: number): Promise<ElementParts | null> {
  // (Brand Kit fonts, like text)
  await document.fonts?.ready;
  const { w, h } = elementWork(c, W, H);
  const el = c.el;
  if (el.kind === "progress") {
    const cv = canvasOf(w * 2, h);
    drawProgressPair(cv.getContext("2d")!, el, w, h);
    const png = await blobOf(cv);
    if (!png) return null;
    if (!(el.radius ?? 0)) return { png, w, h };
    const m = canvasOf(w, h);
    drawProgressMask(m.getContext("2d")!, el, w, h);
    const mask = await blobOf(m);
    return mask ? { png, w, h, mask } : null;
  }
  if (el.kind === "ticker") {
    const band = canvasOf(w, h);
    const bx = band.getContext("2d")!;
    const lay = tickerLayout(el, w, h, measureOn(bx));
    drawTickerBand(bx, el, w, h, lay);
    const strip = canvasOf(lay.stripW, h);
    drawTickerStrip(strip.getContext("2d")!, el, h, lay);
    const [png, words] = await Promise.all([blobOf(band), blobOf(strip)]);
    if (!png || !words) return null;
    return { png, w, h, strip: { png: words, w: lay.stripW, x: lay.winX, win: lay.winW, speed: Math.round((el.speed ?? 2.2) * h * 1000) / 1000 } };
  }
  const cv = canvasOf(w, h);
  drawElement(cv.getContext("2d")!, el, w, h);
  const png = await blobOf(cv);
  return png ? { png, w, h } : null;
}
