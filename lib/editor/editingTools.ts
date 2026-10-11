import { clipLength, clipStart, findClip, mainStarts, MIN_CLIP_FRAMES, type AnyClip, type TimelineDoc, type Track } from "../edit/doc";
import { keyIndexAt, type MotionClip } from "../edit/keyframes";
import { elementName } from "../elements/catalog";

export const MIN_SPLIT_EDGE = 0.05;

export type EditingTarget = { track: Track; clip: AnyClip; index: number };

export type EditingToolsState = {
  /** Currently selected clip (null if none selected) */
  selected: EditingTarget | null;
  selectedStart: number;
  selectedLength: number;
  isLocked: boolean;
  /** What Split / Trim / Freeze act on (selected clip if under playhead with clearance, else Video 1 clip under playhead) */
  target: EditingTarget | null;
  /** Tool availability flags - synchronized between Timeline toolbar and Edit menubar */
  canSplit: boolean;
  canTrim: boolean;
  canTrimStart: boolean;
  canTrimEnd: boolean;
  canDuplicate: boolean;
  canDelete: boolean;
  canCrop: boolean;
  canSpeed: boolean;
  canReverse: boolean;
  canFreeze: boolean;
  canMask: boolean;
  canSilences: boolean;
  canDetachAudio: boolean;
  canAttachAudio: boolean;
  isAudioDetached: boolean;
  canKeyframe: boolean;
  /** Whether there is an active keyframe at the current playhead frame */
  keyframeHere: boolean;
  /** Descriptive label and kind for the header in the Edit panel */
  targetInfo: { name: string; kind: string } | null;
};

export function clipName(c: AnyClip, media: Record<string, { fileName?: string }> = {}): string {
  if (c.type === "text") return c.text.split("\n")[0].slice(0, 40) || "Text";
  if (c.type === "element") return elementName(c);
  if (c.type === "blank") return "Blank scene";
  if (c.type === "image") return media[c.mediaId]?.fileName ?? "Picture";
  if (c.type === "video") return media[c.mediaId]?.fileName ?? "Video clip";
  if (c.type === "audio") return media[c.mediaId]?.fileName ?? "Sound clip";
  return "Clip";
}

export function clipKind(c: AnyClip): string {
  const map: Record<string, string> = {
    video: "Video",
    image: "Picture",
    text: "Text",
    element: "Element",
    blank: "Blank",
    audio: "Sound",
  };
  return map[c.type] ?? "Clip";
}

/**
 * Single source of truth for tool availability across the Timeline toolbar and the Left Edit menubar.
 * Guarantees that if a tool is disabled on the timeline, it is also disabled on the left menubar.
 */
export function getEditingTools(
  doc: TimelineDoc,
  selectedId: string | null,
  t: number,
  media: Record<string, { hasAudio?: boolean; fileName?: string }> = {},
  fps = doc.canvas?.fps ?? 30,
): EditingToolsState {
  const sel = selectedId ? findClip(doc, selectedId) : null;
  const isLocked = !!sel?.track.locked;

  let selStart = 0;
  if (sel) {
    if (sel.track.kind === "main") {
      selStart = mainStarts(sel.track.clips)[sel.index] ?? 0;
    } else {
      selStart = (sel.clip as AnyClip & { start?: number }).start ?? 0;
    }
  }
  const minEdge = MIN_CLIP_FRAMES / (fps || 30);
  const selLen = sel ? clipLength(sel.clip) : 0;
  const underPlayhead = !!sel && t > selStart + minEdge && t < selStart + selLen - minEdge;

  // what Split / Trim / Freeze act on: the selected clip if the playhead is on it, else the Video 1 clip under the playhead
  const target: EditingTarget | null = (() => {
    if (sel && underPlayhead && !isLocked) return sel;
    const main = doc.tracks.find((tr) => tr.kind === "main");
    if (!main || main.locked) return null;
    const starts = mainStarts(main.clips);
    const i = main.clips.findIndex((c, k) => t > starts[k] + minEdge && t < starts[k] + clipLength(c) - minEdge);
    return i >= 0 ? { track: main, clip: main.clips[i], index: i } : null;
  })();

  const canSplit = target !== null;
  const canTrim = target !== null;
  const canTrimStart = target !== null;
  const canTrimEnd = target !== null;
  const canDuplicate = sel !== null && !isLocked;
  const canDelete = sel !== null && !isLocked;
  const canCrop = sel !== null && (sel.clip.type === "video" || sel.clip.type === "image") && !isLocked;
  const canSpeed = sel !== null && sel.clip.type === "video" && !isLocked;
  const canReverse = sel !== null && sel.clip.type === "video" && !isLocked;
  const canFreeze = target !== null && target.clip.type === "video" && target.track.kind === "main";
  const canMask = sel !== null && (sel.clip.type === "video" || sel.clip.type === "image") && !isLocked;
  const canSilences = sel !== null && (sel.clip.type === "video" || sel.clip.type === "audio") && !isLocked && !!media[sel.clip.mediaId]?.hasAudio;
  let canDetachAudio = false;
  let canAttachAudio = false;
  let isAudioDetached = false;

  if (sel !== null && !isLocked) {
    if (sel.clip.type === "video") {
      const hasAudio = !!media[sel.clip.mediaId]?.hasAudio;
      if (hasAudio) {
        const vStart = selStart;
        const vc = sel.clip as any;
        const detachedClip = doc.tracks
          .filter((tr) => tr.kind === "audio")
          .flatMap((tr) => tr.clips as any[])
          .find((a) => {
            if (a.type !== "audio") return false;
            if (vc.detachedAudioId && a.id === vc.detachedAudioId) return true;
            if ((a as any).detachedFromClipId && (a as any).detachedFromClipId === vc.id) return true;
            return a.mediaId === vc.mediaId && Math.abs((a as any).start - vStart) < 0.15;
          });

        if (detachedClip) {
          canAttachAudio = true;
          isAudioDetached = true;
          canDetachAudio = false;
        } else {
          canDetachAudio = true;
          canAttachAudio = false;
          isAudioDetached = false;
        }
      }
    } else if (sel.clip.type === "audio") {
      const aStart = selStart;
      const ac = sel.clip as any;
      const parentVideo = doc.tracks
        .filter((tr) => tr.kind === "main" || tr.kind === "overlay")
        .flatMap((tr) => tr.clips as any[])
        .find((v: any) => {
          if (v.type !== "video") return false;
          if (ac.detachedFromClipId && ac.detachedFromClipId === v.id) return true;
          if (v.detachedAudioId && v.detachedAudioId === ac.id) return true;
          return v.mediaId === ac.mediaId && Math.abs(clipStart(doc, v.id) - aStart) < 0.15;
        });

      if (parentVideo) {
        canAttachAudio = true;
        isAudioDetached = true;
        canDetachAudio = false;
      }
    }
  }

  const kc = sel && sel.clip.type !== "audio" && sel.clip.type !== "blank" && !isLocked ? (sel.clip as MotionClip) : null;
  const keyframeOn = !!kc && t >= selStart - 1e-6 && t <= selStart + selLen + 1e-6;
  const canKeyframe = !!kc && keyframeOn;
  const keyframeHere = kc && keyframeOn ? keyIndexAt(kc, t - selStart, fps) >= 0 : false;

  const targetInfo = sel
    ? { name: clipName(sel.clip, media), kind: clipKind(sel.clip) }
    : target
      ? { name: clipName(target.clip, media), kind: `At playhead (${clipKind(target.clip)})` }
      : null;

  return {
    selected: sel,
    selectedStart: selStart,
    selectedLength: selLen,
    isLocked,
    target,
    canSplit,
    canTrim,
    canTrimStart,
    canTrimEnd,
    canDuplicate,
    canDelete,
    canCrop,
    canSpeed,
    canReverse,
    canFreeze,
    canMask,
    canSilences,
    canDetachAudio,
    canAttachAudio,
    isAudioDetached,
    canKeyframe,
    keyframeHere,
    targetInfo,
  };
}
