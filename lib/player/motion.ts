/**
 * Keyframes in the export: the same curves as lib/edit/keyframes motionAt,
 * written as FFmpeg expressions (like lib/player/anim for the in / out moves).
 */
import type { FullKey, MotionProp } from "../edit/keyframes";

const n4 = (v: number) => (Math.round(v * 10000) / 10000).toString();

/**
 * One property over time: `add + mul · (v0 + Σ Δv · ease(clip((τ − ti) / dt, 0, 1)))`.
 * `tau` is the time in the clip ("t" inside a clip's own filters, "T" in geq,
 * "(t-START)" for the overlay). Steps that don't change are left out.
 */
export function motionExpr(keys: FullKey[], prop: MotionProp, tau: string, mul = 1, add = 0): string {
  let e = n4(add + keys[0][prop] * mul);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    const dv = (b[prop] - a[prop]) * mul;
    if (Math.abs(dv) < 1e-9) continue;
    const p = `clip((${tau}-${n4(a.t)})/${n4(Math.max(b.t - a.t, 1e-3))}\\,0\\,1)`;
    const term = a.ease === "linear" ? p : `(${p}*${p}*(3-2*${p}))`;
    e += `${dv < 0 ? "-" : "+"}${n4(Math.abs(dv))}*${term}`;
  }
  return e;
}
