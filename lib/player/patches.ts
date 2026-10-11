import type { Patch } from "../edit/doc";

/**
 * Watermark / logo boxes on a clip: the same numbers for the preview (canvas)
 * and the export (FFmpeg). They work on the source picture, before anything
 * else (background removal, crop, color…).
 *
 *   remove  filled in from the pixels around the box — the method of FFmpeg's
 *           delogo: a blend of the rows above / below and the columns left /
 *           right, weighted by how close each side is
 *   blur    that area blurred
 *   cover   a color, or a picture fitted into the box
 */

/** The box in whole source pixels, kept 1 px inside the frame (delogo needs a border to read). */
export function patchRect(p: Pick<Patch, "x" | "y" | "w" | "h">, W: number, H: number) {
  const x = Math.min(W - 3, Math.max(1, Math.round(p.x * W)));
  const y = Math.min(H - 3, Math.max(1, Math.round(p.y * H)));
  const w = Math.max(2, Math.min(W - 1 - x, Math.round(p.w * W)));
  const h = Math.max(2, Math.min(H - 1 - y, Math.round(p.h * H)));
  return { x, y, w, h };
}

/** A default box: top-right corner, where watermarks usually are. */
export function newPatch(id: string): Patch {
  return { id, x: 0.78, y: 0.04, w: 0.19, h: 0.1, mode: "remove" };
}

/**
 * "Remove" on RGBA pixels (in place), like delogo: for each pixel inside the
 * box, the average of the neighbouring border pixels left/right (weighted by
 * the horizontal position) and top/bottom (by the vertical position).
 */
export function fillFromBorder(data: Uint8ClampedArray, stride: number, r: { x: number; y: number; w: number; h: number }) {
  const at = (x: number, y: number, c: number) => data[(y * stride + x) * 4 + c];
  const avg3v = (x: number, y: number, c: number) => (at(x, y - 1, c) + at(x, y, c) + at(x, y + 1, c)) / 3;
  const avg3h = (x: number, y: number, c: number) => (at(x - 1, y, c) + at(x, y, c) + at(x + 1, y, c)) / 3;
  const L = r.x - 1;
  const R = r.x + r.w;
  const T = r.y - 1;
  const B = r.y + r.h;
  // the border first (the inside will be overwritten)
  const border: number[][] = [];
  for (let c = 0; c < 4; c++) {
    const left = new Float32Array(r.h);
    const right = new Float32Array(r.h);
    const top = new Float32Array(r.w);
    const bottom = new Float32Array(r.w);
    for (let j = 0; j < r.h; j++) {
      left[j] = avg3v(L, r.y + j, c);
      right[j] = avg3v(R, r.y + j, c);
    }
    for (let i = 0; i < r.w; i++) {
      top[i] = avg3h(r.x + i, T, c);
      bottom[i] = avg3h(r.x + i, B, c);
    }
    border.push(Array.from(left), Array.from(right), Array.from(top), Array.from(bottom));
  }
  for (let j = 0; j < r.h; j++) {
    const v = (j + 1) / (r.h + 1);
    for (let i = 0; i < r.w; i++) {
      const u = (i + 1) / (r.w + 1);
      for (let c = 0; c < 4; c++) {
        const [left, right, top, bottom] = border.slice(c * 4, c * 4 + 4);
        const val = (left[j] * (1 - u) + right[j] * u + top[i] * (1 - v) + bottom[i] * v) / 2;
        data[((r.y + j) * stride + r.x + i) * 4 + c] = val;
      }
    }
  }
}

const hexFF = (h: string) => `0x${h.slice(1)}`;

/**
 * FFmpeg filters for a clip's boxes, applied to `head` (a stream label or a
 * chain ending in ","). `label()` makes new labels; `add()` adds a graph line;
 * `coverInput(mediaId)` returns the input index of a cover picture.
 * Returns the label of the result (or null when there are no boxes).
 */
export function patchFilters(patches: Patch[] | undefined, head: string, W: number, H: number, g: { label: (p: string) => string; add: (s: string) => void }, coverInput: (mediaId: string) => number | null): string | null {
  if (!patches?.length) return null;
  let cur = head;
  for (const p of patches) {
    const r = patchRect(p, W, H);
    const out = g.label("wm");
    if (p.mode === "remove") {
      g.add(`${cur}delogo=x=${r.x}:y=${r.y}:w=${r.w}:h=${r.h}[${out}]`);
    } else if (p.mode === "blur") {
      const [a, b, bb] = [g.label("wa"), g.label("wb"), g.label("wbb")];
      g.add(`${cur}split[${a}][${b}]`);
      g.add(`[${b}]crop=${r.w}:${r.h}:${r.x}:${r.y},gblur=sigma=${p.strength ?? 12}[${bb}]`);
      g.add(`[${a}][${bb}]overlay=${r.x}:${r.y}[${out}]`);
    } else {
      const k = p.mediaId ? coverInput(p.mediaId) : null;
      if (k !== null) {
        const [pic, base] = [g.label("wp"), g.label("wc")];
        g.add(`[${k}:v]scale=${r.w}:${r.h}:force_original_aspect_ratio=decrease,format=rgba[${pic}]`);
        g.add(`${cur}format=yuva420p[${base}]`);
        g.add(`[${base}][${pic}]overlay=x=${r.x}+(${r.w}-overlay_w)/2:y=${r.y}+(${r.h}-overlay_h)/2:format=auto[${out}]`);
      } else g.add(`${cur}drawbox=x=${r.x}:y=${r.y}:w=${r.w}:h=${r.h}:color=${hexFF(p.color ?? "#000000")}@1:t=fill[${out}]`);
    }
    cur = `[${out}]`;
  }
  return cur.slice(1, -1);
}
