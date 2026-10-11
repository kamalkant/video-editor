import { cropForAspect, type Crop } from "../player/look";

/**
 * A crop of a w × h picture to `aspect` (width ÷ height) whose window is centred on the point
 * (fx, fy) (0–1 of the picture), slid back inside the picture where needed. Smart crop uses
 * it with where the face is; "center" is fx = fy = 0.5.
 */
export function cropAround(w: number, h: number, aspect: number, fx: number, fy = 0.5): Crop | undefined {
  const base = cropForAspect(w, h, aspect);
  if (!base) return undefined;
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  if (base.l > 0 || base.r > 0) {
    const ww = 1 - base.l - base.r;
    const left = Math.min(1 - ww, Math.max(0, clamp01(fx) - ww / 2));
    return { l: round(left), t: base.t, r: round(1 - left - ww), b: base.b };
  }
  const hh = 1 - base.t - base.b;
  const top = Math.min(1 - hh, Math.max(0, clamp01(fy) - hh / 2));
  return { l: base.l, t: round(top), r: base.r, b: round(1 - top - hh) };
}

const round = (v: number) => Math.max(0, Math.round(v * 10000) / 10000);

/** The middle value (robust to a frame where the face finder looked at the wrong thing). */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
