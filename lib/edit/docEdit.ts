import {
  audioClipOf,
  blankClipOf,
  clipLength,
  clipStart,
  DEFAULT_TRANSFORM,
  findClip,
  generatingAudioClipOf,
  generatingBlankClipOf,
  imageClipOf,
  isReversed,
  mainStarts,
  mainTrack,
  newId,
  speedOf,
  videoClipOf,
  type AnyClip,
  type AudioPlaced,
  type Backdrop,
  type ClipGeneration,
  type MainClip,
  type MarkerColor,
  type MediaLite,
  type OverlayClip,
  type TimelineDoc,
  type TimelineMarker,
  type Track,
  type Transform,
} from "./doc";
import { MIN_SEGMENT_FRAMES, type Range } from "./timeline";
import { editAt, hasKeys, keysForPart, keysOf, moveKey, pruneKeys, removeKey, scaleKeyTimes, setKeyEase, toggleKey, type Ease, type MotionClip } from "./keyframes";
import { DEFAULT_SPEC, type OpInstance } from "./spec";

/** A new video clip without settings: Color Key ready but switched off (a normal clip, nothing removed). */
const plainOps = (): OpInstance[] => DEFAULT_SPEC.ops.map((o) => ({ ...o, enabled: false }));

/**
 * Timeline editing, as pure functions (doc in → doc out). The reducer wraps
 * these for undo/redo; the tests call them directly.
 */

const EPS = 1e-6;
const withTracks = (doc: TimelineDoc, tracks: Track[]): TimelineDoc => ({ ...doc, tracks });
const mapTrack = (doc: TimelineDoc, id: string, fn: (t: Track) => Track) => withTracks(doc, doc.tracks.map((t) => (t.id === id ? fn(t) : t)));
const minLen = (fps: number) => MIN_SEGMENT_FRAMES / Math.max(1, fps);
const snap = (t: number, fps: number) => Math.round(t * fps) / fps;

type Placed = OverlayClip | AudioPlaced;
const overlaps = (clips: Placed[], start: number, len: number, except?: string) => clips.some((c) => c.id !== except && start < c.start + clipLength(c) - EPS && start + len > c.start + EPS);

/** A subtitle track ("Subtitles", "Subtitles (Hindi)"): the subtitle tools rewrite it (lib/subtitles/sources). */
const isSubtitleTrack = (t: Track) => t.kind === "overlay" && (t.name ?? "").startsWith("Subtitles");

function nextTrackName(doc: TimelineDoc, kind: "overlay" | "audio"): string {
  const existingTracks = doc.tracks.filter((t) => t.kind === kind);
  let maxNum = existingTracks.length;
  for (const t of existingTracks) {
    const match = (t.name ?? "").match(kind === "overlay" ? /^Overlay (\d+)$/ : /^Audio (\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  return kind === "overlay" ? `Overlay ${maxNum + 1}` : `Audio ${maxNum + 1}`;
}

/**
 * A free track of this kind at [start, start+len), or a new one (added above
 * the others of its kind). `fresh`: a new text or element, which never goes on
 * a hidden track (you wouldn't see it) or a subtitle track.
 */
function trackFor(doc: TimelineDoc, kind: "overlay" | "audio", start: number, len: number, prefer?: string, except?: string, fresh = false): { doc: TimelineDoc; trackId: string } {
  const candidates = doc.tracks.filter((t) => t.kind === kind && !t.locked && !(fresh && t.kind === "overlay" && (t.hidden || isSubtitleTrack(t)))) as Extract<Track, { kind: "overlay" | "audio" }>[];
  const order = prefer ? [...candidates.filter((t) => t.id === prefer), ...candidates.filter((t) => t.id !== prefer)] : candidates;
  const free = order.find((t) => !overlaps(t.clips as Placed[], start, len, except));
  if (free) return { doc, trackId: free.id };
  const id = newId(doc, kind === "overlay" ? "v" : "a");
  const name = nextTrackName(doc, kind);
  const track: Track = kind === "overlay" ? { id, kind: "overlay", name, locked: false, hidden: false, muted: false, clips: [] } : { id, kind: "audio", name, locked: false, muted: false, clips: [] };
  // overlays stack upwards (new one on top); audio tracks go to the bottom
  const tracks = kind === "overlay" ? [track, ...doc.tracks] : [...doc.tracks, track];
  return { doc: withTracks(doc, tracks), trackId: id };
}

export type AddOptions = {
  at?: number;
  trackId?: string;
  ops?: OpInstance[];
  index?: number;
  /** id for the new clip (else one is made) */
  id?: string;
  /** put a video on a free overlay track (picture-in-picture) */
  overlay?: boolean;
  /** a picture's length in seconds (else IMAGE_DEFAULT_SECONDS); the free track is found for all of it */
  duration?: number;
};

const pictureLength = (d?: number) => (d && Number.isFinite(d) ? Math.min(3600, Math.max(0.1, d)) : undefined);

/**
 * Add an upload to the timeline. Videos go on the main track (at the end, or
 * at `index`); pictures and sound are placed at `at` on a free overlay/audio
 * track. A video dropped on an overlay track becomes a picture-in-picture clip.
 */
export function addMedia(doc: TimelineDoc, m: MediaLite, o: AddOptions = {}): { doc: TimelineDoc; clipId: string } {
  const id = o.id && !findClip(doc, o.id) && /^[\w-]{1,40}$/.test(o.id) ? o.id : newId(doc);
  const target = o.trackId ? doc.tracks.find((t) => t.id === o.trackId) : undefined;
  const at = Math.max(0, o.at ?? 0);
  if (m.kind === "audio") {
    const clip = audioClipOf(id, m, at);
    const r = trackFor(doc, "audio", at, clipLength(clip), target?.kind === "audio" ? target.id : undefined);
    return { doc: mapTrack(r.doc, r.trackId, (t) => ({ ...t, clips: [...(t.clips as AudioPlaced[]), clip].sort((a, b) => a.start - b.start) }) as Track), clipId: id };
  }
  const toOverlay = o.overlay || target?.kind === "overlay" || (m.kind === "image" && target?.kind !== "main");
  const defaultFit = doc.canvas.fit ?? (doc.canvas.height > doc.canvas.width ? "fill" : "fit");
  if (toOverlay) {
    const base = m.kind === "video" ? videoClipOf(id, m, o.ops ?? plainOps()) : imageClipOf(id, m, pictureLength(o.duration));
    const clip = { ...base, start: at } as OverlayClip;
    const r = trackFor(doc, "overlay", at, clipLength(clip), target?.kind === "overlay" ? target.id : undefined);
    return { doc: mapTrack(r.doc, r.trackId, (t) => ({ ...t, clips: [...(t.clips as OverlayClip[]), clip].sort((a, b) => a.start - b.start) }) as Track), clipId: id };
  }
  const base: MainClip = m.kind === "video" ? videoClipOf(id, m, o.ops ?? plainOps()) : imageClipOf(id, m, pictureLength(o.duration));
  const clip: MainClip = defaultFit === "fill" ? { ...base, transform: { ...base.transform, fit: "fill" } } : base;
  const main = mainTrack(doc);
  const index = Math.min(Math.max(0, o.index ?? main.clips.length), main.clips.length);
  return { doc: mapTrack(doc, main.id, (t) => ({ ...t, clips: [...(t.clips as MainClip[]).slice(0, index), clip, ...(t.clips as MainClip[]).slice(index)] }) as Track), clipId: id };
}

/**
 * A blank scene on Video 1 at `index` (0 = at the start; the number of clips =
 * at the end): "before clip i" is i, "after clip i" is i + 1. A transition
 * into the clip at `index` stays with it (now from the blank).
 */
export function addBlank(doc: TimelineDoc, index: number, o: { fill?: string; duration?: number; id?: string; backdrop?: Backdrop } = {}): { doc: TimelineDoc; clipId: string } {
  const main = mainTrack(doc);
  const id = o.id && !findClip(doc, o.id) && /^[\w-]{1,40}$/.test(o.id) ? o.id : newId(doc, "b");
  const clip = blankClipOf(id, o.fill, pictureLength(o.duration), o.backdrop);
  const i = Math.min(Math.max(0, Math.round(index)), main.clips.length);
  return { doc: mapTrack(doc, main.id, (t) => ({ ...t, clips: [...(t.clips as MainClip[]).slice(0, i), clip, ...(t.clips as MainClip[]).slice(i)] }) as Track), clipId: id };
}

/**
 * Where something dropped on the timeline would land: a file from My Assets
 * (added like addMedia) or a clip being moved (like moveClip). The drop shadow
 * and the drop itself use this, so they always agree. `doc`: the timeline with
 * it in place (the other Video 1 clips make room); null: it can't go there.
 */
export function dropLanding(
  doc: TimelineDoc,
  what: { media: MediaLite } | { clipId: string },
  to: { trackId: string | null; at?: number; index?: number },
): { doc: TimelineDoc; clipId: string; trackId: string; start: number; length: number } | null {
  let next: TimelineDoc;
  let clipId: string;
  if ("clipId" in what) {
    if (!to.trackId) return null;
    next = moveClip(doc, what.clipId, { trackId: to.trackId, start: to.at, index: to.index });
    if (next === doc) return null;
    clipId = what.clipId;
  } else {
    const r = addMedia(doc, what.media, { at: to.at, trackId: to.trackId ?? undefined, index: to.index, id: "drop-shadow" });
    next = r.doc;
    clipId = r.clipId;
  }
  const f = findClip(next, clipId);
  if (!f) return null;
  const start = f.track.kind === "main" ? mainStarts(f.track.clips as MainClip[])[f.index] : (f.clip as Placed).start;
  return { doc: next, clipId, trackId: f.track.id, start, length: clipLength(f.clip as AnyClip) };
}

/** A new text or element at `at`, on a free overlay track that shows. */
function addDrawn(doc: TimelineDoc, clip: Omit<Extract<OverlayClip, { type: "text" | "element" }>, "id" | "start">, at: number, prefix: string, wantId?: string, preferTrackId?: string): { doc: TimelineDoc; clipId: string } {
  const id = wantId && !findClip(doc, wantId) ? wantId : newId(doc, prefix);
  const placed = { ...clip, id, start: Math.max(0, at) } as OverlayClip;
  const r = trackFor(doc, "overlay", placed.start, clipLength(placed), preferTrackId, undefined, true);
  return { doc: mapTrack(r.doc, r.trackId, (t) => ({ ...t, clips: [...(t.clips as OverlayClip[]), placed].sort((a, b) => a.start - b.start) }) as Track), clipId: id };
}

/** Add a text clip at `at` on a free overlay track (or preferred trackId). */
export function addText(doc: TimelineDoc, clip: Omit<Extract<OverlayClip, { type: "text" }>, "id" | "start">, at: number, wantId?: string, trackId?: string): { doc: TimelineDoc; clipId: string } {
  return addDrawn(doc, clip, at, "t", wantId, trackId);
}

/** Add an element (a shape, sticker, emoji, news graphic) at `at` on a free overlay track (or preferred trackId). */
export function addElement(doc: TimelineDoc, clip: Omit<Extract<OverlayClip, { type: "element" }>, "id" | "start">, at: number, wantId?: string, trackId?: string): { doc: TimelineDoc; clipId: string } {
  return addDrawn(doc, clip, at, "e", wantId, trackId);
}

/** Split a clip at timeline time t (on its track). Pictures and text split by duration. */
export function splitClip(doc: TimelineDoc, clipId: string, t: number): { doc: TimelineDoc; newId: string | null } {
  const f = findClip(doc, clipId);
  if (!f || f.track.locked) return { doc, newId: null };
  const start = f.track.kind === "main" ? mainStarts(f.track.clips)[f.index] : (f.clip as Placed).start;
  const len = clipLength(f.clip);
  const fps = doc.canvas.fps;
  const off = snap(t - start, fps);
  if (off < minLen(fps) - EPS || off > len - minLen(fps) + EPS) return { doc, newId: null };
  const id = newId(doc);
  const c = f.clip;
  let a: AnyClip;
  let b: AnyClip;
  if (c.type === "video" || c.type === "audio") {
    // source seconds (speed); a reversed clip's first part is the end of its source range
    const so = off * speedOf(c);
    if (isReversed(c)) {
      a = { ...c, in: c.out - so, fadeOut: 0 } as AnyClip;
      b = { ...c, id, out: c.out - so, fadeIn: 0 } as AnyClip;
    } else {
      a = { ...c, out: c.in + so, fadeOut: 0 } as AnyClip;
      b = { ...c, id, in: c.in + so, fadeIn: 0 } as AnyClip;
    }
  } else {
    a = { ...c, duration: off, fadeOut: 0 } as AnyClip;
    b = { ...c, id, duration: len - off, fadeIn: 0 } as AnyClip;
  }
  if (f.track.kind !== "main") b = { ...(b as Placed), start: start + off } as AnyClip;
  // keyframes: each part keeps its own (the motion stays exactly the same)
  if (hasKeys(c)) {
    (a as MotionClip).keyframes = pruneKeys(keysOf(c), off);
    (b as MotionClip).keyframes = keysForPart(keysOf(c), off, len - off);
  }
  // the transition belongs to the start of the first part only
  if ("transitionIn" in b) delete (b as { transitionIn?: unknown }).transitionIn;
  const clips = [...(f.track.clips as AnyClip[])];
  clips.splice(f.index, 1, a, b);
  return { doc: mapTrack(doc, f.track.id, (tr) => ({ ...tr, clips }) as Track), newId: id };
}

/** Remove a clip. On the main track the clips after it move up (no gap). */
export function deleteClip(doc: TimelineDoc, clipId: string): TimelineDoc {
  const f = findClip(doc, clipId);
  if (!f || f.track.locked) return doc;
  return mapTrack(doc, f.track.id, (t) => ({ ...t, clips: (t.clips as AnyClip[]).filter((c) => c.id !== clipId) }) as Track);
}

/** Remove multiple clips at once across any unlocked tracks. */
export function deleteClips(doc: TimelineDoc, clipIds: string[]): TimelineDoc {
  const ids = new Set(clipIds);
  let d = doc;
  for (const tr of doc.tracks) {
    if (tr.locked) continue;
    const remaining = (tr.clips as AnyClip[]).filter((c) => !ids.has(c.id));
    if (remaining.length !== tr.clips.length) {
      d = mapTrack(d, tr.id, (t) => ({ ...t, clips: remaining }) as Track);
    }
  }
  return d;
}

/** Close all gaps on overlay/audio tracks by rippling adjacent clips so each abuts the previous one. */
export function closeAllGaps(doc: TimelineDoc): TimelineDoc {
  return {
    ...doc,
    tracks: doc.tracks.map((tr) => {
      if (tr.locked || tr.kind === "main" || tr.clips.length <= 1) return tr;
      const sorted = [...(tr.clips as (AnyClip & { start: number })[])].sort((a, b) => a.start - b.start);
      let cur = 0;
      const packed = sorted.map((c) => {
        const next = { ...c, start: cur };
        cur += clipLength(c);
        return next;
      });
      return { ...tr, clips: packed } as Track;
    }),
  };
}

/**
 * Move a clip edge. `to` is a timeline time for that edge. Videos and sound
 * trim inside their media (bounded by its length); pictures and text change
 * their duration. On free tracks the left edge keeps the clip's end in place.
 */
export const MIN_TRIM_SECONDS = 0.5;

export function trimClip(doc: TimelineDoc, clipId: string, edge: "in" | "out", to: number, media: (id: string) => MediaLite | null): TimelineDoc {
  const f = findClip(doc, clipId);
  if (!f || f.track.locked) return doc;
  const fps = doc.canvas.fps;
  const len = clipLength(f.clip);
  const min = Math.min(len, Math.max(MIN_TRIM_SECONDS, minLen(fps)));
  const start = f.track.kind === "main" ? mainStarts(f.track.clips)[f.index] : (f.clip as Placed).start;
  const end = start + len;
  const c = f.clip;
  let next: AnyClip = c;
  if (edge === "out") {
    const newLen = Math.max(min, snap(to, fps) - start);
    if (c.type === "video" || c.type === "audio") {
      const m = media(c.mediaId);
      const span = newLen * speedOf(c);
      // the timeline end of a reversed clip is its source start
      next = isReversed(c) ? ({ ...c, in: Math.max(0, c.out - span) } as AnyClip) : ({ ...c, out: Math.min(m?.duration ?? c.out, c.in + span) } as AnyClip);
    } else next = { ...c, duration: newLen } as AnyClip;
    if (f.track.kind === "main" && (c as any).start !== undefined) {
      next = { ...next, start: (c as any).start } as AnyClip;
    }
  } else {
    // how far the left edge moves (+ = shorter)
    let d = snap(to, fps) - start;
    if (c.type === "video" || c.type === "audio") {
      const sp = speedOf(c);
      if (isReversed(c)) {
        const m = media(c.mediaId);
        d = Math.max(-((m?.duration ?? c.out) - c.out) / sp, Math.min(d, clipLength(c) - min));
        next = { ...c, out: c.out - d * sp } as AnyClip;
      } else {
        d = Math.max(-c.in / sp, Math.min(d, clipLength(c) - min));
        next = { ...c, in: c.in + d * sp } as AnyClip;
      }
    } else {
      d = Math.min(d, len - min);
      next = { ...c, duration: len - d } as AnyClip;
    }
    const newStart = Math.max(0, end - clipLength(next));
    if (f.track.kind !== "main") {
      next = { ...(next as Placed), start: newStart } as AnyClip;
    } else {
      next = { ...next, start: newStart } as AnyClip;
    }
  }
  // keyframes stay on the same moments: a left-edge trim shifts them
  if (hasKeys(c)) {
    const newLen = clipLength(next);
    (next as MotionClip).keyframes = edge === "in" ? keysForPart(keysOf(c), len - newLen, newLen) : pruneKeys(keysOf(c), newLen);
  }
  // a free track: don't run into the next clip
  if (f.track.kind !== "main") {
    const others = (f.track.clips as Placed[]).filter((x) => x.id !== clipId);
    const s = (next as Placed).start;
    const e = s + clipLength(next);
    const after = others.filter((x) => x.start >= start - EPS).map((x) => x.start);
    const before = others.filter((x) => x.start + clipLength(x) <= start + EPS).map((x) => x.start + clipLength(x));
    const limitEnd = after.length ? Math.min(...after) : Infinity;
    const limitStart = before.length ? Math.max(...before) : 0;
    if (e > limitEnd + EPS || s < limitStart - EPS) return doc;
  }
  const clips = (f.track.clips as AnyClip[]).map((x) => (x.id === clipId ? next : x));
  return mapTrack(doc, f.track.id, (t) => ({ ...t, clips }) as Track);
}

/**
 * Move a clip. Main track: to position `index` (reorder). Overlay/audio: to
 * `start` on `trackId` (or a free track of the same kind if that spot is taken).
 * A picture or video can move between the main track and an overlay track.
 */
export function moveClip(doc: TimelineDoc, clipId: string, to: { trackId: string; start?: number; index?: number }): TimelineDoc {
  const f = findClip(doc, clipId);
  if (!f || f.track.locked) return doc;
  const c = f.clip;

  if (to.trackId === "new-overlay" || to.trackId === "new-audio") {
    const kind = to.trackId === "new-overlay" ? "overlay" : "audio";
    if (kind === "audio" && c.type !== "audio") return doc;
    if (kind === "overlay" && c.type === "audio") return doc;
    const start = Math.max(0, snap(to.start ?? 0, doc.canvas.fps));
    const { transitionIn: _t, ...cleanClip } = c as MainClip & { transitionIn?: unknown };
    void _t;
    const placed = { ...cleanClip, start } as Placed;
    const removed = deleteClip(doc, clipId);
    const id = newId(removed, kind === "overlay" ? "v" : "a");
    const name = nextTrackName(removed, kind);
    const newTrack: Track =
      kind === "overlay"
        ? { id, kind: "overlay", name, locked: false, hidden: false, muted: false, clips: [] }
        : { id, kind: "audio", name, locked: false, muted: false, clips: [] };
    const tracks = kind === "overlay" ? [newTrack, ...removed.tracks] : [...removed.tracks, newTrack];
    const withNew = withTracks(removed, tracks);
    return mapTrack(withNew, id, (t) => ({ ...t, clips: [placed] }) as Track);
  }

  const target = doc.tracks.find((t) => t.id === to.trackId);
  if (!target || target.locked) return doc;
  if (target.kind === "main") {
    // (text and elements live on overlay tracks only)
    if (c.type === "audio" || c.type === "text" || c.type === "element") return doc;
    const { start: _s, ...rest } = c as Placed & MainClip;
    void _s;
    const clip = rest as MainClip;
    const without = f.track.id === target.id ? (target.clips as MainClip[]).filter((x) => x.id !== clipId) : (target.clips as MainClip[]);
    const index = Math.min(Math.max(0, to.index ?? without.length), without.length);
    const clips = [...without.slice(0, index), clip, ...without.slice(index)];
    let d = f.track.id === target.id ? doc : deleteClip(doc, clipId);
    d = mapTrack(d, target.id, (t) => ({ ...t, clips }) as Track);
    return d;
  }
  if ((target.kind === "audio") !== (c.type === "audio")) return doc;
  const start = Math.max(0, snap(to.start ?? 0, doc.canvas.fps));
  const { transitionIn: _t, ...cleanClip } = c as MainClip & { transitionIn?: unknown };
  void _t;
  const placed = { ...cleanClip, start } as Placed;
  const removed = deleteClip(doc, clipId);
  const r = trackFor(removed, target.kind, start, clipLength(placed), target.id, clipId);
  return mapTrack(r.doc, r.trackId, (t) => ({ ...t, clips: [...(t.clips as Placed[]), placed].sort((a, b) => a.start - b.start) }) as Track);
}

/** Copy a clip: right after it (main track), or just after it on a free track. */
export function duplicateClip(doc: TimelineDoc, clipId: string): { doc: TimelineDoc; clipId: string | null } {
  const f = findClip(doc, clipId);
  if (!f || f.track.locked) return { doc, clipId: null };
  const id = newId(doc);
  if (f.track.kind === "main") {
    const clips = [...(f.track.clips as MainClip[])];
    clips.splice(f.index + 1, 0, { ...(f.clip as MainClip), id });
    return { doc: mapTrack(doc, f.track.id, (t) => ({ ...t, clips }) as Track), clipId: id };
  }
  const c = f.clip as Placed;
  const copy = { ...c, id, start: c.start + clipLength(c) } as Placed;
  const kind = f.track.kind;
  const r = trackFor(doc, kind, copy.start, clipLength(copy), f.track.id);
  return { doc: mapTrack(r.doc, r.trackId, (t) => ({ ...t, clips: [...(t.clips as Placed[]), copy].sort((a, b) => a.start - b.start) }) as Track), clipId: id };
}

/** A copied clip (⌘C / ⌘X) and the kind of track it came from. */
export type CopiedClip = { clip: AnyClip; kind: "main" | "overlay" | "audio"; trackId?: string };

/**
 * Paste a copied clip at timeline time `at` (⌘V). On Video 1 it goes right
 * after the clip under `at` (or at the end); pictures, text and sound go at
 * `at` on their old track if it is free there, else on a free one (a new one if needed).
 */
export function pasteClip(doc: TimelineDoc, copied: CopiedClip, at: number, wantId?: string): { doc: TimelineDoc; clipId: string } {
  const id = wantId && !findClip(doc, wantId) ? wantId : newId(doc);
  if (copied.kind === "main") {
    const main = mainTrack(doc);
    if (main.locked) return { doc, clipId: "" };
    const { transitionIn: _t, ...rest } = copied.clip as MainClip & { transitionIn?: unknown };
    void _t;
    const starts = mainStarts(main.clips);
    const under = main.clips.findIndex((c, i) => at >= starts[i] - EPS && at < starts[i] + clipLength(c) - EPS);
    const index = under >= 0 ? under + 1 : at <= EPS ? 0 : main.clips.length;
    const clips = [...main.clips];
    clips.splice(index, 0, { ...rest, id } as MainClip);
    return { doc: mapTrack(doc, main.id, (t) => ({ ...t, clips }) as Track), clipId: id };
  }
  const c = { ...(copied.clip as Placed), id, start: Math.max(0, at) } as Placed;
  const r = trackFor(doc, copied.kind, c.start, clipLength(c), copied.trackId);
  return { doc: mapTrack(r.doc, r.trackId, (t) => ({ ...t, clips: [...(t.clips as Placed[]), c].sort((a, b) => a.start - b.start) }) as Track), clipId: id };
}

/**
 * Cut media ranges out of a video/sound clip (e.g. its pauses). On the main
 * track the pieces stay back to back; elsewhere they close up from the start.
 */
export function removeRangesInClip(doc: TimelineDoc, clipId: string, ranges: Range[]): TimelineDoc {
  const f = findClip(doc, clipId);
  if (!f || f.track.locked || (f.clip.type !== "video" && f.clip.type !== "audio")) return doc;
  const c = f.clip;
  const min = minLen(doc.canvas.fps);
  let pieces = [{ in: c.in, out: c.out }];
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    pieces = pieces.flatMap((p) => {
      if (r.end <= p.in || r.start >= p.out) return [p];
      const keep: { in: number; out: number }[] = [];
      if (r.start > p.in) keep.push({ in: p.in, out: r.start });
      if (r.end < p.out) keep.push({ in: r.end, out: p.out });
      return keep;
    });
  }
  pieces = pieces.filter((p) => (p.out - p.in) / speedOf(c) >= min - EPS);
  // a reversed clip plays its source from the end: the later part comes first
  if (isReversed(c)) pieces.reverse();
  if (!pieces.length || (pieces.length === 1 && pieces[0].in === c.in && pieces[0].out === c.out)) return doc;
  let d = doc;
  const made: AnyClip[] = pieces.map((p, i) => {
    const id = i === 0 ? c.id : newId(d);
    const piece = { ...c, id, in: p.in, out: p.out } as AnyClip;
    if (i > 0 && "transitionIn" in piece) delete (piece as { transitionIn?: unknown }).transitionIn;
    // keyframes: each piece keeps the motion of its part
    if (hasKeys(c)) {
      const sp = speedOf(c);
      (piece as MotionClip).keyframes = keysForPart(keysOf(c), (isReversed(c) ? c.out - p.out : p.in - c.in) / sp, (p.out - p.in) / sp);
    }
    // reserve the id so the next piece gets a new one
    d = mapTrack(d, f.track.id, (t) => ({ ...t, clips: [...(t.clips as AnyClip[]), { ...piece, id }] }) as Track);
    return piece;
  });
  if (f.track.kind !== "main") {
    let s = (c as Placed).start;
    for (const m of made) {
      (m as Placed).start = s;
      s += clipLength(m);
    }
  }
  const clips = [...(f.track.clips as AnyClip[])];
  clips.splice(f.index, 1, ...made);
  return mapTrack(doc, f.track.id, (t) => ({ ...t, clips }) as Track);
}

export function addTrack(doc: TimelineDoc, kind: "overlay" | "audio"): TimelineDoc {
  const id = newId(doc, kind === "overlay" ? "v" : "a");
  const name = nextTrackName(doc, kind);
  const track: Track = kind === "overlay" ? { id, kind: "overlay", name, locked: false, hidden: false, muted: false, clips: [] } : { id, kind: "audio", name, locked: false, muted: false, clips: [] };
  return withTracks(doc, kind === "overlay" ? [track, ...doc.tracks] : [...doc.tracks, track]);
}

/** Captions for a subtitle track: timeline start, length and words. */
export type CaptionIn = { start: number; duration: number; text: string; wordTimes?: number[] };
/** Most captions on one track (the schema's clip limit); more go on further tracks. */
const CAPTIONS_PER_TRACK = 300;

/**
 * Subtitles as text clips (made from `template`, e.g. the Caption style) on new
 * overlay tracks of their own, on top, named `name` ("Subtitles", "Subtitles (Hindi)").
 * `hide`: tracks to hide at the same time (the original language after a translation).
 * One call = one undo step.
 */
export function addCaptionTrack(doc: TimelineDoc, name: string, captions: CaptionIn[], template: Omit<Extract<OverlayClip, { type: "text" }>, "id" | "start" | "text" | "duration">, hide: string[] = []): { doc: TimelineDoc; trackIds: string[] } {
  let d = { ...doc, tracks: doc.tracks.map((t) => (t.kind === "overlay" && hide.includes(t.id) ? { ...t, hidden: true } : t)) };
  const trackIds: string[] = [];
  let n = 0;
  const sorted = [...captions].sort((a, b) => a.start - b.start);
  for (let i = 0; i < Math.max(1, sorted.length); i += CAPTIONS_PER_TRACK) {
    const id = newId(d, "v");
    const clips = sorted.slice(i, i + CAPTIONS_PER_TRACK).map((c) => ({
      ...template,
      id: `${id}s${++n}`,
      type: "text" as const,
      text: c.text.slice(0, 1000),
      start: Math.max(0, c.start),
      duration: Math.max(0.1, Math.min(3600, c.duration)),
      // (word timings ride along when there is one per word, at most 60)
      ...(c.wordTimes && c.wordTimes.length <= 60 ? { wordTimes: c.wordTimes.map((t) => Math.max(0, Math.min(3600, t))) } : {}),
    }));
    const part = i === 0 ? name : `${name} ${i / CAPTIONS_PER_TRACK + 1}`;
    const track: Track = { id, kind: "overlay", name: part.slice(0, 40), locked: false, hidden: false, clips: clips as OverlayClip[] };
    d = withTracks(d, [track, ...d.tracks]);
    trackIds.push(id);
    if (!sorted.length) break;
  }
  return { doc: d, trackIds };
}

/** Remove an empty overlay/audio track (the main track stays). */
export function removeTrack(doc: TimelineDoc, trackId: string): TimelineDoc {
  const t = doc.tracks.find((x) => x.id === trackId);
  if (!t || t.kind === "main" || t.clips.length) return doc;
  return withTracks(doc, doc.tracks.filter((x) => x.id !== trackId));
}

export function setTrack(doc: TimelineDoc, trackId: string, patch: Partial<{ locked: boolean; hidden: boolean; muted: boolean; name: string }>): TimelineDoc {
  const p = { ...patch };
  if ("name" in p) p.name = (p.name ?? "").trim().slice(0, 40) || undefined;
  return mapTrack(doc, trackId, (t) => ({ ...t, ...p }) as Track);
}

/**
 * Reorder tracks within their category (overlay tracks among overlays, audio tracks among audio).
 * The Main track cannot be moved or targeted as an insertion boundary.
 */
export function reorderTracks(
  doc: TimelineDoc,
  sourceTrackId: string,
  targetTrackId: string,
  position: "before" | "after" = "before"
): TimelineDoc {
  if (sourceTrackId === targetTrackId) return doc;
  const source = doc.tracks.find((t) => t.id === sourceTrackId);
  const target = doc.tracks.find((t) => t.id === targetTrackId);
  if (!source || !target) return doc;
  // Main track cannot be moved or targeted as an insertion boundary
  if (source.kind === "main" || target.kind === "main") return doc;
  // Must be in the same category (both overlay, or both audio)
  if (source.kind !== target.kind) return doc;

  // Preserve the current visible names so each track retains its name when reordered
  const overlays = doc.tracks.filter((t) => t.kind === "overlay");
  const audios = doc.tracks.filter((t) => t.kind === "audio");
  const tracksWithNames = doc.tracks.map((t) => {
    if (t.name) return t;
    if (t.kind === "overlay") {
      const idx = overlays.findIndex((o) => o.id === t.id);
      return { ...t, name: `Overlay ${overlays.length - idx}` };
    }
    if (t.kind === "audio") {
      const idx = audios.findIndex((a) => a.id === t.id);
      return { ...t, name: `Audio ${idx + 1}` };
    }
    return { ...t, name: "Video 1" };
  });

  const updatedSource = tracksWithNames.find((t) => t.id === sourceTrackId)!;
  const withoutSource = tracksWithNames.filter((t) => t.id !== sourceTrackId);
  const targetIndex = withoutSource.findIndex((t) => t.id === targetTrackId);
  if (targetIndex === -1) return doc;

  const insertIndex = position === "after" ? targetIndex + 1 : targetIndex;
  const newTracks = [
    ...withoutSource.slice(0, insertIndex),
    updatedSource,
    ...withoutSource.slice(insertIndex),
  ];

  return withTracks(doc, newTracks);
}

/** Change clip properties (volume, transform, fades, text…); ids, types and media can't be changed. */
export function setClip(doc: TimelineDoc, clipId: string, patch: Record<string, unknown>): TimelineDoc {
  const f = findClip(doc, clipId);
  if (!f) return doc;
  const { id: _i, type: _t, mediaId: _m, ...safe } = patch;
  void _i;
  void _t;
  void _m;
  const clips = (f.track.clips as AnyClip[]).map((c) => {
    if (c.id !== clipId) return c;
    let next = { ...c, ...safe } as AnyClip;
    if ("start" in safe && safe.start === undefined) {
      delete (next as any).start;
    }
    if (hasKeys(c) && !("keyframes" in safe)) {
      // a new speed stretches the clip: the keyframes stay on the same moments of the video
      if ("speed" in safe && c.type === "video") next = { ...next, keyframes: scaleKeyTimes(keysOf(c), speedOf(c) / speedOf(next)) } as AnyClip;
      // a new length: only the keyframes that still matter
      if ("duration" in safe || "in" in safe || "out" in safe || "speed" in safe) next = { ...next, keyframes: pruneKeys(keysOf(next), clipLength(next)) } as AnyClip;
    }
    return next;
  });
  return mapTrack(doc, f.track.id, (t) => ({ ...t, clips }) as Track);
}

/**
 * Change a clip at timeline time `t` (the playhead). Place, size, angle and
 * opacity go into a keyframe there when the clip has keyframes (lib/edit/keyframes editAt).
 */
export function editClipAt(doc: TimelineDoc, clipId: string, t: number, patch: { transform?: Partial<Transform>; opacity?: number }): TimelineDoc {
  const f = findClip(doc, clipId);
  // (sound and blank scenes don't move: no place, size or angle)
  if (!f || f.track.locked || f.clip.type === "audio" || f.clip.type === "blank") return doc;
  const c = f.clip as MotionClip;
  const into = Math.min(clipLength(c), Math.max(0, t - clipStart(doc, clipId)));
  const next = editAt(c, into, doc.canvas.fps, patch);
  if (next === c) return doc;
  const clips = (f.track.clips as AnyClip[]).map((x) => (x.id === clipId ? (next as AnyClip) : x));
  return mapTrack(doc, f.track.id, (tr) => ({ ...tr, clips }) as Track);
}

export type KeyframeOp = { kind: "toggle" } | { kind: "remove"; index: number } | { kind: "move"; index: number; to: number } | { kind: "ease"; index: number; ease: Ease };

/** A keyframe change on a clip; `t` is the playhead (timeline time). */
export function keyframeOp(doc: TimelineDoc, clipId: string, t: number, op: KeyframeOp): TimelineDoc {
  const f = findClip(doc, clipId);
  // (sound and blank scenes don't move: no place, size or angle)
  if (!f || f.track.locked || f.clip.type === "audio" || f.clip.type === "blank") return doc;
  const c = f.clip as MotionClip;
  const fps = doc.canvas.fps;
  const into = Math.min(clipLength(c), Math.max(0, t - clipStart(doc, clipId)));
  const next = op.kind === "toggle" ? toggleKey(c, into, fps) : op.kind === "remove" ? removeKey(c, op.index, into) : op.kind === "move" ? moveKey(c, op.index, op.to, fps) : setKeyEase(c, op.index, op.ease);
  if (next === c) return doc;
  const clips = (f.track.clips as AnyClip[]).map((x) => (x.id === clipId ? (next as AnyClip) : x));
  return mapTrack(doc, f.track.id, (tr) => ({ ...tr, clips }) as Track);
}

/**
 * Detach audio from a video clip onto its own audio track:
 * creates an AudioPlaced clip matching the video's timing, in/out trims,
 * and sets the original video's volume to 0 (muted).
 */
export function detachAudio(
  doc: TimelineDoc,
  clipId: string,
  media: (id: string) => MediaLite | null,
): { doc: TimelineDoc; audioClipId: string | null } {
  const f = findClip(doc, clipId);
  if (!f || f.clip.type !== "video") return { doc, audioClipId: null };
  const c = f.clip;
  const m = media(c.mediaId);
  if (!m || !m.hasAudio) return { doc, audioClipId: null };

  const start = clipStart(doc, clipId);
  // Find or create an audio track
  let audioTrack = doc.tracks.find(
    (t) => t.kind === "audio" && !t.locked && !overlaps(t.clips as Placed[], start, clipLength(c)),
  );
  let currentDoc = doc;
  if (!audioTrack) {
    currentDoc = addTrack(doc, "audio");
    audioTrack = currentDoc.tracks[currentDoc.tracks.length - 1];
  }

  const audioId = newId(currentDoc, "a");
  const audioClip: AudioPlaced = {
    id: audioId,
    type: "audio",
    mediaId: c.mediaId,
    in: c.in,
    out: c.out,
    volume: c.volume && c.volume > 0 ? c.volume : 1,
    duck: false,
    fadeIn: c.fadeIn ?? 0,
    fadeOut: c.fadeOut ?? 0,
    volumeAutomation: c.volumeAutomation,
    start,
    detachedFromClipId: c.id,
  };

  // 1. Add audio clip to the audio track
  let nextDoc = mapTrack(currentDoc, audioTrack.id, (t) => ({ ...t, clips: [...t.clips, audioClip] } as Track));

  // 2. Mute original video clip and link detached audio clip ID
  const updatedVideo = { ...c, muted: true, volume: 0, detachedAudioId: audioId };
  const videoClips = (f.track.clips as AnyClip[]).map((x) => (x.id === clipId ? (updatedVideo as AnyClip) : x));
  nextDoc = mapTrack(nextDoc, f.track.id, (t) => ({ ...t, clips: videoClips } as Track));

  return { doc: nextDoc, audioClipId: audioId };
}

/**
 * Re-attach audio back into its video clip:
 * merges volume, fades, and automation back into the video clip,
 * un-mutes the video, and removes the detached audio clip from the audio track.
 * Accepts either the video clip ID or the detached audio clip ID.
 */
export function attachAudio(
  doc: TimelineDoc,
  clipId: string,
): { doc: TimelineDoc; restoredClipId: string | null } {
  const f = findClip(doc, clipId);
  if (!f) return { doc, restoredClipId: null };

  let videoClip: (AnyClip & { type: "video" }) | null = null;
  let videoTrackId: string | null = null;
  let audioClip: AudioPlaced | null = null;
  let audioTrackId: string | null = null;

  if (f.clip.type === "video") {
    const vc = f.clip as AnyClip & { type: "video" };
    videoClip = vc;
    videoTrackId = f.track.id;
    const vStart = clipStart(doc, vc.id);

    // Find the detached audio clip
    const targetAudioId = (vc as any).detachedAudioId;
    for (const track of doc.tracks) {
      if (track.kind !== "audio") continue;
      for (const c of track.clips) {
        if (c.type !== "audio") continue;
        const ac = c as AudioPlaced;
        if (targetAudioId && ac.id === targetAudioId) {
          audioClip = ac;
          audioTrackId = track.id;
          break;
        }
        if ((ac as any).detachedFromClipId && (ac as any).detachedFromClipId === vc.id) {
          audioClip = ac;
          audioTrackId = track.id;
          break;
        }
        if (ac.mediaId === vc.mediaId && Math.abs(ac.start - vStart) < 0.15) {
          audioClip = ac;
          audioTrackId = track.id;
          break;
        }
      }
      if (audioClip) break;
    }
  } else if (f.clip.type === "audio") {
    const ac = f.clip as AudioPlaced;
    audioClip = ac;
    audioTrackId = f.track.id;
    const targetVideoId = (ac as any).detachedFromClipId;

    for (const track of doc.tracks) {
      if (track.kind !== "main" && track.kind !== "overlay") continue;
      for (const c of track.clips) {
        if (c.type !== "video") continue;
        const vc = c as AnyClip & { type: "video" };
        if (targetVideoId && vc.id === targetVideoId) {
          videoClip = vc;
          videoTrackId = track.id;
          break;
        }
        if ((vc as any).detachedAudioId && (vc as any).detachedAudioId === ac.id) {
          videoClip = vc;
          videoTrackId = track.id;
          break;
        }
        if (vc.mediaId === ac.mediaId && Math.abs(clipStart(doc, vc.id) - ac.start) < 0.15) {
          videoClip = vc;
          videoTrackId = track.id;
          break;
        }
      }
      if (videoClip) break;
    }
  }

  if (!videoClip || !videoTrackId || !audioClip || !audioTrackId) {
    return { doc, restoredClipId: null };
  }

  const finalVideo = videoClip;
  const finalAudio = audioClip;
  const finalAudioTrackId = audioTrackId;
  const finalVideoTrackId = videoTrackId;

  // 1. Remove the detached audio clip from its audio track
  let nextDoc = mapTrack(doc, finalAudioTrackId, (t) => ({
    ...t,
    clips: t.clips.filter((c) => c.id !== finalAudio.id),
  } as Track));

  // If the audio track became empty and there are other audio tracks, clean it up
  const remainingAudioTracks = nextDoc.tracks.filter((t) => t.kind === "audio");
  const affectedTrack = nextDoc.tracks.find((t) => t.id === finalAudioTrackId);
  if (affectedTrack && affectedTrack.clips.length === 0 && remainingAudioTracks.length > 1) {
    nextDoc = removeTrack(nextDoc, finalAudioTrackId);
  }

  // 2. Restore video clip audio settings
  const restoredVolume = finalAudio.volume > 0 ? finalAudio.volume : 1;
  const updatedVideo = {
    ...finalVideo,
    muted: false,
    volume: restoredVolume,
    fadeIn: finalAudio.fadeIn ?? finalVideo.fadeIn,
    fadeOut: finalAudio.fadeOut ?? finalVideo.fadeOut,
    volumeAutomation: finalAudio.volumeAutomation ?? finalVideo.volumeAutomation,
    detachedAudioId: undefined,
  };

  nextDoc = mapTrack(nextDoc, finalVideoTrackId, (t) => ({
    ...t,
    clips: (t.clips as AnyClip[]).map((c) => (c.id === finalVideo.id ? (updatedVideo as AnyClip) : c)),
  } as Track));

  return { doc: nextDoc, restoredClipId: finalVideo.id };
}

/**
 * Toggles audio detach state:
 * - If audio is currently detached (or if target is the detached audio clip): re-attaches audio.
 * - If audio is attached: detaches audio onto an audio track.
 */
export function toggleAudioDetach(
  doc: TimelineDoc,
  clipId: string,
  media: (id: string) => MediaLite | null,
): { doc: TimelineDoc; resultingClipId: string | null; action: "attached" | "detached" } {
  const f = findClip(doc, clipId);
  if (!f) return { doc, resultingClipId: null, action: "detached" };

  if (f.clip.type === "audio") {
    const attachRes = attachAudio(doc, clipId);
    return { doc: attachRes.doc, resultingClipId: attachRes.restoredClipId, action: "attached" };
  }

  if (f.clip.type === "video") {
    const vc = f.clip as any;
    const vStart = clipStart(doc, vc.id);
    const hasDetachedAudio = doc.tracks
      .filter((t) => t.kind === "audio")
      .flatMap((t) => t.clips)
      .some(
        (a) =>
          a.type === "audio" &&
          ((vc.detachedAudioId && a.id === vc.detachedAudioId) ||
            ((a as any).detachedFromClipId && (a as any).detachedFromClipId === vc.id) ||
            (a.mediaId === vc.mediaId && Math.abs((a as Placed).start - vStart) < 0.15)),
      );

    if (hasDetachedAudio) {
      const attachRes = attachAudio(doc, clipId);
      return { doc: attachRes.doc, resultingClipId: attachRes.restoredClipId, action: "attached" };
    } else {
      const detachRes = detachAudio(doc, clipId, media);
      return { doc: detachRes.doc, resultingClipId: detachRes.audioClipId, action: "detached" };
    }
  }

  return { doc, resultingClipId: null, action: "detached" };
}

/** Add a marker on the timeline at time `t` (seconds). */
export function addMarker(doc: TimelineDoc, t: number, label = "Marker", color: MarkerColor = "blue"): { doc: TimelineDoc; markerId: string } {
  const id = newId(doc, "m");
  const snapT = Math.max(0, snap(t, doc.canvas.fps));
  const newMarker: TimelineMarker = { id, t: snapT, label, color };
  const markers = [...(doc.markers ?? []), newMarker].sort((a, b) => a.t - b.t);
  return { doc: { ...doc, markers }, markerId: id };
}

/** Delete a marker by id. */
export function deleteMarker(doc: TimelineDoc, markerId: string): TimelineDoc {
  if (!doc.markers) return doc;
  const markers = doc.markers.filter((m) => m.id !== markerId);
  return { ...doc, markers };
}

/** Update an existing marker's label, color, or time. */
export function updateMarker(doc: TimelineDoc, markerId: string, patch: Partial<Omit<TimelineMarker, "id">>): TimelineDoc {
  if (!doc.markers) return doc;
  const markers = doc.markers.map((m) => (m.id === markerId ? { ...m, ...patch } : m)).sort((a, b) => a.t - b.t);
  return { ...doc, markers };
}

/**
 * Add a generating placeholder clip to the timeline.
 * If mediaType is "audio", adds to an audio track at `at`.
 * If mediaType is "video" or "image", adds to the main track (or overlay if requested).
 */
export function addGeneratingClip(
  doc: TimelineDoc,
  opts: {
    mediaType: "video" | "image" | "audio";
    prompt: string;
    trackId?: string;
    at?: number;
    index?: number;
    duration?: number;
    aspect?: string;
    provider?: string;
    referenceImageId?: string;
    id?: string;
  },
): { doc: TimelineDoc; clipId: string } {
  if (opts.mediaType === "audio") {
    let audioTrack = opts.trackId ? doc.tracks.find((t) => t.id === opts.trackId && t.kind === "audio") : null;
    let nextDoc = doc;
    if (!audioTrack) {
      audioTrack = doc.tracks.find((t) => t.kind === "audio") ?? null;
      if (!audioTrack) {
        const newAudioId = newId(doc, "a");
        const newTrack: Track = { id: newAudioId, kind: "audio", name: "Audio", locked: false, muted: false, clips: [] };
        nextDoc = withTracks(doc, [...doc.tracks, newTrack]);
        audioTrack = newTrack;
      }
    }
    const id = opts.id && !findClip(nextDoc, opts.id) ? opts.id : newId(nextDoc, "gen-a");
    const clip = generatingAudioClipOf(id, Math.max(0, opts.at ?? 0), {
      prompt: opts.prompt,
      duration: opts.duration ?? 5,
      provider: opts.provider,
    });
    return {
      doc: mapTrack(nextDoc, audioTrack.id, (t) => ({ ...t, clips: [...(t.clips as AudioPlaced[]), clip].sort((a, b) => a.start - b.start) }) as Track),
      clipId: id,
    };
  }

  // Visual media: video or image
  const targetTrack = opts.trackId ? doc.tracks.find((t) => t.id === opts.trackId) : null;
  if (targetTrack?.kind === "overlay") {
    // Overlay track
    const id = opts.id && !findClip(doc, opts.id) ? opts.id : newId(doc, "gen-v");
    const duration = opts.duration ?? (opts.mediaType === "video" ? 6 : 3);
    const clip: OverlayClip = {
      id,
      type: "image",
      mediaId: "00000000-0000-4000-8000-000000000000",
      duration,
      start: Math.max(0, opts.at ?? 0),
      transform: { ...DEFAULT_TRANSFORM },
      fadeIn: 0,
      fadeOut: 0,
      generation: {
        mediaType: opts.mediaType,
        prompt: opts.prompt,
        progress: 0,
        status: "generating",
        aspect: opts.aspect ?? "16:9",
        provider: opts.provider ?? "gemini",
        startedAt: Date.now(),
        referenceImageId: opts.referenceImageId,
      },
    };
    return {
      doc: mapTrack(doc, targetTrack.id, (t) => ({ ...t, clips: [...(t.clips as OverlayClip[]), clip].sort((a, b) => a.start - b.start) }) as Track),
      clipId: id,
    };
  }

  // Default: Main track
  const main = mainTrack(doc);
  const id = opts.id && !findClip(doc, opts.id) ? opts.id : newId(doc, "gen-v");
  const clip = generatingBlankClipOf(id, {
    prompt: opts.prompt,
    mediaType: opts.mediaType,
    duration: opts.duration,
    aspect: opts.aspect,
    provider: opts.provider,
    referenceImageId: opts.referenceImageId,
  });
  const i = Math.min(Math.max(0, Math.round(opts.index ?? main.clips.length)), main.clips.length);
  return {
    doc: mapTrack(doc, main.id, (t) => ({ ...t, clips: [...(t.clips as MainClip[]).slice(0, i), clip, ...(t.clips as MainClip[]).slice(i)] }) as Track),
    clipId: id,
  };
}

/** Update the generation progress / status of a generating clip */
export function updateGeneratingClipProgress(
  doc: TimelineDoc,
  clipId: string,
  progress: number,
  status: "generating" | "ready" | "failed" = "generating",
  error?: string,
): TimelineDoc {
  const f = findClip(doc, clipId);
  if (!f) return doc;
  const clip = f.clip as any;
  if (!clip.generation) return doc;
  const updatedGeneration: ClipGeneration = {
    ...clip.generation,
    progress: Math.min(100, Math.max(0, Math.round(progress))),
    status,
    error: error ?? clip.generation.error,
  };
  const updatedClip = { ...clip, generation: updatedGeneration };
  return mapTrack(doc, f.track.id, (t) => ({ ...t, clips: (t.clips as AnyClip[]).map((c) => (c.id === clipId ? updatedClip : c)) }) as Track);
}

/**
 * Replace a generating placeholder clip with the actual resolved media.
 */
export function resolveGeneratingClip(doc: TimelineDoc, clipId: string, media: MediaLite): TimelineDoc {
  const f = findClip(doc, clipId);
  if (!f) return doc;
  const oldClip = f.clip as AnyClip;
  const tr = f.track;

  if (tr.kind === "main") {
    let newClip: MainClip;
    if (media.kind === "video") {
      newClip = videoClipOf(oldClip.id, media, plainOps(), 0, media.duration);
    } else {
      newClip = imageClipOf(oldClip.id, media, oldClip.type === "blank" ? oldClip.duration : 3);
    }
    const clips = (tr.clips as MainClip[]).map((c) => (c.id === clipId ? newClip : c));
    return mapTrack(doc, tr.id, (t) => ({ ...t, clips }) as Track);
  }

  if (tr.kind === "overlay") {
    let newClip: OverlayClip;
    const start = (oldClip as any).start ?? 0;
    if (media.kind === "video") {
      newClip = { ...videoClipOf(oldClip.id, media, plainOps(), 0, media.duration), start };
    } else {
      newClip = { ...imageClipOf(oldClip.id, media, (oldClip as any).duration ?? 3), start };
    }
    const clips = (tr.clips as OverlayClip[]).map((c) => (c.id === clipId ? newClip : c));
    return mapTrack(doc, tr.id, (t) => ({ ...t, clips }) as Track);
  }

  if (tr.kind === "audio") {
    const start = (oldClip as AudioPlaced).start ?? 0;
    const newClip: AudioPlaced = {
      id: oldClip.id,
      type: "audio",
      mediaId: media.id,
      in: 0,
      out: media.duration,
      volume: (oldClip as AudioPlaced).volume ?? 1,
      duck: (oldClip as AudioPlaced).duck ?? false,
      fadeIn: oldClip.fadeIn ?? 0,
      fadeOut: oldClip.fadeOut ?? 0,
      start,
    };
    const clips = (tr.clips as AudioPlaced[]).map((c) => (c.id === clipId ? newClip : c));
    return mapTrack(doc, tr.id, (t) => ({ ...t, clips }) as Track);
  }

  return doc;
}

/** Remove a generating clip by id */
export function removeGeneratingClip(doc: TimelineDoc, clipId: string): TimelineDoc {
  const f = findClip(doc, clipId);
  if (!f) return doc;
  return mapTrack(doc, f.track.id, (t) => ({ ...t, clips: (t.clips as AnyClip[]).filter((c) => c.id !== clipId) }) as Track);
}

/**
 * On project load no generation job is running, so any placeholder still marked
 * generating/queued is orphaned: mark it failed ("Interrupted") so the user can retry or dismiss it.
 * Returns the same doc reference when nothing changes.
 */
export function interruptOrphanedGenerations(doc: TimelineDoc): TimelineDoc {
  let changed = false;
  const tracks = doc.tracks.map((t) => {
    let trackChanged = false;
    const clips = (t.clips as AnyClip[]).map((c) => {
      const gen = (c as { generation?: ClipGeneration }).generation;
      if (!gen || (gen.status !== "generating" && gen.status !== "queued")) return c;
      trackChanged = true;
      return { ...c, generation: { ...gen, status: "failed" as const, error: "Interrupted" } };
    });
    if (!trackChanged) return t;
    changed = true;
    return { ...t, clips } as Track;
  });
  return changed ? { ...doc, tracks } : doc;
}

