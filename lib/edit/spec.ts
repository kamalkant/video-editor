import { z } from "zod";
import { aiMatte, aiMatteParamsSchema } from "../ops/aiMatte";
import { blackKey, blackKeyParamsSchema } from "../ops/blackKey";
import { chromaKey, chromaKeyParamsSchema, type ChromaKeyParams } from "../ops/chromaKey";
import { DEFAULTS, FPS_CHOICES, WIDTH_CHOICES, type Settings, type SourceLimits } from "../settings";
import { sanitizeSegments } from "./timeline";

/**
 * EditSpec: everything needed to render a clip. An ordered list of operations
 * (today: chroma key) plus export settings. Stored in jobs and sent by the UI.
 * Future ops (trim, crop, background replace…) are added to OpInstance.
 */

export const outputSchema = z.object({
  resolution: z.union([z.literal("original"), z.number().int().positive()]),
  fps: z.union([z.literal("original"), z.number().int().positive()]),
  quality: z.enum(["small", "balanced", "best"]),
  audio: z.enum(["keep", "remove"]),
  master: z.boolean(),
  /** Crop away the empty transparent area around the person (plus padding). */
  crop: z.object({ enabled: z.boolean(), padding: z.number().finite() }).default({ enabled: false, padding: 10 }),
  /** EBU R128 loudness levelling (-16 LUFS) for even volume across all clips. */
  loudness: z.boolean().default(false).optional(),
  /** The clips' own bits per pixel at the export size (lib/export/size contentCapBpp), set by the browser for the export: no heavier file than that. */
  capBpp: z.number().finite().positive().max(10).optional(),
});
export type OutputSettings = z.infer<typeof outputSchema>;

export const CROP_PADDING = { min: 0, max: 50, step: 2 } as const;

const opId = z.string().regex(/^[\w-]{1,40}$/);

export const opInstanceSchema = z.discriminatedUnion("type", [
  z.object({ id: opId, type: z.literal("chromaKey"), enabled: z.boolean(), params: chromaKeyParamsSchema }),
  z.object({ id: opId, type: z.literal("blackKey"), enabled: z.boolean(), params: blackKeyParamsSchema }),
  z.object({ id: opId, type: z.literal("aiMatte"), enabled: z.boolean(), params: aiMatteParamsSchema }),
]);
export type OpInstance = z.infer<typeof opInstanceSchema>;

const segmentSchema = z.object({ id: opId, in: z.number().finite().min(0), out: z.number().finite().positive() });

export const editSpecSchema = z.object({
  version: z.literal(1),
  ops: z.array(opInstanceSchema).max(20),
  output: outputSchema,
  /** The kept parts of the clip (split / trim / cut). Absent = the whole clip. */
  timeline: z.object({ clips: z.array(segmentSchema).min(1).max(100) }).optional(),
});
export type EditSpec = z.infer<typeof editSpecSchema>;

export const DEFAULT_OUTPUT: OutputSettings = {
  resolution: DEFAULTS.resolution,
  fps: DEFAULTS.fps,
  quality: DEFAULTS.quality,
  audio: DEFAULTS.audio,
  master: DEFAULTS.master,
  crop: { enabled: false, padding: 10 },
  loudness: false,
};

export const DEFAULT_SPEC: EditSpec = {
  version: 1,
  ops: [{ id: "key", type: "chromaKey", enabled: true, params: { ...chromaKey.defaults } }],
  output: DEFAULT_OUTPUT,
};

export function sanitizeOutput(o: OutputSettings, source?: SourceLimits): OutputSettings {
  const pad = Number.isFinite(o.crop?.padding) ? o.crop.padding : 10;
  const out = {
    ...o,
    crop: { enabled: !!o.crop?.enabled, padding: Math.min(CROP_PADDING.max, Math.max(CROP_PADDING.min, Math.round(pad / CROP_PADDING.step) * CROP_PADDING.step)) },
  };
  if (out.resolution !== "original") {
    const ok = (WIDTH_CHOICES as readonly number[]).includes(out.resolution) && (!source || out.resolution < source.width);
    if (!ok) out.resolution = "original";
  }
  if (out.fps !== "original") {
    const ok = (FPS_CHOICES as readonly number[]).includes(out.fps) && (!source || out.fps < source.fps - 0.01);
    if (!ok) out.fps = "original";
  }
  return out;
}

export function sanitizeSpec(spec: EditSpec, source?: SourceLimits): EditSpec {
  const timeline = spec.timeline && source?.duration ? { clips: sanitizeSegments(spec.timeline.clips, source.duration, source.fps) } : spec.timeline;
  return {
    ...(timeline ? { timeline } : {}),
    version: 1,
    ops: spec.ops.map((op) => {
      switch (op.type) {
        case "chromaKey":
          return { ...op, params: chromaKey.sanitize(op.params) };
        case "blackKey":
          return { ...op, params: blackKey.sanitize(op.params) };
        case "aiMatte":
          return { ...op, params: aiMatte.sanitize(op.params) };
      }
    }),
    output: sanitizeOutput(spec.output, source),
  };
}

/** Parse untrusted input into a sanitized spec, or throw a zod error. */
export function parseSpec(input: unknown, source?: SourceLimits): EditSpec {
  return sanitizeSpec(editSpecSchema.parse(input), source);
}

/** First enabled chroma-key op, if any (used by the live preview and key UI). */
export function keyOp(spec: EditSpec): Extract<OpInstance, { type: "chromaKey" }> | undefined {
  return spec.ops.find((o): o is Extract<OpInstance, { type: "chromaKey" }> => o.type === "chromaKey");
}

/** First black-background op, if any. */
export function blackOp(spec: EditSpec): Extract<OpInstance, { type: "blackKey" }> | undefined {
  return spec.ops.find((o): o is Extract<OpInstance, { type: "blackKey" }> => o.type === "blackKey");
}

/** First AI Removal op, if any. */
export function aiOp(spec: EditSpec): Extract<OpInstance, { type: "aiMatte" }> | undefined {
  return spec.ops.find((o): o is Extract<OpInstance, { type: "aiMatte" }> => o.type === "aiMatte");
}

/** The switched-on AI Removal op (its mask must exist before rendering). */
export function activeAiOp(spec: EditSpec) {
  const op = aiOp(spec);
  return op?.enabled ? op : undefined;
}

/** The ops that make the background transparent and are switched on. */
export function activeRemovalOps(spec: EditSpec): OpInstance[] {
  return spec.ops.filter((o) => o.enabled && (o.type === "chromaKey" || o.type === "blackKey" || o.type === "aiMatte"));
}

/** Old flat settings (v1 API bodies, saved "last settings") → EditSpec. */
export function specFromSettings(s: Settings): EditSpec {
  const params: ChromaKeyParams = {
    keyColor: s.keyColor,
    similarity: s.similarity,
    blend: s.blend,
    despill: s.despill,
    despillStrength: s.despillStrength,
    edgeShift: s.edgeShift,
    feather: s.feather,
    subject: "person",
  };
  return {
    version: 1,
    ops: [{ id: "key", type: "chromaKey", enabled: true, params }],
    output: { resolution: s.resolution, fps: s.fps, quality: s.quality, audio: s.audio, master: s.master, crop: { enabled: false, padding: 10 }, loudness: false },
  };
}

/** Accept either { spec } or legacy { settings } in request bodies. */
export function specFromBody(body: { spec?: unknown; settings?: unknown }, source?: SourceLimits, parseLegacy?: (s: unknown) => Settings): EditSpec {
  if (body.spec !== undefined) return parseSpec(body.spec, source);
  if (parseLegacy) return sanitizeSpec(specFromSettings(parseLegacy(body.settings ?? {})), source);
  return sanitizeSpec(DEFAULT_SPEC, source);
}
