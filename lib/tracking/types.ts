import { z } from "zod";

/**
 * Supported tracking modes:
 * - point: Single point/small patch tracking (primary implementation)
 * - area: Bounding box / template region tracking
 * - object: AI/object segmentation tracking (future-ready architecture)
 * - planar: 4-point perspective planar tracking (future-ready architecture)
 */
export const TRACKING_TYPES = ["point", "area", "object", "planar"] as const;
export type TrackingType = (typeof TRACKING_TYPES)[number];

export const TRACKING_STATUSES = ["idle", "tracking", "completed", "lost"] as const;
export type TrackingStatus = (typeof TRACKING_STATUSES)[number];

export const trackingAccuracySchema = z.enum(["fast", "medium", "high"]);
export type TrackingAccuracy = z.infer<typeof trackingAccuracySchema>;

export const trackingSettingsSchema = z.object({
  accuracy: trackingAccuracySchema.default("high"),
  lostTolerance: z.enum(["strict", "normal", "sticky"]).default("sticky"),
  trackPosition: z.boolean().default(true),
  trackScale: z.boolean().default(true),
  trackRotation: z.boolean().default(true),
  trackPerspective: z.boolean().default(false),
  searchWindowSize: z.number().int().min(15).max(120).default(55),
  templateSize: z.number().int().min(11).max(81).default(31),
});
export type TrackingSettings = z.infer<typeof trackingSettingsSchema>;

export const DEFAULT_TRACKING_SETTINGS: TrackingSettings = {
  accuracy: "high",
  lostTolerance: "sticky",
  trackPosition: true,
  trackScale: true,
  trackRotation: true,
  trackPerspective: false,
  searchWindowSize: 55,
  templateSize: 31,
};

/**
 * One tracked frame sample.
 * Coordinates are normalized 0..1 relative to the video clip frame.
 */
export const trackingKeyframeSchema = z.object({
  /** Timeline time in seconds */
  t: z.number().finite().min(0),
  /** Normalized X position (0 = left, 1 = right) */
  x: z.number().finite().min(-1).max(2),
  /** Normalized Y position (0 = top, 1 = bottom) */
  y: z.number().finite().min(-1).max(2),
  /** Scale factor relative to initial size (1.0 = unchanged) */
  scale: z.number().finite().min(0.01).max(10).optional().default(1),
  /** Rotation in degrees relative to initial angle (0 = unchanged) */
  rotation: z.number().finite().min(-360).max(360).optional().default(0),
  /** Normalized width/height of the tracking box at this frame */
  box: z
    .object({
      w: z.number().finite().min(0.005).max(1),
      h: z.number().finite().min(0.005).max(1),
    })
    .optional(),
  /** Confidence score of tracking match: 0 (lost) .. 1 (perfect) */
  confidence: z.number().finite().min(0).max(1).optional().default(1),
});
export type TrackingKeyframe = z.infer<typeof trackingKeyframeSchema>;

/**
 * An element or effect attached to a tracking point.
 */
export const clipAttachmentSchema = z.object({
  id: z.string().max(40),
  type: z.literal("clip"),
  clipId: z.string().max(40),
  category: z
    .enum(["text", "image", "video", "sticker", "element", "logo", "effect"])
    .optional(),
  name: z.string().max(80).optional(),
  offset: z
    .object({
      x: z.number().finite().min(-2).max(2).default(0),
      y: z.number().finite().min(-2).max(2).default(0),
      scale: z.number().finite().min(0.05).max(10).default(1),
      rotation: z.number().finite().min(-360).max(360).default(0),
    })
    .default({ x: 0, y: 0, scale: 1, rotation: 0 }),
});
export type ClipAttachment = z.infer<typeof clipAttachmentSchema>;

export const blurAttachmentSchema = z.object({
  id: z.string().max(40),
  type: z.literal("blur"),
  /** Clip ID on overlay track if represented as timeline clip */
  clipId: z.string().max(40).optional(),
  mode: z.enum(["blur", "pixelate"]).default("blur"),
  intensity: z.number().finite().min(1).max(50).default(16),
  shape: z.enum(["rect", "ellipse"]).default("ellipse"),
  padding: z.number().finite().min(0).max(60).default(10),
  feather: z.number().finite().min(0).max(40).default(8),
  offset: z
    .object({
      x: z.number().finite().min(-2).max(2).default(0),
      y: z.number().finite().min(-2).max(2).default(0),
    })
    .default({ x: 0, y: 0 }),
  size: z
    .object({
      w: z.number().finite().min(0.01).max(1).default(0.12),
      h: z.number().finite().min(0.01).max(1).default(0.12),
    })
    .default({ w: 0.12, h: 0.12 }),
});
export type BlurAttachment = z.infer<typeof blurAttachmentSchema>;

export const attachmentSchema = z.discriminatedUnion("type", [
  clipAttachmentSchema,
  blurAttachmentSchema,
]);
export type Attachment = z.infer<typeof attachmentSchema>;

/**
 * A single Tracking Point (multiple tracking points per video clip).
 * Example: Point 1 - Hand, Point 2 - Face, Point 3 - Phone.
 */
export const trackingPointSchema = z.object({
  id: z.string().max(40),
  name: z.string().max(60),
  color: z.string().max(20).default("#3b82f6"),
  type: z.enum(TRACKING_TYPES).default("point"),
  status: z.enum(TRACKING_STATUSES).default("idle"),
  settings: trackingSettingsSchema.default(DEFAULT_TRACKING_SETTINGS),
  initial: z.object({
    t: z.number().finite().min(0),
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
    box: z.object({
      w: z.number().finite().min(0.005).max(1),
      h: z.number().finite().min(0.005).max(1),
    }),
  }),
  keyframes: z.array(trackingKeyframeSchema).max(18000), // supports up to 10 min @ 30fps
  attachments: z.array(attachmentSchema).max(30).default([]),
});
export type TrackingPoint = z.infer<typeof trackingPointSchema>;

export const clipTrackingSchema = z.object({
  points: z.array(trackingPointSchema).max(20).default([]),
  activePointId: z.string().nullable().optional(),
});
export type ClipTracking = z.infer<typeof clipTrackingSchema>;

/** Palette of colors for distinct multi-tracking points */
export const TRACKING_COLORS = [
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#f97316", // Orange
  "#14b8a6", // Teal
] as const;

/**
 * Evaluates the interpolated tracking position, scale, and rotation at time `t`.
 */
/** Maximum allowed time gap (in seconds) between keyframes before treating as an untracked gap */
export const TRACKING_GAP_THRESHOLD_SEC = 2.5;

export function trackingAt(
  point: TrackingPoint,
  t: number,
  options?: { clamp?: boolean },
): { x: number; y: number; scale: number; rotation: number; confidence: number; box?: { w: number; h: number } } | null {
  const k = point.keyframes;
  if (!k || !k.length) {
    return {
      x: point.initial.x,
      y: point.initial.y,
      scale: 1,
      rotation: 0,
      confidence: 1,
      box: point.initial?.box,
    };
  }

  // Outside active keyframe range (tolerance 0.05s) -> effect is hidden outside tracked range (or clamped if requested)
  if (t < k[0].t - 0.05) {
    if (options?.clamp) {
      return {
        x: k[0].x,
        y: k[0].y,
        scale: k[0].scale ?? 1,
        rotation: k[0].rotation ?? 0,
        confidence: k[0].confidence ?? 1,
        box: k[0].box ?? point.initial?.box,
      };
    }
    return null;
  }
  if (t > k[k.length - 1].t + 0.05) {
    if (options?.clamp) {
      const last = k[k.length - 1];
      return {
        x: last.x,
        y: last.y,
        scale: last.scale ?? 1,
        rotation: last.rotation ?? 0,
        confidence: last.confidence ?? 1,
        box: last.box ?? point.initial?.box,
      };
    }
    return null;
  }

  // Close to first or last keyframe
  if (t <= k[0].t) {
    return {
      x: k[0].x,
      y: k[0].y,
      scale: k[0].scale ?? 1,
      rotation: k[0].rotation ?? 0,
      confidence: k[0].confidence ?? 1,
      box: k[0].box ?? point.initial?.box,
    };
  }
  if (t >= k[k.length - 1].t) {
    const last = k[k.length - 1];
    return {
      x: last.x,
      y: last.y,
      scale: last.scale ?? 1,
      rotation: last.rotation ?? 0,
      confidence: last.confidence ?? 1,
      box: last.box ?? point.initial?.box,
    };
  }

  // Smooth Catmull-Rom spline interpolation between keyframes
  const cr = (p0: number, p1: number, p2: number, p3: number, u: number): number => {
    return 0.5 * (
      2 * p1 +
      (-p0 + p2) * u +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u +
      (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u
    );
  };

  for (let i = 0; i < k.length - 1; i++) {
    const a = k[i];
    const b = k[i + 1];
    if (t >= a.t && t <= b.t) {
      // Check for untracked gaps between keyframes (e.g. tracking disjoint duration segments)
      const dt = b.t - a.t;
      if (dt > TRACKING_GAP_THRESHOLD_SEC) {
        if (t - a.t <= 0.1) return { x: a.x, y: a.y, scale: a.scale ?? 1, rotation: a.rotation ?? 0, confidence: a.confidence ?? 1, box: a.box ?? point.initial?.box };
        if (b.t - t <= 0.1) return { x: b.x, y: b.y, scale: b.scale ?? 1, rotation: b.rotation ?? 0, confidence: b.confidence ?? 1, box: b.box ?? point.initial?.box };
        return null; // inside untracked gap
      }

      const u = Math.max(0, Math.min(1, (t - a.t) / Math.max(1e-4, dt)));

      const prev = i > 0 ? k[i - 1] : { ...a, x: 2 * a.x - b.x, y: 2 * a.y - b.y, scale: a.scale, rotation: a.rotation };
      const next = i + 2 < k.length ? k[i + 2] : { ...b, x: 2 * b.x - a.x, y: 2 * b.y - a.y, scale: b.scale, rotation: b.rotation };

      const interpX = cr(prev.x, a.x, b.x, next.x, u);
      const interpY = cr(prev.y, a.y, b.y, next.y, u);
      const interpScale = Math.max(0.1, cr(prev.scale ?? 1, a.scale ?? 1, b.scale ?? 1, next.scale ?? 1, u));
      const interpRot = cr(prev.rotation ?? 0, a.rotation ?? 0, b.rotation ?? 0, next.rotation ?? 0, u);

      const boxW = a.box && b.box
        ? Math.max(0.01, cr(prev.box?.w ?? a.box.w, a.box.w, b.box.w, next.box?.w ?? b.box.w, u))
        : (a.box?.w ?? b.box?.w ?? point.initial?.box?.w ?? 0.14);
      const boxH = a.box && b.box
        ? Math.max(0.01, cr(prev.box?.h ?? a.box.h, a.box.h, b.box.h, next.box?.h ?? b.box.h, u))
        : (a.box?.h ?? b.box?.h ?? point.initial?.box?.h ?? 0.14);

      return {
        x: Math.max(0, Math.min(1, interpX)),
        y: Math.max(0, Math.min(1, interpY)),
        scale: Math.round(interpScale * 1000) / 1000,
        rotation: Math.round(interpRot * 10) / 10,
        confidence: Math.min(a.confidence ?? 1, b.confidence ?? 1),
        box: { w: boxW, h: boxH },
      };
    }
  }

  return null;
}
