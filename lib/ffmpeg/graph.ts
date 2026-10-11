import type { CropBox } from "../edit/geometry";
import type { EditSpec } from "../edit/spec";
import { OPS, type AnyOp } from "../ops/registry";
import { GraphBuilder, type Input } from "../ops/types";

export type Target = "preview" | "webm" | "hevc" | "prores" | "poster";

/** Output pixel format per target. Web formats get BT.709 YUV explicitly. */
const TAIL: Record<Target, string> = {
  preview: "format=rgba",
  poster: "format=rgba",
  webm: "scale=out_color_matrix=bt709:out_range=tv,format=yuva420p",
  hevc: "format=bgra",
  prores: "scale=out_color_matrix=bt709:out_range=tv,format=yuva444p10le",
};

export type GraphOptions = {
  /** Output width (even). Omit to keep the source size. */
  width?: number;
  /** Output frame rate. Omit to keep the source rate. */
  fps?: number;
  /** Label of the final output pad. */
  outLabel?: string;
  /** Keep only this area (crop empty space around the person). */
  crop?: CropBox | null;
  /** Input label of the AI mask video (needed when the spec has an AI Removal op), e.g. "[1:v]". */
  maskInput?: string;
  /** Keep only these parts of the clip (a `select` expression from the timeline). */
  select?: string;
  /** Filters run on the source (and the AI mask) before the operations, e.g. a small scale for thumbnails. */
  pre?: string;
};

/**
 * Build the -filter_complex graph: source (+ fps) → every enabled operation in
 * order → resize → output pixel format. All values come from a sanitized spec.
 */
export function buildFilterGraph(spec: EditSpec, target: Target, opts: GraphOptions = {}): string {
  const g = new GraphBuilder();
  const out = g.label(opts.outLabel ?? "vout");
  // cut parts are dropped first; the kept frames get back-to-back timestamps
  const cut = opts.select ? `select=${opts.select},setpts=N/FRAME_RATE/TB,` : "";
  const fps = opts.fps ? `fps=${Math.round(opts.fps)},` : "";
  const pre = opts.pre ? `${opts.pre},` : "";
  let input: Input = `[0:v]${cut}${fps}${pre}`;
  if (opts.maskInput) g.maskInput = `${opts.maskInput}${cut}${fps}${pre}`;
  for (const op of spec.ops) {
    if (!op.enabled) continue;
    const label = (OPS[op.type] as AnyOp).toFilter(op.params, input, g);
    input = `[${label}]`;
  }
  const tail: string[] = [];
  if (opts.crop) {
    const c = opts.crop;
    tail.push(`crop=${Math.round(c.w)}:${Math.round(c.h)}:${Math.round(c.x)}:${Math.round(c.y)}`);
  }
  if (opts.width) tail.push(`scale=${Math.round(opts.width / 2) * 2}:-2:flags=lanczos`);
  tail.push(TAIL[target]);
  g.add(`${input}${tail.join(",")}[${out}]`);
  return g.toString();
}
