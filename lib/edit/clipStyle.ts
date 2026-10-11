import type { AnyClip, ClipMask, ColorAdjust, Transform } from "./doc";

export type CopiedStyle = {
  sourceType: string;
  transform?: {
    fit?: "fit" | "fill";
    scale?: number;
    scaleX?: number;
    scaleY?: number;
    rotation?: number;
    flipX?: boolean;
    flipY?: boolean;
    skewX?: number;
    skewY?: number;
    corners?: Transform["corners"];
    pivot?: Transform["pivot"];
    crop?: Transform["crop"];
  };
  opacity?: number;
  blendMode?: string;
  color?: ColorAdjust;
  mask?: ClipMask;
  fill?: string;
};

/**
 * Extracts visual styling and shape transformations from a clip
 * (excluding position x and y, and timeline timing in/out).
 */
export function extractClipStyle(clip: AnyClip): CopiedStyle {
  const style: CopiedStyle = { sourceType: clip.type };

  if ("transform" in clip && clip.transform) {
    const t = clip.transform;
    style.transform = {
      fit: t.fit,
      scale: t.scale,
      scaleX: t.scaleX,
      scaleY: t.scaleY,
      rotation: t.rotation,
      flipX: t.flipX,
      flipY: t.flipY,
      skewX: t.skewX,
      skewY: t.skewY,
      corners: t.corners ? { ...t.corners } : undefined,
      pivot: t.pivot ? { ...t.pivot } : undefined,
      crop: t.crop ? { ...t.crop } : undefined,
    };
  }

  if ("opacity" in clip && typeof clip.opacity === "number") {
    style.opacity = clip.opacity;
  }

  if ("blendMode" in clip && clip.blendMode) {
    style.blendMode = clip.blendMode as string;
  }

  if ("color" in clip && clip.color) {
    style.color = { ...clip.color };
  }

  if ("mask" in clip && clip.mask) {
    style.mask = { ...clip.mask };
  }

  if ("fill" in clip && (clip as any).fill) {
    style.fill = (clip as any).fill;
  }

  return style;
}

/**
 * Constructs a patch for targetClip that applies copiedStyle while preserving
 * the target clip's current position (x, y) and timing.
 */
export function applyClipStyle(targetClip: AnyClip, style: CopiedStyle): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const t = targetClip.type;
  const isVisual = t === "video" || t === "image" || t === "element" || t === "text";
  const hasLooks = t === "video" || t === "image";
  const hasMask = t === "video" || t === "image" || t === "element";

  if (style.transform && isVisual && "transform" in targetClip && targetClip.transform) {
    patch.transform = {
      ...targetClip.transform,
      ...style.transform,
      x: targetClip.transform.x,
      y: targetClip.transform.y,
    };
  }

  if (style.opacity !== undefined && isVisual) {
    patch.opacity = style.opacity;
  }

  if (style.blendMode !== undefined && isVisual) {
    patch.blendMode = style.blendMode;
  }

  if (style.color !== undefined && hasLooks) {
    patch.color = { ...style.color };
  }

  if (style.mask !== undefined && hasMask) {
    patch.mask = { ...style.mask };
  }

  if (style.fill !== undefined && t === "blank") {
    patch.fill = style.fill;
  }

  return patch;
}
