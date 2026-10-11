import type {
  Keyframe,
  Transform,
  ElementClip,
  TimelineDoc,
  VideoClip,
} from "@/lib/edit/doc";
import { mainStarts, mainTrack } from "@/lib/edit/doc";
import type { MotionClip } from "@/lib/edit/keyframes";
import {
  trackingAt,
  type BlurAttachment,
  type ClipAttachment,
  type TrackingPoint,
} from "./types";

/**
 * Finds if a clip on the timeline is attached to any TrackingPoint on any video clip.
 */
export function findTrackingAttachmentForClip(
  doc: TimelineDoc,
  clipId: string,
): {
  point: TrackingPoint;
  attachment: ClipAttachment;
  videoClip: VideoClip;
  videoStart: number;
} | null {
  for (const track of doc.tracks) {
    for (const c of track.clips) {
      if (c.type === "video" && c.tracking?.points) {
        const vStart =
          track.kind === "main"
            ? mainStarts(mainTrack(doc).clips)[mainTrack(doc).clips.indexOf(c)]
            : "start" in c &&
                typeof (c as { start?: unknown }).start === "number"
              ? (c as { start: number }).start
              : 0;
        for (const pt of c.tracking.points) {
          const att = pt.attachments?.find(
            (a) => a.type === "clip" && a.clipId === clipId,
          ) as ClipAttachment | undefined;
          if (att) {
            return {
              point: pt,
              attachment: att,
              videoClip: c,
              videoStart: vStart,
            };
          }
        }
      }
    }
  }
  return null;
}

/**
 * Converts normalized tracking coordinates (0..1 where 0.5 is canvas center)
 * into VDO's canvas transform coordinates (-0.5..0.5 where 0 is center, -0.5 is left edge, +0.5 is right edge).
 */
export function trackCoordToTransform(
  trackX: number,
  trackY: number,
  offset: { x?: number; y?: number } = {},
): { x: number; y: number } {
  // 0.5 in track -> 0 in transform; 0 in track -> -0.5 in transform; 1 in track -> +0.5 in transform
  const tx = trackX - 0.5 + (offset.x ?? 0);
  const ty = trackY - 0.5 + (offset.y ?? 0);
  return {
    x: Math.round(tx * 10000) / 10000,
    y: Math.round(ty * 10000) / 10000,
  };
}

/**
 * Evaluates the effective transform for an attached clip at timeline time `t`.
 */
export function evaluateAttachmentTransform(
  point: TrackingPoint,
  attachment: ClipAttachment,
  clip: MotionClip,
  t: number,
): Transform {
  const track = trackingAt(point, t);
  if (!track) return clip.transform;

  const off = attachment.offset;
  const pos = trackCoordToTransform(track.x, track.y, off);

  const baseScale = clip.transform.scale || 1;
  const baseRot = clip.transform.rotation || 0;

  return {
    ...clip.transform,
    x: pos.x,
    y: pos.y,
    scale: Math.max(
      0.05,
      Math.min(5, baseScale * (track.scale || 1) * (off.scale || 1)),
    ),
    rotation:
      Math.round((baseRot + (track.rotation || 0) + (off.rotation || 0)) * 10) /
      10,
  };
}

/**
 * Bakes dynamic tracking keyframes into standard timeline keyframes on a clip.
 */
export function bakeTrackingToKeyframes(
  point: TrackingPoint,
  attachment: ClipAttachment,
  clip: MotionClip,
  clipStart: number,
  fps = 30,
): Keyframe[] {
  if (!point.keyframes || !point.keyframes.length) return [];

  const out: Keyframe[] = [];
  const off = attachment.offset;
  const baseScale = clip.transform.scale || 1;
  const baseRot = clip.transform.rotation || 0;

  // Thin out keyframes if there are too many (MAX_KEYFRAMES is usually 40 in basic inspector,
  // but for tracking we can store optimal motion keys)
  const maxKeys = 120;
  const step = Math.max(1, Math.ceil(point.keyframes.length / maxKeys));

  for (let i = 0; i < point.keyframes.length; i += step) {
    const tk = point.keyframes[i];
    const localT = Math.round((tk.t - clipStart) * fps) / fps;
    const pos = trackCoordToTransform(tk.x, tk.y, off);

    out.push({
      t: localT,
      x: pos.x,
      y: pos.y,
      scale: Math.max(
        0.05,
        Math.min(5, baseScale * (tk.scale || 1) * (off.scale || 1)),
      ),
      rotation:
        Math.round((baseRot + (tk.rotation || 0) + (off.rotation || 0)) * 10) /
        10,
      opacity: clip.opacity ?? 1,
      ease: "linear",
    });
  }

  return out;
}

/**
 * Creates a Blur Element clip to be placed on an overlay track, linked to the tracking point.
 */
export function createTrackedBlurClip(
  id: string,
  point: TrackingPoint,
  blurConfig: BlurAttachment,
  start: number,
  duration: number,
): ElementClip & { start: number } {
  const initCoord = trackCoordToTransform(
    point.initial.x,
    point.initial.y,
    blurConfig.offset,
  );

  return {
    id,
    type: "element",
    duration,
    start,
    anim: { in: "none", out: "none" },
    fadeIn: 0,
    fadeOut: 0,
    transform: {
      fit: "fit",
      x: initCoord.x,
      y: initCoord.y,
      scale: Math.max(0.1, (blurConfig.size?.w ?? 0.12) * 2),
      rotation: 0,
    },
    el: {
      kind: "rect",
      preset: `Blur (${point.name})`,
      aspect: 1,
      fill: "none",
      stroke: "none",
      strokeWidth: 0,
      shadow: false,
    },
  };
}
