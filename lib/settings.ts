import { z } from "zod";

/**
 * Settings shared by the editor UI and the server. Every number the user can
 * change is clamped to RANGES and snapped to its step before it reaches FFmpeg,
 * so no raw request text ever ends up inside a filter graph.
 */

export const RANGES = {
  similarity: { min: 0.01, max: 0.2, step: 0.005, decimals: 3 },
  blend: { min: 0, max: 0.25, step: 0.01, decimals: 2 },
  despillStrength: { min: 0, max: 100, step: 1, decimals: 0 },
  edgeShift: { min: -2, max: 2, step: 1, decimals: 0 },
  feather: { min: 0, max: 3, step: 0.5, decimals: 1 },
} as const;

export type RangeKey = keyof typeof RANGES;

export const QUALITY = {
  small: { crf: 40, hevcQ: 45 },
  balanced: { crf: 35, hevcQ: 55 },
  best: { crf: 30, hevcQ: 65 },
} as const;

export type Quality = keyof typeof QUALITY;

/** Lower frame rates we offer. Never above the source rate. */
export const FPS_CHOICES = [30, 25, 24, 15, 12] as const;
/** Output widths we offer. Never above the source width. */
export const WIDTH_CHOICES = [1920, 1280, 960, 640, 480] as const;

/** When more than this share (%) of the subject core is partly transparent, warn. */
export const SEE_THROUGH_WARN_PCT = 1.5;

export const LIMITS = {
  maxUploadBytes: 2 * 1024 * 1024 * 1024,
  /** Longest video clip (30 minutes). */
  maxDurationSec: 1800,
  /** Longest music / voiceover file (30 minutes). */
  maxAudioSec: 1800,
  maxLongSide: 3840,
  maxShortSide: 2160,
  maxFps: 60,
} as const;

/** Formatted upload size limit (e.g. "2 GB" or "500 MB"). */
export const limitSizeLabel = (bytes: number = LIMITS.maxUploadBytes) =>
  bytes >= 1024 * 1024 * 1024
    ? `${bytes / (1024 * 1024 * 1024)} GB`
    : `${Math.round(bytes / 1048576)} MB`;

const hexColor = z
  .string()
  .regex(/^#?[0-9A-Fa-f]{6}$/, "Key color must be 6 hex digits");

export const settingsSchema = z.object({
  keyColor: hexColor,
  similarity: z.number().finite(),
  blend: z.number().finite(),
  despill: z.boolean(),
  despillStrength: z.number().finite(),
  edgeShift: z.number().finite(),
  feather: z.number().finite(),
  resolution: z.union([z.literal("original"), z.number().int().positive()]),
  fps: z.union([z.literal("original"), z.number().int().positive()]),
  quality: z.enum(["small", "balanced", "best"]),
  audio: z.enum(["keep", "remove"]),
  master: z.boolean(),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULTS: Settings = {
  keyColor: "#12AF34",
  similarity: 0.05,
  blend: 0.15,
  despill: true,
  despillStrength: 100,
  edgeShift: 0,
  feather: 0,
  resolution: "original",
  fps: "original",
  quality: "balanced",
  audio: "keep",
  master: false,
};

export type PresetId = "veo" | "soft" | "sharp";

/** Presets touch keying only; key color and output options are kept. */
export const PRESETS: Record<PresetId, { label: string; hint: string; values: Pick<Settings, "similarity" | "blend" | "despill" | "despillStrength" | "edgeShift" | "feather"> }> = {
  veo: {
    label: "Recommended for Veo",
    hint: "Best starting point for Veo green-screen clips",
    values: { similarity: 0.05, blend: 0.15, despill: true, despillStrength: 100, edgeShift: 0, feather: 0 },
  },
  soft: {
    label: "Softer edges (hair)",
    hint: "Softer, more natural hair edges",
    values: { similarity: 0.04, blend: 0.18, despill: true, despillStrength: 100, edgeShift: 0, feather: 0.5 },
  },
  sharp: {
    label: "Sharper edges",
    hint: "Crisper outline, less soft blending",
    values: { similarity: 0.06, blend: 0.08, despill: true, despillStrength: 100, edgeShift: 0, feather: 0 },
  },
};

/** Settings that change the preview picture. Output-only settings are left out. */
export const PREVIEW_KEYS = ["keyColor", "similarity", "blend", "despill", "despillStrength", "edgeShift", "feather"] as const;
export type PreviewSettings = Pick<Settings, (typeof PREVIEW_KEYS)[number]>;

export function pickPreviewSettings(s: Settings): PreviewSettings {
  const out = {} as Record<string, unknown>;
  for (const k of PREVIEW_KEYS) out[k] = s[k];
  return out as PreviewSettings;
}

export function clampToRange(key: RangeKey, value: number): number {
  const r = RANGES[key];
  if (!Number.isFinite(value)) return DEFAULTS[key] as number;
  const clamped = Math.min(r.max, Math.max(r.min, value));
  const snapped = Math.round((clamped - r.min) / r.step) * r.step + r.min;
  return Number(Math.min(r.max, snapped).toFixed(r.decimals));
}

export function normalizeHex(hex: string): string {
  return "#" + hex.replace(/^#/, "").toUpperCase();
}

export type SourceLimits = { width: number; fps: number; duration?: number };

/** What sanitizing needs to know about the source video. */
export const limitsOf = (info: { width: number; fps: number; duration: number }): SourceLimits => ({ width: info.width, fps: info.fps, duration: info.duration });

/**
 * Clamp every number, force output options back to "original" when they
 * would upscale, and normalize the key color. Used by the reducer and the server.
 */
export function sanitizeSettings(s: Settings, source?: SourceLimits): Settings {
  const out: Settings = {
    ...s,
    keyColor: normalizeHex(s.keyColor),
    similarity: clampToRange("similarity", s.similarity),
    blend: clampToRange("blend", s.blend),
    despillStrength: clampToRange("despillStrength", s.despillStrength),
    edgeShift: clampToRange("edgeShift", s.edgeShift),
    feather: clampToRange("feather", s.feather),
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

/** Parse untrusted JSON into sanitized settings, or throw a zod error. */
export function parseSettings(input: unknown, source?: SourceLimits): Settings {
  return sanitizeSettings(settingsSchema.parse(input), source);
}

/** Merge untrusted partial settings (e.g. from localStorage) field by field. */
export function mergeSettings(base: Settings, input: unknown, source?: SourceLimits): Settings {
  if (!input || typeof input !== "object") return base;
  const shape = settingsSchema.shape;
  const merged: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!(k in shape)) continue;
    const r = (shape as Record<string, z.ZodType>)[k].safeParse(v);
    if (r.success) merged[k] = r.data;
  }
  return sanitizeSettings(merged as Settings, source);
}

export function activePreset(s: Settings): PresetId | "custom" {
  for (const [id, p] of Object.entries(PRESETS) as [PresetId, (typeof PRESETS)[PresetId]][]) {
    const v = p.values;
    if (
      v.similarity === s.similarity &&
      v.blend === s.blend &&
      v.despill === s.despill &&
      v.despillStrength === s.despillStrength &&
      v.edgeShift === s.edgeShift &&
      v.feather === s.feather
    )
      return id;
  }
  return "custom";
}

/** True when the key color is blue-dominant, so despill works on blue instead of green. */
export function keyIsBlue(hex: string): boolean {
  const h = hex.replace(/^#/, "");
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return b > g;
}
