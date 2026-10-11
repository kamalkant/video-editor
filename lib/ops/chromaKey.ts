import { z } from "zod";
import { clampToRange, keyIsBlue, normalizeHex, RANGES } from "../settings";
import type { GraphBuilder, Input, OpDefinition } from "./types";

export const chromaKeyParamsSchema = z.object({
  keyColor: z.string().regex(/^#?[0-9A-Fa-f]{6}$/, "Key color must be 6 hex digits"),
  similarity: z.number().finite(),
  blend: z.number().finite(),
  despill: z.boolean(),
  despillStrength: z.number().finite(),
  edgeShift: z.number().finite(),
  feather: z.number().finite(),
  /** "effects" = smoke, fire, sparks, powder: partly see-through on purpose (no see-through warning). */
  subject: z.enum(["person", "effects"]).default("person"),
});

export type ChromaKeyParams = z.infer<typeof chromaKeyParamsSchema>;

const fixed = (n: number, d: number) => n.toFixed(d);

/**
 * Remove the green (or blue) background. Tested order: chromakey →
 * edge-only despill (only pixels with alpha < 250 change, so skin keeps its
 * color) → edge shift / feather on the final alpha.
 */
export const chromaKey: OpDefinition<ChromaKeyParams> = {
  type: "chromaKey",
  label: "Remove background",
  schema: chromaKeyParamsSchema,
  defaults: { keyColor: "#12AF34", similarity: 0.05, blend: 0.15, despill: true, despillStrength: 100, edgeShift: 0, feather: 0, subject: "person" },
  live: true,
  sanitize: (p) => ({
    ...p,
    keyColor: normalizeHex(p.keyColor),
    similarity: clampToRange("similarity", p.similarity),
    blend: clampToRange("blend", p.blend),
    despillStrength: clampToRange("despillStrength", p.despillStrength),
    edgeShift: clampToRange("edgeShift", p.edgeShift),
    feather: clampToRange("feather", p.feather),
  }),
  toFilter(p: ChromaKeyParams, input: Input, g: GraphBuilder): string {
    const hex = p.keyColor.replace(/^#/, "");
    // last line of defence against filter injection
    if (!/^[0-9A-Fa-f]{6}$/.test(hex)) throw new Error("Invalid key color");
    const sim = fixed(p.similarity, RANGES.similarity.decimals);
    const blend = fixed(p.blend, RANGES.blend.decimals);
    const k0 = g.label("k0");
    g.add(`${input}chromakey=0x${hex.toUpperCase()}:${sim}:${blend},format=rgba[${k0}]`);
    let cur = k0;

    if (p.despill && p.despillStrength > 0) {
      const type = keyIsBlue(hex) ? "blue" : "green";
      const scale = fixed(-p.despillStrength / 100, 2);
      const [o, s, m, a, d, mask, dm, c, al, k1] = ["dso", "dss", "dsm", "dsa", "dsd", "dsmask", "dsdm", "dsc", "dsal", "k1"].map((n) => g.label(n));
      g.add(`[${cur}]split=4[${o}][${s}][${m}][${a}]`);
      g.add(`[${s}]despill=type=${type}:${type}=${scale}[${d}]`);
      g.add(`[${m}]alphaextract,lut=y='if(gte(val\\,250)\\,0\\,255)'[${mask}]`);
      g.add(`[${d}][${mask}]alphamerge[${dm}]`);
      g.add(`[${o}][${dm}]overlay=format=rgb[${c}]`);
      g.add(`[${a}]alphaextract[${al}]`);
      g.add(`[${c}][${al}]alphamerge,format=rgba[${k1}]`);
      cur = k1;
    }

    const shift = Math.round(p.edgeShift);
    if (shift !== 0 || p.feather > 0) {
      const ops: string[] = [];
      // negative = tighter (erode the alpha), positive = wider (dilate the alpha)
      for (let i = 0; i < Math.abs(shift); i++) ops.push(shift < 0 ? "erosion" : "dilation");
      if (p.feather > 0) ops.push(`gblur=sigma=${fixed(p.feather, RANGES.feather.decimals)}`);
      const [ac, aa, am, k2] = ["aoc", "aoa", "aom", "k2"].map((n) => g.label(n));
      g.add(`[${cur}]split=2[${ac}][${aa}]`);
      g.add(`[${aa}]alphaextract,${ops.join(",")}[${am}]`);
      g.add(`[${ac}][${am}]alphamerge,format=rgba[${k2}]`);
      cur = k2;
    }
    return cur;
  },
};
