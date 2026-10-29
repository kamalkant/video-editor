/**
 * Canvases and pictures that work on the page and in a Worker (the export draws in one: lib/export/worker).
 *
 * In a Worker there is no `document`: an OffscreenCanvas stands in for the <canvas>. It has everything the
 * drawing code uses (width / height, getContext "2d" and "webgl", a source for drawImage and textures), so it
 * is typed as a canvas, like lib/tracking/tracker.ts does.
 */

/** Whether a canvas can be made here (the page, or a Worker with OffscreenCanvas; not Node). */
export function canMakeCanvas(): boolean {
  return (typeof document !== "undefined" && typeof document.createElement === "function") || typeof OffscreenCanvas !== "undefined";
}

/** A new canvas: a <canvas> on the page, an OffscreenCanvas in a Worker (the same default size, 300×150). */
export function makeCanvas(width = 300, height = 150): HTMLCanvasElement {
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    return c;
  }
  return new OffscreenCanvas(width, height) as unknown as HTMLCanvasElement;
}

/** A picture: an <img> on the page, an ImageBitmap in a Worker. */
export type Picture = HTMLImageElement | ImageBitmap;

/** A picture's own size (an ImageBitmap has no naturalWidth). */
export function pictureSize(p: Picture): { w: number; h: number } {
  return "naturalWidth" in p ? { w: p.naturalWidth, h: p.naturalHeight } : { w: p.width, h: p.height };
}

/** The fonts the canvas draws with: `document.fonts` on the page, `self.fonts` in a Worker. */
export function fontSet(): FontFaceSet | null {
  if (typeof document !== "undefined" && document.fonts) return document.fonts;
  const g = globalThis as unknown as { fonts?: FontFaceSet };
  return g.fonts ?? null;
}
