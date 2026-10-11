/**
 * Where a clip's picture lands, as a four-cornered shape (a "quad"): its size (with free width /
 * height), its perspective corners, skew, turn and pivot. The preview draws it with these numbers
 * and the export (lib/render/compose) warps it with the same homography, so preview = file.
 *
 * Coordinates are canvas pixels, y down. A box's local frame has its middle at (0, 0).
 * Order of operations on the picture: size (w × h) → corner pin (local) → skew K → turn R → place.
 * Quads go round clockwise: top-left, top-right, bottom-right, bottom-left.
 */

export type Pt = { x: number; y: number };
export type Quad = [Pt, Pt, Pt, Pt];
/** Perspective corner pin: each corner's move, in shares of the box's own width / height. */
export type Corners = { tl: Pt; tr: Pt; br: Pt; bl: Pt };
/** 3 × 3, row major. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];
/** 2 × 2, row major: x' = a·x + b·y, y' = c·x + d·y. */
export type Lin = [number, number, number, number];

export const CORNER_KEYS = ["tl", "tr", "br", "bl"] as const;
export type CornerKey = (typeof CORNER_KEYS)[number];

const rad = (d: number) => (d * Math.PI) / 180;

/** The turn after the skew: A = R·K, with K = [[1, tan skewX], [tan skewY, 1]] (the canvas `transform(1, tanY, tanX, 1)`). */
export function linearPart(rotDeg = 0, skXDeg = 0, skYDeg = 0): Lin {
  const c = Math.cos(rad(rotDeg));
  const s = Math.sin(rad(rotDeg));
  const tx = Math.tan(rad(skXDeg));
  const ty = Math.tan(rad(skYDeg));
  return [c - s * ty, c * tx - s, s + c * ty, s * tx + c];
}
export const applyLin = (A: Lin, p: Pt): Pt => ({ x: A[0] * p.x + A[1] * p.y, y: A[2] * p.x + A[3] * p.y });
/** The inverse, or null when it flattens the picture (a skew of nearly 45° both ways). */
export function invertLin(A: Lin): Lin | null {
  const det = A[0] * A[3] - A[1] * A[2];
  if (Math.abs(det) < 1e-9) return null;
  return [A[3] / det, -A[1] / det, -A[2] / det, A[0] / det];
}

export type BoxLook = { rotation?: number; skewX?: number; skewY?: number; pivot?: Pt; corners?: Corners };
const hasPivot = (p: Pt | undefined): p is Pt => !!p && (Math.abs(p.x - 0.5) > 1e-9 || Math.abs(p.y - 0.5) > 1e-9);

/**
 * The drawn middle when the clip turns, sizes and skews around its pivot: C' = C + v − A·(S·v),
 * with v the pivot's offset at size 1 (unitW × unitH) and S·v the same at the drawn size (w × h).
 * The pivot itself stays where it is; without a pivot (or in the middle) C' = C.
 */
export function pivotCenter(cx: number, cy: number, w: number, h: number, unitW: number, unitH: number, t: BoxLook): Pt {
  if (!hasPivot(t.pivot)) return { x: cx, y: cy };
  const v = { x: (t.pivot.x - 0.5) * unitW, y: (t.pivot.y - 0.5) * unitH };
  const a = applyLin(linearPart(t.rotation, t.skewX, t.skewY), { x: (t.pivot.x - 0.5) * w, y: (t.pivot.y - 0.5) * h });
  return { x: cx + v.x - a.x, y: cy + v.y - a.y };
}

/** Where the pivot is on the canvas (the point turning and sizing happen around). */
export function pivotPoint(cx: number, cy: number, unitW: number, unitH: number, t: BoxLook): Pt {
  const p = t.pivot ?? { x: 0.5, y: 0.5 };
  return { x: cx + (p.x - 0.5) * unitW, y: cy + (p.y - 0.5) * unitH };
}

export const hasCorners = (c: Corners | undefined): c is Corners => !!c && CORNER_KEYS.some((k) => Math.abs(c[k].x) > 1e-9 || Math.abs(c[k].y) > 1e-9);

/** The box's corners in its own frame (middle at 0, 0), moved by the corner pin. */
export function localQuad(w: number, h: number, corners?: Corners): Quad {
  const k = corners;
  const at = (x: number, y: number, o?: Pt): Pt => ({ x: x + (o ? o.x * w : 0), y: y + (o ? o.y * h : 0) });
  return [at(-w / 2, -h / 2, k?.tl), at(w / 2, -h / 2, k?.tr), at(w / 2, h / 2, k?.br), at(-w / 2, h / 2, k?.bl)];
}

/** The box on the canvas: its corners (pinned, skewed, turned) around its drawn middle. */
export function boxQuad(box: { cx: number; cy: number; w: number; h: number }, t: BoxLook): Quad {
  const A = linearPart(t.rotation, t.skewX, t.skewY);
  return localQuad(box.w, box.h, t.corners).map((p) => {
    const q = applyLin(A, p);
    return { x: box.cx + q.x, y: box.cy + q.y };
  }) as Quad;
}

export const quadCenter = (q: Quad): Pt => ({ x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4, y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4 });
export function quadBounds(q: Quad): { x: number; y: number; w: number; h: number } {
  const xs = q.map((p) => p.x);
  const ys = q.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Signed area (positive: clockwise in y-down canvas pixels). */
export function quadArea(q: Quad): number {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const p = q[i];
    const n = q[(i + 1) % 4];
    a += p.x * n.y - n.x * p.y;
  }
  return a / 2;
}

/** A shape that can be drawn: convex, all corners turning the same way, at least `minArea` px². */
export function quadOk(q: Quad, minArea = 1): boolean {
  if (Math.abs(quadArea(q)) < minArea) return false;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = q[(i + 2) % 4];
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(z) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(z);
    else if (Math.sign(z) !== sign) return false;
  }
  return true;
}

/** Is the point inside the (convex) quad? A thin one can be caught `pad` px around it. */
export function pointInQuad(p: Pt, q: Quad, pad = 0): boolean {
  const s = Math.sign(quadArea(q)) || 1;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    // (distance to the edge's line, positive inside)
    const d = (s * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x))) / len;
    if (d < -pad) return false;
  }
  return true;
}

// ---------- homographies (Heckbert, "Fundamentals of texture mapping", 1989) ----------

/** The projective map of the unit square (0,0) (1,0) (1,1) (0,1) onto the quad (clockwise from top-left). */
export function squareToQuad(q: Quad): Mat3 {
  const [p0, p1, p2, p3] = q;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;
  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) return [p1.x - p0.x, p3.x - p0.x, p0.x, p1.y - p0.y, p3.y - p0.y, p0.y, 0, 0, 1];
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const den = dx1 * dy2 - dx2 * dy1 || 1e-12;
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  return [p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x, p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y, g, h, 1];
}

export function mul3(a: Mat3, b: Mat3): Mat3 {
  const o = new Array(9).fill(0) as Mat3;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
}

/** The adjugate (the inverse up to a factor, which a homography doesn't mind). */
export function adjugate(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  return [e * i - f * h, c * h - b * i, b * f - c * e, f * g - d * i, a * i - c * g, c * d - a * f, d * h - e * g, b * g - a * h, a * e - b * d];
}

/** The map taking quad `src` onto quad `dst`. */
export const homography = (src: Quad, dst: Quad): Mat3 => mul3(squareToQuad(dst), adjugate(squareToQuad(src)));

/** A point through a homography (w: its weight; ≤ 0 means it went past the horizon). */
export function applyH(m: Mat3, p: Pt): Pt & { w: number } {
  const w = m[6] * p.x + m[7] * p.y + m[8];
  const k = Math.abs(w) < 1e-12 ? 1e12 : 1 / w;
  return { x: (m[0] * p.x + m[1] * p.y + m[2]) * k, y: (m[3] * p.x + m[4] * p.y + m[5]) * k, w };
}

export const rectQuad = (x: number, y: number, w: number, h: number): Quad => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

/**
 * The export's warp (FFmpeg `perspective`, sense=destination): the we × he picture is padded into
 * a frame centred on the drawn middle, and each corner of that padded frame is sent through the
 * same homography as the preview. FFmpeg puts the input corners (0,0) (fw,0) (0,fh) (fw,fh) (top-left,
 * top-right, bottom-left, bottom-right) at refs; the frame goes on the canvas at (ox, oy).
 * Pixel centres: a picture pixel i covers [i, i+1] (centre i + ½), like the canvas.
 */
export function warpPlan(we: number, he: number, quad: Quad, center: Pt, margin = 2): { fw: number; fh: number; padX: number; padY: number; ox: number; oy: number; refs: number[] } | null {
  if (!quadOk(quad)) return null;
  const even = (v: number) => Math.max(2, Math.ceil(v / 2) * 2);
  let fw = even(Math.max(2 * Math.ceil(Math.max(...quad.map((p) => Math.abs(p.x - center.x))) + margin), we + 2 * margin));
  let fh = even(Math.max(2 * Math.ceil(Math.max(...quad.map((p) => Math.abs(p.y - center.y))) + margin), he + 2 * margin));
  for (let tries = 0; tries < 4; tries++) {
    const padX = Math.round((fw - we) / 2);
    const padY = Math.round((fh - he) / 2);
    const ox = Math.round(center.x - fw / 2);
    const oy = Math.round(center.y - fh / 2);
    const H = homography(rectQuad(0, 0, we, he), quad);
    const refs: number[] = [];
    let ok = true;
    for (const s of [
      { x: 0, y: 0 },
      { x: fw, y: 0 },
      { x: 0, y: fh },
      { x: fw, y: fh },
    ]) {
      const p = applyH(H, { x: s.x - padX + 0.5, y: s.y - padY + 0.5 });
      // (a padded corner past the horizon: grow the frame a little and try again)
      if (p.w <= 1e-6) ok = false;
      refs.push(p.x - ox - 0.5, p.y - oy - 0.5);
    }
    if (ok) return { fw, fh, padX, padY, ox, oy, refs };
    fw += 2;
    fh += 2;
  }
  return null;
}

// ---------- the pointer in a box's own frame ----------

/** A canvas point in the box's own frame (middle at 0, 0; before skew and turn). */
export function toLocal(p: Pt, box: { cx: number; cy: number }, t: BoxLook): Pt | null {
  const inv = invertLin(linearPart(t.rotation, t.skewX, t.skewY));
  return inv ? applyLin(inv, { x: p.x - box.cx, y: p.y - box.cy }) : null;
}

/** A point in the box's own frame on the canvas. */
export function fromLocal(p: Pt, box: { cx: number; cy: number }, t: BoxLook): Pt {
  const q = applyLin(linearPart(t.rotation, t.skewX, t.skewY), p);
  return { x: box.cx + q.x, y: box.cy + q.y };
}
