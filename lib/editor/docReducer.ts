import { findClip, mainTrack, type Canvas, type ElementClip, type MarkerColor, type MediaLite, type TextClip, type TimelineDoc, type TimelineMarker, type Track, type Transform, type VideoClip, type Watermark } from "../edit/doc";
import { addBlank, addCaptionTrack, addElement, addMarker, addMedia, addText, addTrack, closeAllGaps, deleteClip, deleteClips, deleteMarker, detachAudio, attachAudio, toggleAudioDetach, duplicateClip, editClipAt, keyframeOp, moveClip, removeRangesInClip, removeTrack, reorderTracks, setClip, setTrack, splitClip, trimClip, updateMarker, pasteClip, type AddOptions, type CaptionIn, type CopiedClip, type KeyframeOp } from "../edit/docEdit";
import { activeAiOp, blackOp, keyOp, sanitizeOutput, type OutputSettings } from "../edit/spec";
import type { Range } from "../edit/timeline";
import { cutTimelineRanges, removeCaptionWords, type CaptionWordRef } from "../edit/transcriptCut";
import { studioReducer, type KeySource, type StudioAction, type StudioState } from "./studioReducer";

/**
 * Editor state for the whole timeline. Undo/redo wraps this (lib/editor/history).
 * `media` holds what the editor knows about every upload on the timeline
 * (sizes and lengths bound the trims; detected keys seed new clips).
 */
export type DocState = { doc: TimelineDoc; media: Record<string, MediaLite> };

export type DocAction =
  /** A Background Removal / output action for one video clip (the existing single-clip reducer). */
  | { type: "clip"; clipId: string; action: StudioAction }
  | { type: "output"; patch: Partial<OutputSettings> }
  | { type: "addMedia"; media: MediaLite; options?: AddOptions }
  | { type: "addText"; clip: Omit<TextClip, "id">; at: number; id?: string }
  | { type: "addElement"; clip: Omit<ElementClip, "id">; at: number; id?: string }
  | { type: "addBlank"; index: number; fill?: string; duration?: number; id?: string }
  /** subtitles on new tracks of their own (one undo step); `hide`: tracks to hide (the original language) */
  | { type: "addCaptions"; name: string; captions: CaptionIn[]; template: Omit<TextClip, "id" | "text" | "duration">; hide?: string[] }
  | { type: "split"; clipId: string; t: number }
  | { type: "deleteClip"; clipId: string }
  | { type: "deleteClips"; clipIds: string[] }
  | { type: "closeAllGaps" }
  | { type: "trim"; clipId: string; edge: "in" | "out"; to: number }
  | { type: "move"; clipId: string; to: { trackId: string; start?: number; index?: number } }
  | { type: "duplicate"; clipId: string }
  /** ⌘V: a copied clip at the playhead; `media`: its upload, when it came from another project */
  | { type: "paste"; copied: CopiedClip; at: number; id?: string; media?: MediaLite }
  | { type: "removeRanges"; clipId: string; ranges: Range[] }
  /** Timeline seconds cut from the video under them, other tracks ripple (transcript editing). */
  | { type: "cutTimelineRanges"; ranges: Range[]; dropWords?: CaptionWordRef[] }
  | { type: "addTrack"; kind: "overlay" | "audio" }
  | { type: "removeTrack"; trackId: string }
  | { type: "reorderTrack"; sourceId: string; targetId: string; position: "before" | "after" }
  | { type: "setTrack"; trackId: string; patch: Partial<{ locked: boolean; hidden: boolean; muted: boolean; name: string }> }
  | { type: "setClip"; clipId: string; patch: Record<string, unknown> }
  /** place, size, angle, opacity at the playhead `t` (with keyframes: the keyframe there) */
  | { type: "editClipAt"; clipId: string; t: number; transform?: Partial<Transform>; opacity?: number }
  | { type: "keyframe"; clipId: string; t: number; op: KeyframeOp }
  | { type: "setCanvas"; patch: Partial<Canvas> & { applyToAllTracks?: boolean } }
  /** your logo on the whole video (undefined: none); media: the logo picture, so the preview knows its size */
  | { type: "setWatermark"; watermark: Watermark | undefined; media?: MediaLite }
  | { type: "detachAudio"; clipId: string; media?: Record<string, MediaLite> | ((id: string) => MediaLite | null) }
  | { type: "attachAudio"; clipId: string }
  | { type: "toggleAudioDetach"; clipId: string; media?: Record<string, MediaLite> | ((id: string) => MediaLite | null) }
  | { type: "addMarker"; t: number; label?: string; color?: MarkerColor }
  | { type: "deleteMarker"; markerId: string }
  | { type: "updateMarker"; markerId: string; patch: Partial<TimelineMarker> }
  /** a saved version back on the timeline (one undo step); media: its uploads */
  | { type: "replaceDoc"; doc: TimelineDoc; media: Record<string, MediaLite> };

const limitsOfMedia = (m: MediaLite | undefined) => (m ? { width: m.width, fps: m.fps, duration: m.duration } : undefined);

/** How the Background Removal card sees one video clip (the shape the single-clip reducer works on). */
export function clipStudioState(s: DocState, clipId: string): StudioState | null {
  const f = findClip(s.doc, clipId);
  if (!f || f.clip.type !== "video") return null;
  const clip = f.clip as VideoClip;
  const m = s.media[clip.mediaId];
  const spec = { version: 1 as const, ops: clip.ops, output: s.doc.output };
  const key = keyOp(spec)?.params.keyColor.toUpperCase();
  const derivedSource: KeySource = m?.suggestedKey && key === m.suggestedKey.toUpperCase() ? "detected" : "picked";
  return {
    // (a new black-background clip has its black removal ready but off: it still shows Black background)
    method: clip.ui?.method ?? (activeAiOp(spec) ? "ai" : blackOp(spec) && (blackOp(spec)!.enabled || !keyOp(spec)?.enabled) ? "black" : "color"),
    spec,
    keySource: clip.ui?.keySource ?? derivedSource,
    detectedKey: m?.suggestedKey ?? null,
    limits: limitsOfMedia(m),
  };
}

/** The first video clip on the main track (what the panels show when nothing is selected). */
export function defaultVideoClip(doc: TimelineDoc): VideoClip | null {
  return (mainTrack(doc).clips.find((c) => c.type === "video") as VideoClip | undefined) ?? null;
}

// the single-clip reducer's own timeline actions are replaced by the doc-level ones
const TIMELINE_ACTIONS = new Set(["split", "deleteClip", "trimClip", "trimToPlayhead", "removeRanges"]);

export function docReducer(s: DocState, a: DocAction): DocState {
  const media = (id: string) => s.media[id] ?? null;
  const d = s.doc;
  switch (a.type) {
    case "clip": {
      if (TIMELINE_ACTIONS.has(a.action.type)) return s;
      const cs = clipStudioState(s, a.clipId);
      if (!cs) return s;
      const next = studioReducer(cs, a.action);
      if (next === cs) return s;
      const f = findClip(d, a.clipId)!;
      const clip = { ...(f.clip as VideoClip), ops: next.spec.ops, ui: { method: next.method, keySource: next.keySource } };
      const doc = { ...setClip(d, a.clipId, clip), output: next.spec.output };
      return { ...s, doc };
    }
    case "output":
      return { ...s, doc: { ...d, output: sanitizeOutput({ ...d.output, ...a.patch }) } };
    case "addMedia": {
      const r = addMedia(d, a.media, a.options);
      return { doc: r.doc, media: { ...s.media, [a.media.id]: a.media } };
    }
    case "addText":
      return { ...s, doc: addText(d, a.clip, a.at, a.id).doc };
    case "addElement":
      return { ...s, doc: addElement(d, a.clip, a.at, a.id).doc };
    case "addBlank":
      return { ...s, doc: addBlank(d, a.index, { fill: a.fill, duration: a.duration, id: a.id }).doc };
    case "addCaptions":
      return { ...s, doc: addCaptionTrack(d, a.name, a.captions, a.template, a.hide).doc };
    case "split":
      return { ...s, doc: splitClip(d, a.clipId, a.t).doc };
    case "deleteClip":
      return { ...s, doc: deleteClip(d, a.clipId) };
    case "deleteClips":
      return { ...s, doc: deleteClips(d, a.clipIds) };
    case "closeAllGaps":
      return { ...s, doc: closeAllGaps(d) };
    case "trim":
      return { ...s, doc: trimClip(d, a.clipId, a.edge, a.to, media) };
    case "move":
      return { ...s, doc: moveClip(d, a.clipId, a.to) };
    case "duplicate":
      return { ...s, doc: duplicateClip(d, a.clipId).doc };
    case "paste": {
      const media = a.media && !s.media[a.media.id] ? { ...s.media, [a.media.id]: a.media } : s.media;
      return { ...s, media, doc: pasteClip(d, a.copied, a.at, a.id).doc };
    }
    case "removeRanges":
      return { ...s, doc: removeRangesInClip(d, a.clipId, a.ranges) };
    case "cutTimelineRanges":
      return { ...s, doc: cutTimelineRanges(removeCaptionWords(d, a.dropWords ?? []), a.ranges) };
    case "addTrack":
      return { ...s, doc: addTrack(d, a.kind) };
    case "removeTrack":
      return { ...s, doc: removeTrack(d, a.trackId) };
    case "reorderTrack": {
      const doc = reorderTracks(d, a.sourceId, a.targetId, a.position);
      return doc === d ? s : { ...s, doc };
    }
    case "setTrack": {
      const doc = setTrack(d, a.trackId, a.patch);
      return doc === d ? s : { ...s, doc };
    }
    case "setClip": {
      const doc = setClip(d, a.clipId, a.patch);
      return doc === d ? s : { ...s, doc };
    }
    case "editClipAt": {
      const doc = editClipAt(d, a.clipId, a.t, { ...(a.transform ? { transform: a.transform } : {}), ...("opacity" in a ? { opacity: a.opacity } : {}) });
      return doc === d ? s : { ...s, doc };
    }
    case "keyframe": {
      const doc = keyframeOp(d, a.clipId, a.t, a.op);
      return doc === d ? s : { ...s, doc };
    }
    case "setCanvas": {
      const c = { ...d.canvas, ...a.patch };
      // a backdrop covers everything: a transparent canvas becomes solid
      if (a.patch.backdrop && c.background === "transparent") c.background = "#000000";
      if ("backdrop" in a.patch && !a.patch.backdrop) delete c.backdrop;
      const even = (v: number) => Math.max(64, Math.min(3840, Math.round(v / 2) * 2));
      const width = even(c.width);
      const height = even(c.height);
      const isVertical = height > width;
      const oldIsVertical = d.canvas.height > d.canvas.width;

      let targetFit: "fit" | "fill" | undefined = a.patch.fit;
      if (!targetFit && !oldIsVertical && isVertical) {
        targetFit = "fill";
        c.fit = "fill";
      } else if (a.patch.fit) {
        c.fit = a.patch.fit;
      }

      let tracks = d.tracks;
      if (targetFit) {
        const applyToAll = a.patch.applyToAllTracks;
        tracks = tracks.map((tr) => {
          if (tr.kind === "main" || (applyToAll && tr.kind === "overlay")) {
            const clips = tr.clips.map((clip) => {
              if (clip.type === "video" || clip.type === "image") {
                return {
                  ...clip,
                  transform: { ...clip.transform, fit: targetFit },
                };
              }
              return clip;
            });
            return { ...tr, clips } as Track;
          }
          return tr;
        });
      }

      return {
        ...s,
        doc: {
          ...d,
          tracks,
          canvas: {
            ...c,
            width,
            height,
            fps: Math.min(60, Math.max(1, Math.round(c.fps))),
          },
        },
      };
    }
    case "replaceDoc":
      return { doc: a.doc, media: { ...s.media, ...a.media } };
    case "setWatermark": {
      const media = a.media ? { ...s.media, [a.media.id]: a.media } : s.media;
      if (!a.watermark) {
        const { watermark: _w, ...rest } = d;
        void _w;
        return { ...s, media, doc: rest };
      }
      return { ...s, media, doc: { ...d, watermark: a.watermark } };
    }
    case "detachAudio": {
      const mediaMap = a.media ? (typeof a.media === "function" ? a.media : (id: string) => (a.media as Record<string, MediaLite>)[id] ?? null) : media;
      const res = detachAudio(d, a.clipId, mediaMap);
      return { ...s, doc: res.doc };
    }
    case "attachAudio": {
      const res = attachAudio(d, a.clipId);
      return { ...s, doc: res.doc };
    }
    case "toggleAudioDetach": {
      const mediaMap = a.media ? (typeof a.media === "function" ? a.media : (id: string) => (a.media as Record<string, MediaLite>)[id] ?? null) : media;
      const res = toggleAudioDetach(d, a.clipId, mediaMap);
      return { ...s, doc: res.doc };
    }
    case "addMarker":
      return { ...s, doc: addMarker(d, a.t, a.label, a.color).doc };
    case "deleteMarker":
      return { ...s, doc: deleteMarker(d, a.markerId) };
    case "updateMarker":
      return { ...s, doc: updateMarker(d, a.markerId, a.patch) };
  }
}
