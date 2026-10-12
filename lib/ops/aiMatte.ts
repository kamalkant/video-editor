import { z } from "zod";
import type { GraphBuilder, Input, OpDefinition } from "./types";

/**
 * AI Removal: the background is removed with a mask made by Apple Vision
 * (scripts/vision-matte), one mask frame per video frame, cached per clip.
 * The mask arrives as a second FFmpeg input; this op cleans it up and merges it.
 */

/** Shown off a Mac (e.g. viplay.in on Linux hosting): AI Removal uses Apple's Vision framework. */
export const NO_AI_REMOVAL =
  "AI background removal isn't available on this server yet. For green-screen video, use Background → Color Key.";

export const AI_RANGES = {
  smooth: { min: 0, max: 2, step: 1 },
  edgeShift: { min: -3, max: 3, step: 1 },
  feather: { min: 0, max: 3, step: 0.5, decimals: 1 },
  hardness: { min: 0, max: 0.8, step: 0.05, decimals: 2 },
  blur: { min: 2, max: 40, step: 1 },
} as const;

export const aiMatteParamsSchema = z.object({
  /** What to keep: people (person), people plus what they hold (hybrid), or the main object (subject). */
  mode: z.enum(["person", "hybrid", "subject"]),
  /** Vision quality of the person pass: accurate has the softest hair, balanced is 3–4× faster. */
  quality: z.enum(["accurate", "balanced"]),
  /** Drop small specks (e.g. a corner watermark) from the mask. */
  despeckle: z.boolean(),
  /** Flicker reduction: median over ±N frames (0 off, 1 light, 2 strong). No lag, cuts stay sharp. */
  smooth: z.number().finite(),
  /** Grow (+) or shrink (−) the edge, in pixels. */
  edgeShift: z.number().finite(),
  /** Blur the mask edge, in pixels. */
  feather: z.number().finite(),
  /** Edge hardness: levels on the mask (0 = as made; 0.66 ≈ 64→192) — crisper edges on light pages. */
  hardness: z.number().finite(),
  /** What happens to the background: removed (transparent, the default) or softly blurred ("Blur background"). */
  background: z.enum(["transparent", "blur"]).optional(),
  /** Blur strength (Gaussian sigma, source pixels) when the background is blurred. */
  blur: z.number().finite().optional(),
});
export type AiMatteParams = z.infer<typeof aiMatteParamsSchema>;

/** The parameters that change the mask itself (a new mask must be made); the rest is applied by FFmpeg. */
export type AiMaskParams = Pick<AiMatteParams, "mode" | "quality" | "despeckle">;
export const maskParamsOf = (p: AiMatteParams): AiMaskParams => ({ mode: p.mode, quality: p.quality, despeckle: p.despeckle });

function snap(v: number, r: { min: number; max: number; step: number; decimals?: number }, fallback: number) {
  if (!Number.isFinite(v)) return fallback;
  const c = Math.min(r.max, Math.max(r.min, v));
  return Number((Math.round((c - r.min) / r.step) * r.step + r.min).toFixed(r.decimals ?? 0));
}

export const aiMatte: OpDefinition<AiMatteParams> = {
  type: "aiMatte",
  label: "AI background removal",
  schema: aiMatteParamsSchema,
  // tested on real clips: hybrid + balanced is crisp, stable and fast (~27 fps on an M5)
  defaults: { mode: "hybrid", quality: "balanced", despeckle: true, smooth: 1, edgeShift: 0, feather: 0.5, hardness: 0 },
  live: false,
  needsMask: true,
  sanitize: (p) => ({
    mode: p.mode,
    quality: p.quality,
    despeckle: !!p.despeckle,
    smooth: snap(p.smooth, AI_RANGES.smooth, 1),
    edgeShift: snap(p.edgeShift, AI_RANGES.edgeShift, 0),
    feather: snap(p.feather, AI_RANGES.feather, 0.5),
    hardness: snap(p.hardness, AI_RANGES.hardness, 0),
    // only stored when on, so older settings stay exactly as they were
    ...(p.background === "blur" ? { background: "blur" as const, blur: snap(p.blur ?? 12, AI_RANGES.blur, 12) } : {}),
  }),
  toFilter(p: AiMatteParams, input: Input, g: GraphBuilder): string {
    if (!g.maskInput) throw new Error("aiMatte needs the mask video as a second input");
    const [c, m, out] = [g.label("aic"), g.label("aim"), g.label("ai0")];
    // frame-index timestamps on both inputs: the mask file's millisecond times would add/drop a frame
    const mask = ["setpts=N/FRAME_RATE/TB", "format=gray"];
    // tmedian drops R frames at each end and shifts the rest early: pad with copies first
    if (p.smooth > 0) mask.push(`tpad=start=${p.smooth}:start_mode=clone:stop=${p.smooth}:stop_mode=clone,tmedian=radius=${p.smooth}`);
    if (p.hardness > 0) {
      const lo = Math.round(p.hardness * 96);
      const hi = 255 - lo;
      mask.push(`lut=y='clip((val-${lo})*255/${hi - lo}\\,0\\,255)'`);
    }
    for (let i = 0; i < Math.abs(p.edgeShift); i++) mask.push(p.edgeShift > 0 ? "dilation" : "erosion");
    if (p.feather > 0) mask.push(`gblur=sigma=${p.feather}`);
    g.add(`${g.maskInput}${mask.join(",")}[${m}]`);
    if (p.background === "blur") {
      // Blur background: the subject (masked) over a blurred copy of the whole frame. The result is solid.
      const [b0, b1, fg] = [g.label("aib"), g.label("aibb"), g.label("aif")];
      g.add(`${input}setpts=N/FRAME_RATE/TB,format=rgba,split[${c}][${b0}]`);
      g.add(`[${b0}]gblur=sigma=${p.blur ?? 12}[${b1}]`);
      g.add(`[${c}][${m}]alphamerge[${fg}]`);
      g.add(`[${b1}][${fg}]overlay=format=auto[${out}]`);
      return out;
    }
    g.add(`${input}setpts=N/FRAME_RATE/TB,format=rgba[${c}]`);
    g.add(`[${c}][${m}]alphamerge[${out}]`);
    return out;
  },
};
