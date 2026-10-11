import { z } from "zod";
import type { GraphBuilder, Input, OpDefinition } from "./types";

export const BLACK_RANGES = {
  threshold: { min: 0, max: 0.3, step: 0.01, decimals: 2 },
} as const;

export const blackKeyParamsSchema = z.object({
  /** Dark noise/haze below this brightness (0–1) becomes fully transparent. */
  threshold: z.number().finite(),
  /** Bring back the true brightness of glow/sparks ("unmult"). */
  restoreColor: z.boolean(),
});
export type BlackKeyParams = z.infer<typeof blackKeyParamsSchema>;

function clampThreshold(v: number) {
  const r = BLACK_RANGES.threshold;
  if (!Number.isFinite(v)) return 0.03;
  return Number((Math.round((Math.min(r.max, Math.max(r.min, v)) - r.min) / r.step) * r.step + r.min).toFixed(r.decimals));
}

/**
 * Remove a black background (fire, sparks, fireworks, muzzle flashes, light
 * leaks) the "unmult" way, which is exact for light added over black:
 *   alpha = brightest channel of the pixel (then dark noise below the threshold is cut)
 *   color = color ÷ brightest channel  (so a dim orange halo becomes bright orange, partly transparent)
 * Built from fast filters (extractplanes → blend=lighten) plus one geq for the division.
 */
export const blackKey: OpDefinition<BlackKeyParams> = {
  type: "blackKey",
  label: "Remove black background",
  schema: blackKeyParamsSchema,
  defaults: { threshold: 0.03, restoreColor: true },
  live: true,
  sanitize: (p) => ({ threshold: clampThreshold(p.threshold), restoreColor: !!p.restoreColor }),
  toFilter(p: BlackKeyParams, input: Input, g: GraphBuilder): string {
    const [c, a, r, gg, b, rg, m1, m2, mt, u, out] = ["bkc", "bka", "bkr", "bkg", "bkb", "bkrg", "bkm1", "bkm2", "bkmt", "bku", "bk0"].map((n) => g.label(n));
    const T = Math.round(p.threshold * 255);
    const cut = T > 0 ? `lut=y='clip((val-${T})*255/(255-${T})\\,0\\,255)'` : "null";
    g.add(`${input}format=rgba,split=2[${c}][${a}]`);
    g.add(`[${a}]format=gbrp,extractplanes=r+g+b[${r}][${gg}][${b}]`);
    g.add(`[${r}][${gg}]blend=all_mode=lighten[${rg}]`);
    if (p.restoreColor) {
      g.add(`[${rg}][${b}]blend=all_mode=lighten,split=2[${m1}][${m2}]`);
      const div = (ch: string) => `${ch}='min(255\\,${ch}(X\\,Y)*255/max(1\\,alpha(X\\,Y)))'`;
      g.add(`[${c}][${m1}]alphamerge,format=rgba,geq=${div("r")}:${div("g")}:${div("b")}:a='alpha(X\\,Y)'[${u}]`);
      g.add(`[${m2}]${cut}[${mt}]`);
      g.add(`[${u}][${mt}]alphamerge,format=rgba[${out}]`);
    } else {
      g.add(`[${rg}][${b}]blend=all_mode=lighten,${cut}[${mt}]`);
      g.add(`[${c}][${mt}]alphamerge,format=rgba[${out}]`);
    }
    return out;
  },
};
