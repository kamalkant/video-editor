/** The see-through check, shared by the server's exact frame (lib/ffmpeg/preview) and the browser's live preview. */

/**
 * Share of the subject core that has turned partly see-through.
 * The subject is alpha > 40; its core is that mask eroded by `erode` px,
 * so soft edges (which are meant to be partly transparent) don't count.
 */
export function computeSeeThrough(alpha: Uint8Array, w: number, h: number, erode = 3): { seeThroughPct: number | null; transparentPct: number } {
  const n = w * h;
  let transparent = 0;
  let mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (alpha[i] < 10) transparent++;
    mask[i] = alpha[i] > 40 ? 1 : 0;
  }
  for (let pass = 0; pass < erode; pass++) {
    const next = new Uint8Array(n);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        next[i] = mask[i] & mask[i - 1] & mask[i + 1] & mask[i - w] & mask[i + w];
      }
    }
    mask = next;
  }
  let core = 0;
  let see = 0;
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue;
    core++;
    if (alpha[i] < 245) see++;
  }
  const transparentPct = (100 * transparent) / n;
  if (core < n * 0.005) return { seeThroughPct: null, transparentPct };
  return { seeThroughPct: Math.round((1000 * see) / core) / 10, transparentPct: Math.round(transparentPct * 10) / 10 };
}

/**
 * The same check on a drawn canvas (the live preview of a file kept in this browser): its alpha at 320 px wide.
 * null when nothing is drawn yet or there's no subject.
 */
export function seeThroughOfCanvas(src: HTMLCanvasElement, width = 320): number | null {
  if (!src.width || !src.height) return null;
  const w = width;
  const h = Math.max(1, Math.round((src.height * width) / src.width));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = d[i * 4 + 3];
  return computeSeeThrough(alpha, w, h).seeThroughPct;
}
