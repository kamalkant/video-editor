import type { ClipMask, ColorAdjust, Transform } from "../edit/doc";
import { pivotCenter } from "./quad";

/**
 * How one picture clip looks: crop, flip, rotation, color and shape. The
 * preview (lib/player/glLook, WebGL) and the export (lib/render/compose,
 * FFmpeg) both use these numbers, in the same order:
 *
 *   crop → flip → color matrix → size & place → shape mask + border → rotate
 */

// ---------- color ----------

/**
 * A 4×4 matrix on (r, g, b, a), row by row. The 4th column multiplies alpha,
 * so for solid pixels it is a constant offset — exactly what FFmpeg's
 * colorchannelmixer does (ra, ga, ba), and what the WebGL pass copies.
 */
export type Mat = number[];

export const IDENTITY: Mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export const NEUTRAL: ColorAdjust = { brightness: 0, contrast: 1, saturation: 1, temperature: 0 };

/** a · b (b is applied first). */
export function mul(a: Mat, b: Mat): Mat {
  const out = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) out[r * 4 + c] += a[r * 4 + k] * b[k * 4 + c];
  return out;
}

const LR = 0.2126;
const LG = 0.7152;
const LB = 0.0722;

export const brightnessMat = (b: number): Mat => [1 + b, 0, 0, 0, 0, 1 + b, 0, 0, 0, 0, 1 + b, 0, 0, 0, 0, 1];
export const contrastMat = (c: number): Mat => {
  const o = 0.5 * (1 - c);
  return [c, 0, 0, o, 0, c, 0, o, 0, 0, c, o, 0, 0, 0, 1];
};
export const saturationMat = (s: number): Mat => {
  const i = 1 - s;
  return [LR * i + s, LG * i, LB * i, 0, LR * i, LG * i + s, LB * i, 0, LR * i, LG * i, LB * i + s, 0, 0, 0, 0, 1];
};
/** Warm (+) or cool (−): red up and blue down, or the other way. */
export const temperatureMat = (k: number): Mat => [1 + 0.16 * k, 0, 0, 0, 0, 1 + 0.02 * k, 0, 0, 0, 0, 1 - 0.16 * k, 0, 0, 0, 0, 1];
const sepiaMat: Mat = [0.393, 0.769, 0.189, 0, 0.349, 0.686, 0.168, 0, 0.272, 0.534, 0.131, 0, 0, 0, 0, 1];
const tint = (r: number, g: number, b: number): Mat => [1, 0, 0, r, 0, 1, 0, g, 0, 0, 1, b, 0, 0, 0, 1];

/** Named looks (filters): a matrix on top of the corrections, and an optional vignette. */
export const LOOKS: Record<string, { label: string; mat: Mat; vignette?: number }> = {
  vivid: { label: "Vivid", mat: mul(saturationMat(1.35), contrastMat(1.1)) },
  warm: { label: "Warm", mat: mul(temperatureMat(0.55), saturationMat(1.08)) },
  cool: { label: "Cool", mat: mul(temperatureMat(-0.5), saturationMat(0.95)) },
  cinematic: { label: "Cinematic", mat: mul(tint(-0.02, 0.01, 0.04), mul(contrastMat(1.15), saturationMat(0.85))), vignette: 0.35 },
  bw: { label: "B&W", mat: mul(contrastMat(1.12), saturationMat(0)) },
  vintage: { label: "Vintage", mat: mul(tint(0.04, 0.02, -0.02), mul(contrastMat(0.9), sepiaMat)), vignette: 0.4 },
  fade: { label: "Fade", mat: mul(tint(0.06, 0.06, 0.07), mul(contrastMat(0.82), saturationMat(0.8))) },
  night: { label: "Night", mat: mul(tint(-0.03, 0, 0.05), mul(brightnessMat(-0.18), mul(temperatureMat(-0.7), saturationMat(0.7)))), vignette: 0.3 },
  cyberpunk: { label: "Cyberpunk", mat: mul(tint(-0.05, 0.02, 0.1), mul(contrastMat(1.2), saturationMat(1.4))), vignette: 0.25 },
  sepia: { label: "Sepia", mat: mul(sepiaMat, contrastMat(1.05)) },
  emerald: { label: "Emerald", mat: mul(tint(-0.06, 0.08, -0.02), mul(contrastMat(1.1), saturationMat(1.15))), vignette: 0.2 },
};

/** The whole color change of a clip as one matrix (corrections first, then the look). */
export function colorMatrix(c: ColorAdjust | undefined): Mat {
  if (!c) return IDENTITY;
  let m = brightnessMat(c.brightness);
  m = mul(contrastMat(c.contrast), m);
  m = mul(saturationMat(c.saturation), m);
  m = mul(temperatureMat(c.temperature), m);
  const look = c.look ? LOOKS[c.look] : undefined;
  if (look) m = mul(look.mat, m);
  return m;
}

export const isIdentity = (m: Mat) => m.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-6);
/** The vignette strength of a clip (its own, else its look's). */
export const vignetteOf = (c: ColorAdjust | undefined) => c?.vignette ?? (c?.look ? (LOOKS[c.look]?.vignette ?? 0) : 0);

/**
 * How much a vignette of strength v darkens the pixel (x, y) of a w×h picture
 * (1 = not at all). The preview shader, the look thumbnails and the export use this curve.
 */
export function vignetteGain(v: number, x: number, y: number, w: number, h: number): number {
  const e = Math.hypot((x - w / 2) / (w / 2), (y - h / 2) / (h / 2)) / Math.SQRT2;
  const q = Math.min(1, Math.max(0, (e - 0.35) / 0.65));
  return 1 - v * 0.85 * q * q * (3 - 2 * q);
}

/** The same curve as an FFmpeg geq expression of X, Y, W, H (0–255 gray). */
export function vignetteExpr(v: number): string {
  const e = "(hypot((X-W/2)/(W/2)\\,(Y-H/2)/(H/2))/1.41421356)";
  const q = `clip((${e}-0.35)/0.65\\,0\\,1)`;
  return `255*(1-${v.toFixed(4)}*0.85*${q}*${q}*(3-2*${q}))`;
}

/** One pixel through the matrix (0–1 values), clamped like the GPU and FFmpeg. */
export function applyMat(m: Mat, px: [number, number, number, number]): [number, number, number, number] {
  const out = [0, 0, 0, 0].map((_, r) => m[r * 4] * px[0] + m[r * 4 + 1] * px[1] + m[r * 4 + 2] * px[2] + m[r * 4 + 3] * px[3]);
  return out.map((v) => Math.min(1, Math.max(0, v))) as [number, number, number, number];
}

const n5 = (v: number) => (Math.round(v * 100000) / 100000).toString();
/** FFmpeg filter for a color matrix (on RGBA). */
export function mixerFilter(m: Mat): string {
  const k = ["rr", "rg", "rb", "ra", "gr", "gg", "gb", "ga", "br", "bg", "bb", "ba", "ar", "ag", "ab", "aa"];
  return `colorchannelmixer=${k.map((name, i) => `${name}=${n5(m[i])}`).join(":")}`;
}

// ---------- geometry ----------

export type Crop = { l: number; t: number; r: number; b: number };
export const NO_CROP: Crop = { l: 0, t: 0, r: 0, b: 0 };
export const cropOf = (t: Pick<Transform, "crop">): Crop => t.crop ?? NO_CROP;
/** The most a crop may cut off each edge (the project keeps at most this; lib/edit/doc transformSchema). */
export const CROP_MAX = 0.45;
/** Crop edges the project can keep: each 0 – 45 %. */
export function clampCrop(k: Crop): Crop {
  const c = (v: number) => Math.min(CROP_MAX, Math.max(0, Number.isFinite(v) ? v : 0));
  return { l: c(k.l), t: c(k.t), r: c(k.r), b: c(k.b) };
}
export const hasCrop = (t: Pick<Transform, "crop">) => !!t.crop && (t.crop.l > 0 || t.crop.t > 0 || t.crop.r > 0 || t.crop.b > 0);
/** Rotation in (−180, 180]. */
export function rotationOf(t: Pick<Transform, "rotation">): number {
  let r = (t.rotation ?? 0) % 360;
  if (r > 180) r -= 360;
  if (r <= -180) r += 360;
  return Math.abs(r) < 1e-6 ? 0 : r;
}
/** 90° or 270°: fit uses the picture turned on its side. */
export const quarterTurn = (t: Pick<Transform, "rotation">) => Math.abs(Math.abs(rotationOf(t)) - 90) < 1e-6;

/** The part of a w × h picture that shows (source pixels). */
export function cropRect(w: number, h: number, t: Pick<Transform, "crop">) {
  const c = cropOf(t);
  return { sx: w * c.l, sy: h * c.t, sw: Math.max(1, w * (1 - c.l - c.r)), sh: Math.max(1, h * (1 - c.t - c.b)) };
}

/**
 * Where a cropped, rotated picture lands on a W × H canvas: its middle
 * (cx, cy), its size before turning (w × h) and the angle.
 */
export function placeClip(w: number, h: number, W: number, H: number, t: Transform) {
  const { sw, sh } = cropRect(w || W, h || H, t);
  const [fw, fh] = quarterTurn(t) ? [sh, sw] : [sw, sh];
  const base = t.fit === "fill" ? Math.max(W / fw, H / fh) : Math.min(W / fw, H / fh);
  const s = base * t.scale;
  // free width / height on top of the size; the middle moves so the pivot stays put (lib/player/quad)
  const ow = sw * s * (t.scaleX ?? 1);
  const oh = sh * s * (t.scaleY ?? 1);
  const c = pivotCenter(W / 2 + t.x * W, H / 2 + t.y * H, ow, oh, sw * base, sh * base, t);
  return { cx: c.x, cy: c.y, w: ow, h: oh, rotation: rotationOf(t) };
}

/** Crop edges that make the picture this shape (width / height), centred. */
export function cropForAspect(w: number, h: number, aspect: number | null): Crop | undefined {
  if (!aspect || !w || !h) return undefined;
  const now = w / h;
  if (Math.abs(now - aspect) < 1e-3) return undefined;
  // (a very wide or tall picture can't be cut that far: the shape comes as close as it can)
  if (now > aspect) {
    const cut = (1 - aspect / now) / 2;
    return clampCrop({ l: cut, t: 0, r: cut, b: 0 });
  }
  const cut = (1 - now / aspect) / 2;
  return clampCrop({ l: 0, t: cut, r: 0, b: cut });
}

// ---------- shape masks ----------

/** Corner radius in pixels of a mask on a w × h picture. */
export function maskRadius(m: ClipMask, w: number, h: number): number {
  if (m.shape === "circle") return Math.min(w, h) / 2;
  if (m.shape === "rounded") return m.radius * Math.min(w, h);
  return 0;
}

/**
 * Signed distance to the mask edge (negative inside) at pixel (x, y), for a
 * rounded rectangle; a circle is the rounded square in the middle.
 */
export function maskDistance(m: ClipMask, w: number, h: number, x: number, y: number): number {
  const r = maskRadius(m, w, h);
  const [hw, hh] = m.shape === "circle" ? [r, r] : [w / 2, h / 2];
  const qx = Math.abs(x - w / 2) - (hw - r);
  const qy = Math.abs(y - h / 2) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
/** Mask opacity from the distance (a soft edge of `feather` pixels, at least 1 for smooth edges). */
export const maskAlpha = (d: number, feather: number) => Math.min(1, Math.max(0, 0.5 - d / Math.max(1, feather)));

/** The same distance as an FFmpeg expression of X and Y (geq), for a w × h picture. */
export function maskDistanceExpr(m: ClipMask, w: number, h: number): string {
  const r = maskRadius(m, w, h);
  const [hw, hh] = m.shape === "circle" ? [r, r] : [w / 2, h / 2];
  const qx = `(abs(X-${n5(w / 2)})-${n5(hw - r)})`;
  const qy = `(abs(Y-${n5(h / 2)})-${n5(hh - r)})`;
  return `(hypot(max(${qx}\\,0)\\,max(${qy}\\,0))+min(max(${qx}\\,${qy})\\,0)-${n5(r)})`;
}
