import type { Anim } from "../edit/doc";

/**
 * Entrance / exit animations of pictures and text. The preview uses
 * animState(); the export builds the same curves as FFmpeg expressions
 * (animExpr), so the file moves exactly like the preview.
 *
 *   fade        opacity 0 → 1 (linear, like FFmpeg's fade filter)
 *   slide       from the left (in) / to the right (out), eased, while fading
 *   rise        up from a little below (in) / further up (out), eased, while fading
 *   pop         grows from half its size with a small overshoot, while fading
 *   zoom        comes in big and settles to its size (out: grows away), while fading
 *   bounce      drops in from above and bounces (out: bounces up and away)
 *   blur        a blurred copy turns sharp (a cross-fade of the two)
 *   typewriter  text: the letters appear one by one (out: they go, last first)
 */

export const ANIM_SECONDS = 0.5;
export const ANIM_LABELS: Record<Anim["in"], string> = { none: "None", fade: "Fade", slide: "Slide", rise: "Rise", pop: "Pop", zoom: "Zoom", bounce: "Bounce", blur: "Blur", typewriter: "Typewriter" };
/** The ones only text can do. */
export const TEXT_ONLY_ANIMS: Anim["in"][] = ["typewriter"];
/** How far "bounce" drops from (share of the height); how blurred "blur" starts (share of the height, as a blur radius); how big "zoom" starts. */
export const BOUNCE = 0.18;
export const BLUR = 0.02;
export const ZOOM_FROM = 1.5;
// "pop": from half size with a small overshoot (ease-out-back, like the logo)
const C1 = 1.70158;
const C3 = C1 + 1;
export const popCurve = (p: number) => 0.5 + 0.5 * (1 + C3 * (p - 1) ** 3 + C1 * (p - 1) ** 2);
/** A drop with bounces: 1 (up high) → 0 (landed), hitting the ground twice on the way. */
export const bounceCurve = (p: number) => (1 - p) ** 2 * Math.abs(Math.cos(2.5 * Math.PI * p));
/** At most this many steps for a typewriter (the export draws each step once). */
export const TYPE_STEPS_MAX = 60;
/** The steps a typewriter shows for n letters (0 letters … all of them: steps + 1 pictures). */
export const typeSteps = (chars: number) => Math.max(1, Math.min(TYPE_STEPS_MAX, chars));
/** Letters shown at typewriter progress `typed` (0…1), in the export's steps. */
export function typedCount(typed: number, chars: number): number {
  const k = typeSteps(chars);
  return Math.round((Math.min(k, Math.floor(typed * k + 1e-9)) / k) * chars);
}
/** How long a typewriter takes to type n letters in a clip of `len` seconds (at most 60 % of it). */
export const typeLength = (chars: number, len: number) => Math.min(len * 0.6, Math.max(ANIM_SECONDS, chars * 0.05));
/** How far "slide" moves (share of the canvas width) and "rise" moves (share of the height). */
export const SLIDE = 0.18;
export const RISE = 0.08;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * `scale`: size factor (around the middle / the text's anchor); `blur`: 0…1 how
 * much of the blurred copy shows (radius BLUR × height); `typed`: 0…1 of the
 * letters shown (typewriter).
 */
export type AnimState = { dx: number; dy: number; alpha: number; scale: number; blur: number; typed: number };

/** Length of one animation for a clip of length `len` (never more than half the clip). */
export const animLength = (len: number) => Math.min(ANIM_SECONDS, len / 2);

/** Offset (canvas fractions) and opacity at `into` seconds into a clip of length `len`. */
export function animState(into: number, len: number, anim: Anim | undefined, chars = 0): AnimState {
  const s: AnimState = { dx: 0, dy: 0, alpha: 1, scale: 1, blur: 0, typed: 1 };
  if (!anim) return s;
  const d = animLength(len);
  if (d <= 0) return s;
  // opacity other than the blur's cross-fade, and the two copies' parts of it
  let other = 1;
  let sharp = 1;
  let blurred = 0;
  const side = (kind: Anim["in"], p: number, dir: 1 | -1) => {
    const q = Math.pow(1 - p, 3); // eased distance still to travel: 1 → 0 (in) / 0 → 1 (out)
    if (kind === "typewriter") s.typed = Math.min(s.typed, p);
    else if (kind === "bounce") other *= Math.min(1, 3 * p);
    else if (kind === "blur") {
      sharp *= p;
      blurred = Math.max(blurred, Math.min(1, 2 * p) * (1 - p));
    } else other *= p;
    if (kind === "slide") s.dx += dir * q * SLIDE;
    if (kind === "rise") s.dy -= dir * q * RISE;
    if (kind === "pop") s.scale *= popCurve(p);
    if (kind === "zoom") s.scale *= 1 + (ZOOM_FROM - 1) * q;
    if (kind === "bounce") s.dy -= BOUNCE * bounceCurve(p);
  };
  const tIn = anim.in === "typewriter" ? typeLength(chars, len) : d;
  const tOut = anim.out === "typewriter" ? typeLength(chars, len) : d;
  if (anim.in !== "none" && into < tIn) side(anim.in, clamp01(into / tIn), -1);
  if (anim.out !== "none" && into > len - tOut) side(anim.out, clamp01((len - into) / tOut), 1);
  s.alpha = other * sharp;
  s.blur = other * blurred;
  return s;
}

const n4 = (v: number) => (Math.round(v * 10000) / 10000).toString();

/**
 * The same curves for FFmpeg: overlay x/y offsets (pixels, as expressions of
 * the timeline time t), alpha fades (on the clip's own time, from 0), a size
 * factor (the clip's own time, for scale … eval=frame; null: none) and, for
 * "blur", the fades of the sharp copy and of the blurred one (null: none).
 */
export function animExpr(anim: Anim | undefined, start: number, len: number, W: number, H: number): { x: string; y: string; fades: string[]; scale: string | null; blur: { fades: string[]; sigma: number } | null } {
  const out = { x: "", y: "", fades: [] as string[], scale: null as string | null, blur: null as { fades: string[]; sigma: number } | null };
  if (!anim) return out;
  const d = animLength(len);
  if (d <= 0) return out;
  const qin = `pow(1-clip((t-${n4(start)})/${n4(d)}\\,0\\,1)\\,3)`;
  const qout = `pow(1-clip((${n4(start + len)}-t)/${n4(d)}\\,0\\,1)\\,3)`;
  if (anim.in === "slide") out.x += `-${qin}*${n4(SLIDE * W)}`;
  if (anim.in === "rise") out.y += `+${qin}*${n4(RISE * H)}`;
  if (anim.out === "slide") out.x += `+${qout}*${n4(SLIDE * W)}`;
  if (anim.out === "rise") out.y += `-${qout}*${n4(RISE * H)}`;
  // (typewriter: the letters are the drawn steps (lib/render/compose); bounce: its own quicker fade; blur: the two copies)
  const fades = (k: Anim["in"]) => k !== "none" && k !== "typewriter" && k !== "bounce" && k !== "blur";
  if (fades(anim.in)) out.fades.push(`fade=t=in:st=0:d=${n4(d)}:alpha=1`);
  if (fades(anim.out)) out.fades.push(`fade=t=out:st=${n4(Math.max(0, len - d))}:d=${n4(d)}:alpha=1`);
  if (anim.in === "bounce") out.fades.push(`fade=t=in:st=0:d=${n4(d / 3)}:alpha=1`);
  if (anim.out === "bounce") out.fades.push(`fade=t=out:st=${n4(Math.max(0, len - d / 3))}:d=${n4(d / 3)}:alpha=1`);
  // bounce: drops in from above (out: jumps away) — timeline time, for the overlay
  const pT = (inSide: boolean) => (inSide ? `clip((t-${n4(start)})/${n4(d)}\\,0\\,1)` : `clip((${n4(start + len)}-t)/${n4(d)}\\,0\\,1)`);
  const bounce = (p: string) => `-${n4(BOUNCE * H)}*pow(1-${p}\\,2)*abs(cos(2.5*PI*${p}))`;
  if (anim.in === "bounce") out.y += bounce(pT(true));
  if (anim.out === "bounce") out.y += bounce(pT(false));
  // pop / zoom: a size factor over the clip's own time
  const pL = (inSide: boolean) => (inSide ? `clip(t/${n4(d)}\\,0\\,1)` : `clip((${n4(len)}-t)/${n4(d)}\\,0\\,1)`);
  const size = (k: Anim["in"], p: string) => (k === "pop" ? `(0.5+0.5*(1+${n4(C3)}*pow(${p}-1\\,3)+${n4(C1)}*pow(${p}-1\\,2)))` : k === "zoom" ? `(1+${n4(ZOOM_FROM - 1)}*pow(1-${p}\\,3))` : null);
  const sizes = [size(anim.in, pL(true)), size(anim.out, pL(false))].filter((x): x is string => !!x);
  if (sizes.length) out.scale = sizes.join("*");
  // blur: the sharp copy fades in; a blurred copy shows at the start and fades away (out: the other way round)
  if (anim.in === "blur" || anim.out === "blur") {
    const inSide = anim.in === "blur";
    if (inSide) out.fades.push(`fade=t=in:st=0:d=${n4(d)}:alpha=1`);
    else out.fades.push(`fade=t=out:st=${n4(Math.max(0, len - d))}:d=${n4(d)}:alpha=1`);
    out.blur = {
      sigma: BLUR * H,
      fades: inSide ? [`fade=t=in:st=0:d=${n4(d / 2)}:alpha=1`, `fade=t=out:st=0:d=${n4(d)}:alpha=1`] : [`fade=t=in:st=${n4(Math.max(0, len - d))}:d=${n4(d)}:alpha=1`, `fade=t=out:st=${n4(Math.max(0, len - d / 2))}:d=${n4(d / 2)}:alpha=1`],
    };
  }
  return out;
}
