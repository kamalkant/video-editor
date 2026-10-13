"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ContextMenu, type MenuItem } from "@/components/ui/ContextMenu";
import { Icon, type IconName } from "@/components/ui/Icon";
import {
  clipLength,
  docDuration,
  findClip,
  mainStarts,
  MIN_CLIP_FRAMES,
  overlapAt,
  resolveBlankFill,
  type AnyClip,
  type ClipTransition,
  type MediaLite,
  type TimelineDoc,
  type Track,
  type TimelineMarker,
  type MainClip,
} from "@/lib/edit/doc";
import type { Clock } from "@/lib/editor/clock";
import type { Range } from "@/lib/edit/timeline";
import { formatTenths, formatTime } from "@/lib/format";
import { dropLanding, MIN_TRIM_SECONDS, type KeyframeOp } from "@/lib/edit/docEdit";
import { keyIndexAt, keysOf, type MotionClip } from "@/lib/edit/keyframes";
import {
  MEDIA_DRAG,
  mediaDrag,
  MEME_DRAG,
  memeDrag,
  useMediaDrag,
  type LibraryClipDragItem,
  type MemeClipItem,
} from "@/lib/editor/mediaDrag";
import { elementName } from "@/lib/elements/catalog";
import { filmOpsParam, filmTiles } from "@/lib/editor/film";
import { getEditingTools } from "@/lib/editor/editingTools";
import { useTheme } from "@/lib/editor/theme";
import { localFilm, localItem, localSrc, localThumb, notOnServer } from "@/lib/media/localMedia";

export { MEDIA_DRAG, MEME_DRAG } from "@/lib/editor/mediaDrag";

const SPEED_MENU = [0.25, 0.5, 1, 1.5, 2, 3, 4];
export type MaskKind = "none" | "rounded" | "circle" | "bubble";
const MASK_MENU: { kind: MaskKind; label: string }[] = [
  { kind: "none", label: "No mask (full picture)" },
  { kind: "rounded", label: "Rounded corners" },
  { kind: "circle", label: "Circle" },
  { kind: "bubble", label: "Round camera bubble (square crop + white ring)" },
];
/** Default timeline scale: 60 px/sec provides clear clip visibility and comfortable editing. */
export const DEFAULT_FIT_PX_PER_SEC = 60;
export const DEFAULT_TIMELINE_PX_PER_SEC = 60;
/** Default duration for an empty timeline before any clips are added (15 seconds / 0:15). */
export const DEFAULT_EMPTY_TIMELINE_SECONDS = 15;
/** Minimum zoom: 10 px/sec allows seeing long projects overview. */
export const MIN_TIMELINE_PX_PER_SEC = 10;
/** Maximum zoom: 500 px/sec allows frame-level editing precision. */
export const MAX_TIMELINE_PX_PER_SEC = 500;

/**
 * Maps a pxPerSec value to a 0–100 slider value logarithmically.
 */
export function scaleToSlider(
  pxPerSec: number,
  minScale: number = MIN_TIMELINE_PX_PER_SEC,
  maxScale: number = MAX_TIMELINE_PX_PER_SEC,
): number {
  const min = Math.max(0.1, minScale);
  const max = Math.max(min + 1, maxScale);
  const clamped = Math.max(min, Math.min(max, pxPerSec));
  const logMin = Math.log(min);
  const logMax = Math.log(max);
  const ratio = (Math.log(clamped) - logMin) / (logMax - logMin);
  return Math.round(Math.max(0, Math.min(100, ratio * 100)));
}

/**
 * Maps a 0–100 slider value to a pxPerSec value logarithmically.
 */
export function sliderToScale(
  sliderVal: number,
  minScale: number = MIN_TIMELINE_PX_PER_SEC,
  maxScale: number = MAX_TIMELINE_PX_PER_SEC,
): number {
  const min = Math.max(0.1, minScale);
  const max = Math.max(min + 1, maxScale);
  const ratio = Math.max(0, Math.min(100, sliderVal)) / 100;
  const logMin = Math.log(min);
  const logMax = Math.log(max);
  const val = Math.exp(logMin + ratio * (logMax - logMin));
  return Math.round(val * 10) / 10;
}

/**
 * Calculates auto-fit scale: fits the timeline in the viewport width,
 * capped at DEFAULT_FIT_PX_PER_SEC (60 px/s) so short clips / empty projects keep clear visibility.
 */
export const fitScale = (width: number, seconds: number) => {
  if (seconds <= 0) return DEFAULT_FIT_PX_PER_SEC;
  const want = width / seconds;
  return Math.min(
    DEFAULT_FIT_PX_PER_SEC,
    Math.max(MIN_TIMELINE_PX_PER_SEC, Math.round(want * 10) / 10),
  );
};
const SNAP_PX = 8;

function tickStep(visible: number) {
  const raw = visible / 10;
  for (const s of [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300])
    if (s >= raw) return s;
  return 600;
}
const tickLabel = (t: number, step: number) =>
  step < 1 && t % 1 ? `${formatTime(Math.floor(t))}.5` : formatTime(t);

/** "Video 1" for the main track, "Overlay 1…" above it, "Audio 1…" below. */
function trackNames(doc: TimelineDoc): Record<string, string> {
  const names: Record<string, string> = {};
  const overlays = doc.tracks.filter((t) => t.kind === "overlay");
  overlays.forEach(
    (t, i) => (names[t.id] = t.name || `Overlay ${overlays.length - i}`),
  );
  doc.tracks
    .filter((t) => t.kind === "audio")
    .forEach((t, i) => (names[t.id] = t.name || `Audio ${i + 1}`));
  const main = doc.tracks.find((t) => t.kind === "main");
  if (main) names[main.id] = main.name || "Video 1";
  // names the user gave win
  for (const t of doc.tracks) if (t.name) names[t.id] = t.name;
  return names;
}

const HEAD_KEY = "VDO:v1:trackHeadWidth";
const HEAD_MIN = 96;
const HEAD_MAX = 320;

/** A track's name: double-click (or Enter) to rename it. */
function TrackName({
  name,
  onRename,
}: {
  name: string;
  onRename: (n: string) => void;
}) {
  const [edit, setEdit] = useState<string | null>(null);
  if (edit !== null)
    return (
      <input
        autoFocus
        className="field h-6 min-h-0 min-w-0 flex-1 px-1 text-[0.6875rem]"
        aria-label="Track name"
        value={edit}
        maxLength={40}
        onChange={(e) => setEdit(e.target.value)}
        onBlur={() => {
          onRename(edit);
          setEdit(null);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEdit(null);
        }}
      />
    );
  return (
    <button
      type="button"
      className="min-w-0 flex-1 truncate rounded px-0.5 text-left hover:bg-raised"
      title={`${name} — double-click to rename`}
      aria-label={`${name}. Press Enter to rename.`}
      onDoubleClick={() => setEdit(name)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "F2") {
          e.preventDefault();
          e.stopPropagation();
          setEdit(name);
        }
      }}
    >
      {name}
    </button>
  );
}

const startOf = (track: Track, i: number) =>
  track.kind === "main"
    ? mainStarts(track.clips)[i]
    : (track.clips[i] as AnyClip & { start: number }).start;

export type TimelineProps = {
  projectId?: string | null;
  doc: TimelineDoc;
  media: Record<string, MediaLite>;
  clock: Clock;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Timeline time. */
  onSeek: (t: number) => void;
  onSplit: (clipId: string, t: number) => void;
  onDelete: (clipId: string) => void;
  onDuplicate: (clipId: string) => void;
  /** ⌘C / ⌘X / ⌘V (null: nothing copied yet) */
  onCopy: (clipId: string) => void;
  onCut: (clipId: string) => void;
  onPaste: (() => void) | null;
  /** Move a clip edge to timeline time `to`. */
  onTrim: (
    clipId: string,
    edge: "in" | "out",
    to: number,
    group: string,
  ) => void;
  onMove: (
    clipId: string,
    to: { trackId: string; start?: number; index?: number },
    group: string,
  ) => void;
  onDropMedia: (
    mediaId: string,
    trackId: string | null,
    t: number,
    index?: number,
  ) => void;
  onDropMeme?: (
    meme: MemeClipItem,
    trackId: string | null,
    t: number,
    index?: number,
  ) => void;
  onDropFile: (f: File) => void;
  onSetTrack: (
    trackId: string,
    patch: Partial<{
      locked: boolean;
      hidden: boolean;
      muted: boolean;
      name: string;
    }>,
  ) => void;
  onAddTrack: (kind: "overlay" | "audio") => void;
  onRemoveTrack: (trackId: string) => void;
  onReorderTrack?: (
    sourceId: string,
    targetId: string,
    position: "before" | "after",
  ) => void;
  onSilences: (clipId: string) => void;
  /** Crop the selected picture clip on the preview. */
  onCrop?: (clipId: string) => void;
  /** Change clip properties (speed, reverse). */
  onPatchClip?: (clipId: string, patch: Record<string, unknown>) => void;
  /** Hold the frame at timeline time t of a Video 1 clip (a picture is put in). */
  onFreeze?: (clipId: string, t: number) => void;
  /** Give the selected video / picture a shape (Mask tool). */
  onMask?: (clipId: string, kind: MaskKind) => void;
  /** Keyframes: add / remove at a time, move one, how it eases (`t`: timeline time). */
  onKeyframe?: (
    clipId: string,
    t: number,
    op: KeyframeOp,
    group?: string,
  ) => void;
  /** A cut on Video 1 was clicked: select (or add) the transition into this clip. */
  onTransition?: (clipId: string) => void;
  /** Put a blank scene on Video 1 at this place (0 = the start; the number of clips = the end). */
  onInsertBlank?: (index: number) => void;
  /** The clip whose transition is selected. */
  selectedTransition?: string | null;
  onChoose: () => void;
  /** Pauses "Remove silences" would cut (media times of one clip). */
  highlights?: { clipId: string; ranges: Range[] } | null;
  /** Detach audio from a video clip into a dedicated audio track */
  onDetachAudio?: (clipId: string) => void;
  /** Re-attach detached audio back into its video clip */
  onAttachAudio?: (clipId: string) => void;
  /** Toggle audio attach / detach */
  onToggleAudioDetach?: (clipId: string) => void;
  /** Timeline markers: drop marker, delete, update note & color */
  onAddMarker?: (
    t: number,
    label?: string,
    color?: TimelineMarker["color"],
  ) => void;
  onDeleteMarker?: (markerId: string) => void;
  onUpdateMarker?: (
    markerId: string,
    patch: Partial<{
      label: string;
      color: TimelineMarker["color"];
      t: number;
    }>,
  ) => void;
  /** Multi-select: bulk delete and gap closing */
  onDeleteMany?: (clipIds: string[]) => void;
  onCloseAllGaps?: () => void;
  /** Cancel in-progress AI generation for clip */
  onCancelGeneration?: (clipId: string) => void;
  /** Retry a failed / interrupted AI generation for clip */
  onRetryGeneration?: (clipId: string) => void;
  /** Copy & Paste visual clip style */
  onCopyStyle?: (clipId: string) => void;
  onPasteStyle?: (clipId: string) => void;
  hasCopiedStyle?: boolean;
  /** Open universal AI generation tooltip/popover */
  onOpenAiGen?: (params: {
    anchor?: { x: number; y: number };
    target?: {
      trackId?: string;
      index?: number;
      at?: number;
      targetDescription?: string;
    };
  }) => void;
  /** Imperative timeline controls (Zoom In, Zoom Out, Fit) */
  timelineRef?: React.Ref<TimelineApi | null>;
  /** Synchronized multi-selection IDs across tracks */
  selectedClipIds?: Set<string>;
  onSelectClips?: (ids: string[]) => void;
  /** Motion Tracking tool trigger and active state */
  onMotionTracking?: (clipId: string) => void;
  isMotionTrackingOpen?: boolean;
};

export interface TimelineApi {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
}

type Drag =
  | { kind: "seek" }
  | {
      kind: "trim";
      id: string;
      edge: "in" | "out";
      x0: number;
      t0: number;
      s0: number;
      end0: number;
      len0: number;
      pxPerSec: number;
      group: string;
      nextClipId?: string;
    }
  | {
      kind: "move";
      id: string;
      x0: number;
      y0: number;
      start0: number;
      pxPerSec: number;
      group: string;
      moved: boolean;
      main: boolean;
      /** Video 1: where it goes on release */ index?: number;
    }
  /** a keyframe diamond: drag to move its time, click to go there */
  | {
      kind: "key";
      id: string;
      index: number;
      x0: number;
      t0: number;
      start: number;
      pxPerSec: number;
      group: string;
      moved: boolean;
    };

/** Where a dragged clip or file would land (the dashed shadow; on Video 1 the other clips make room). */
type Landing = {
  key: string;
  doc: TimelineDoc;
  trackId: string;
  start: number;
  length: number;
  /** the lane under the pointer (the shadow shows there when it needs a new track) */
  hover: string;
  name: string;
  /** a file: what the drop sends (the same numbers the shadow came from) */
  drop?: { trackId: string; at: number; index?: number };
};

/**
 * The playhead time for what the timeline shows and does at the playhead (the editing tools, the time
 * label, split / freeze / marker at the playhead): at most every 150 ms, so playback doesn't re-render the
 * whole timeline every frame. The red needle itself follows the clock every frame (PlayheadNeedle).
 */
function useThrottledClock(clock: Clock, intervalMs = 150): number {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      let last = 0;
      return clock.subscribe(() => {
        const now = performance.now();
        if (now - last > intervalMs) {
          last = now;
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          onStoreChange();
        } else if (!timer) {
          timer = setTimeout(() => {
            timer = null;
            last = performance.now();
            onStoreChange();
          }, intervalMs);
        }
      });
    },
    [clock, intervalMs],
  );
  return useSyncExternalStore(subscribe, clock.get, () => 0);
}

function PlayheadNeedle({
  clock,
  total,
  x,
  inner,
}: {
  clock: Clock;
  total: number;
  x: (t: number) => number;
  inner: number;
}) {
  const t = useSyncExternalStore(clock.subscribe, clock.get, () => 0);
  const pos = x(Math.min(total, t));
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-3 z-30"
      style={{ width: inner }}
    >
      <span
        className="absolute inset-y-0 left-0 w-0.5 -translate-x-1/2 bg-red-500 will-change-transform"
        style={{ transform: `translate3d(${pos}px, 0, 0)` }}
        data-testid="playhead"
      >
        <span className="absolute -left-[5px] top-0.5 block size-3 rotate-45 rounded-sm bg-red-500" />
      </span>
    </div>
  );
}

/**
 * The multi-track timeline (like CapCut / Google Vids): overlay tracks on top,
 * the magnetic main track ("Video 1"), audio tracks below. Clips can be
 * selected, moved (reordered on the main track), trimmed at their edges,
 * split, cut and duplicated; media can be dropped from My Assets.
 */
export function Timeline(p: TimelineProps) {
  const { doc, media } = p;
  const t = useThrottledClock(p.clock, 150);
  const [dragTotal, setDragTotal] = useState<number | null>(null);
  const dragTotalRef = useRef<number | null>(null);
  const empty = doc.tracks.every((tr) => tr.clips.length === 0);
  const total = empty
    ? DEFAULT_EMPTY_TIMELINE_SECONDS
    : Math.max(1, docDuration(doc), dragTotal ?? dragTotalRef.current ?? 0);
  const fps = doc.canvas.fps;
  const names = useMemo(() => trackNames(doc), [doc]);
  // pixels per second: auto-fitted to window, or manual if user zoomed
  const [userZoomed, setUserZoomed] = useState(false);
  const [scale, setScale] = useState<number>(DEFAULT_FIT_PX_PER_SEC);
  const [over, setOver] = useState<string | null>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    id: string;
    at: number;
  } | null>(null);
  const [trimMenu, setTrimMenu] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [speedMenu, setSpeedMenu] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [maskMenu, setMaskMenu] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [editingMarker, setEditingMarker] = useState<TimelineMarker | null>(
    null,
  );
  const [markerMenu, setMarkerMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [rulerMenu, setRulerMenu] = useState<{
    x: number;
    y: number;
    t: number;
  } | null>(null);
  const [emptyMenu, setEmptyMenu] = useState<{
    x: number;
    y: number;
    at: number;
    laneId?: string;
    plusIndex?: number;
    anchorX?: number;
    anchorY?: number;
  } | null>(null);
  const [trackMenu, setTrackMenu] = useState<{
    x: number;
    y: number;
    track: Track;
  } | null>(null);
  const [snapping, setSnapping] = useState(true);
  const [snapAt, setSnapAt] = useState<number | null>(null);
  const [activeTrimTip, setActiveTrimTip] = useState<{
    clipId: string;
    edge: "in" | "out";
    duration: number;
    time: number;
  } | null>(null);
  const [landing, setLanding] = useState<Landing | null>(null);
  const landingKey = useRef<string | null>(null);
  const [ghost, setGhost] = useState<{ id: string; dx: number } | null>(null);
  // Track Layer Reordering Drag State
  const [trackDrag, setTrackDrag] = useState<{
    sourceId: string;
    overTrackId: string | null;
    position: "before" | "after" | null;
  } | null>(null);
  const trackDragRef = useRef<{
    sourceId: string;
    overTrackId: string | null;
    position: "before" | "after" | null;
  } | null>(null);
  const lanesWrap = useRef<HTMLDivElement>(null);
  const dragScale = useRef<number | null>(null);
  const dragMedia = useMediaDrag();
  const scroller = useRef<HTMLDivElement>(null);
  // the track names: a column of their own (the sideways scrollbar is only under the lanes), kept level with the lanes
  const headsBody = useRef<HTMLDivElement>(null);
  // following the playhead while it plays (see below); `mine`: the last scroll we made ourselves
  const follow = useRef({
    on: true,
    lastT: 0,
    lastWall: 0,
    mine: -1,
    smoothUntil: 0,
  });
  /** Scroll the timeline sideways ourselves (not the user: following goes on). */
  const scrollTo = (el: HTMLElement, left: number, smooth = false) => {
    const v = Math.max(0, Math.round(left));
    if (Math.abs(v - el.scrollLeft) < 1) return;
    if (smooth) {
      follow.current.smoothUntil = performance.now() + 700;
      el.scrollTo({ left: v, behavior: "smooth" });
    } else {
      follow.current.mine = v;
      el.scrollLeft = v;
    }
  };
  const lanesRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  // the part in view (film frames outside it aren't drawn); updated as it scrolls (every 40 px is enough: a screen either side is drawn)
  const [view, setView] = useState({ left: 0, width: 1600 });
  // the track-name column: its width can be dragged, and is remembered
  const [headW, setHeadW] = useState(() => {
    try {
      const v = Number(localStorage.getItem(HEAD_KEY));
      return v >= HEAD_MIN && v <= HEAD_MAX ? v : 136;
    } catch {
      return 136;
    }
  });
  const setHead = (w: number) => {
    const v = Math.round(Math.min(HEAD_MAX, Math.max(HEAD_MIN, w)));
    setHeadW(v);
    try {
      localStorage.setItem(HEAD_KEY, String(v));
    } catch {
      /* private window */
    }
  };

  const drag = useRef<Drag | null>(null);
  const pendingDrag = useRef<{
    clientX: number;
    clientY: number;
    altKey: boolean;
  } | null>(null);
  const dragRaf = useRef<number | null>(null);
  const lastSeekTime = useRef<number>(0);

  // (a drag cut short by leaving the editor mustn't leave the page unselectable)
  useEffect(
    () => () => {
      dragLook(null);
      if (dragRaf.current !== null) {
        cancelAnimationFrame(dragRaf.current);
        dragRaf.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    // the lanes scroll both ways; the track names follow up and down, the ruler stays on top
    let frame = 0;
    const look = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setView((v) =>
          Math.abs(v.left - el.scrollLeft) < 40 && v.width === el.clientWidth
            ? v
            : { left: el.scrollLeft, width: el.clientWidth },
        ),
      );
    };
    const ro = new ResizeObserver(() => {
      setWidth(el.clientWidth);
      look();
    });
    ro.observe(el);
    const level = () => {
      if (headsBody.current) headsBody.current.scrollTop = el.scrollTop;
      look();
    };
    el.addEventListener("scroll", level, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      el.removeEventListener("scroll", level);
    };
  }, []);

  const lanesW = Math.max(200, width - 24);
  const minZoom = MIN_TIMELINE_PX_PER_SEC;
  const maxZoom = MAX_TIMELINE_PX_PER_SEC;

  // Fit once when a project is first opened with content; stays rock-solid during trimming and editing (Google Vids model)
  const lastFittedProjRef = useRef<string | null>(null);
  useEffect(() => {
    if (width > 0 && !empty && !userZoomed) {
      const projKey = p.projectId || "default-proj";
      if (lastFittedProjRef.current !== projKey) {
        lastFittedProjRef.current = projKey;
        const initialScale = fitScale(lanesW, total * 1.05);
        setScale(initialScale);
      }
    }
  }, [p.projectId, empty, userZoomed, width, lanesW, total]);

  // Stable pixels-per-second time scale: locked to user or project scale, never dynamically auto-rescales on doc edits/trims
  const pxPerSec = Math.max(minZoom, Math.min(maxZoom, scale));
  // Compact end margin (around 48px or 1.5-3s) for dropping after the last clip and showing the + button
  const endPad = empty ? 0 : Math.min(3, Math.max(1.5, 48 / pxPerSec));
  const contentSpan = empty ? DEFAULT_EMPTY_TIMELINE_SECONDS : total + endPad;
  const span = empty
    ? Math.max(DEFAULT_EMPTY_TIMELINE_SECONDS, lanesW / pxPerSec)
    : Math.max(contentSpan, lanesW / pxPerSec);
  const inner = (empty ? span : contentSpan) * pxPerSec;
  const x = (tl: number) => tl * pxPerSec;
  const step = tickStep(lanesW / pxPerSec);
  const maxTick = span;
  const ticks: number[] = [];
  for (let v = 0; v <= maxTick + 1e-6; v += step)
    ticks.push(Math.round(v * 1000) / 1000);

  // clamp scrollLeft whenever timeline inner width or viewport width changes
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const maxScroll = Math.max(0, inner + 24 - lanesW);
    if (el.scrollLeft > maxScroll) {
      scrollTo(el, maxScroll);
    }
  }, [inner, lanesW]);

  const zoomTo = (next: number) => {
    setUserZoomed(true);
    const el = scroller.current;
    const s = Math.min(maxZoom, Math.max(minZoom, next));
    // keep the playhead where it is on screen
    if (el) {
      const onScreen = x(t) - el.scrollLeft;
      requestAnimationFrame(() => scrollTo(el, t * s - onScreen));
    }
    setScale(s);
  };
  const zoomStep = (dir: 1 | -1) => {
    setUserZoomed(true);
    const currentVal = scaleToSlider(pxPerSec, minZoom, maxZoom);
    const nextVal = Math.min(100, Math.max(0, currentVal + dir * 5));
    zoomTo(sliderToScale(nextVal, minZoom, maxZoom));
  };
  const fit = () => {
    setUserZoomed(false);
    lastFittedProjRef.current = p.projectId || "default-proj";
    const fittedScale = empty
      ? fitScale(lanesW - 24, DEFAULT_EMPTY_TIMELINE_SECONDS)
      : fitScale(lanesW, total * 1.05);
    setScale(fittedScale);
    if (scroller.current) scrollTo(scroller.current, 0);
  };

  useImperativeHandle(
    p.timelineRef,
    () => ({
      zoomIn: () => zoomStep(1),
      zoomOut: () => zoomStep(-1),
      fit,
    }),
    [pxPerSec, lanesW, empty, total],
  );

  const minLen = MIN_CLIP_FRAMES / fps;

  const [localMultiSelected, setLocalMultiSelected] = useState<Set<string>>(
    new Set(),
  );
  const multiSelected = p.selectedClipIds ?? localMultiSelected;
  const setMultiSelected = (
    updater: Set<string> | ((prev: Set<string>) => Set<string>),
  ) => {
    const next =
      typeof updater === "function" ? updater(multiSelected) : updater;
    if (p.onSelectClips) {
      p.onSelectClips(Array.from(next));
    } else {
      setLocalMultiSelected(next);
    }
  };
  const isSelectedClip = (id: string) =>
    id === p.selectedId || multiSelected.has(id);
  const toggleMulti = (id: string) => {
    setMultiSelected((prev) => {
      const next = new Set(prev);
      if (p.selectedId) next.add(p.selectedId);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearMulti = () => {
    if (p.onSelectClips) p.onSelectClips([]);
    else setLocalMultiSelected(new Set());
  };

  const tools = getEditingTools(doc, p.selectedId, t, media, fps);
  const sel = tools.selected;
  const selStart = tools.selectedStart;
  const target = tools.target;

  // a clip selected elsewhere (the preview): scroll its track into view
  const selTrack = p.selectedId
    ? findClip(doc, p.selectedId)?.track.id
    : undefined;
  useEffect(() => {
    const el = scroller.current;
    const lane = selTrack
      ? el?.querySelector<HTMLElement>(`[data-lane="${selTrack}"]`)
      : null;
    if (!el || !lane) return;
    const top = lane.offsetTop;
    const ruler = 24;
    if (top < el.scrollTop + ruler) el.scrollTop = Math.max(0, top - ruler);
    else if (top + lane.offsetHeight > el.scrollTop + el.clientHeight)
      el.scrollTop = top + lane.offsetHeight - el.clientHeight;
  }, [selTrack]);

  // ⌘ / Ctrl + scroll wheel zooms (around the pointer), like other editors
  const wheelZoom = useRef<(e: WheelEvent) => void>(() => {});
  useEffect(() => {
    wheelZoom.current = (e: WheelEvent) => {
      if (!(e.metaKey || e.ctrlKey) || empty) return;
      e.preventDefault();
      const el = scroller.current;
      const lanes = lanesRef.current;
      if (!el || !lanes) return;
      const at = Math.max(
        0,
        (e.clientX - lanes.getBoundingClientRect().left) / pxPerSec,
      );
      setUserZoomed(true);
      const next = Math.min(
        maxZoom,
        Math.max(minZoom, pxPerSec * (e.deltaY < 0 ? 1.15 : 0.87)),
      );
      const onScreen = x(at) - el.scrollLeft;
      setScale(next);
      requestAnimationFrame(() => scrollTo(el, at * next - onScreen));
    };
  });
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const on = (e: WheelEvent) => wheelZoom.current(e);
    el.addEventListener("wheel", on, { passive: false });
    return () => el.removeEventListener("wheel", on);
  }, []);

  // follow the playhead, like CapCut: while playing, the red line walks to the middle of the
  // timeline, then stays there and the clips glide under it (no jumps). A seek or Home / End
  // slides it into view. Scrolling the timeline yourself stops the following until the next
  // seek or play. (Read straight from the clock: no re-render needed for it.)
  const pxRef = useRef(pxPerSec);
  const emptyRef = useRef(empty);
  useEffect(() => {
    pxRef.current = pxPerSec;
    emptyRef.current = empty;
  }, [pxPerSec, empty]);
  const clock = p.clock;
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const f = follow.current;
    const onClock = () => {
      const now = performance.now();
      const tl = clock.get();
      const dt = tl - f.lastT;
      const gap = now - f.lastWall;
      f.lastT = tl;
      f.lastWall = now;
      if (emptyRef.current) return;
      const view = el.clientWidth;
      const px = tl * pxRef.current + 12;
      const playing = dt > 0 && dt < 0.25 && gap < 250;
      if (!playing) {
        // a jump (seek, Home / End, loop, play after a pause): follow again; bring the line into view
        f.on = true;
        if (px < el.scrollLeft + 8 || px > el.scrollLeft + view - 24)
          scrollTo(el, px - view / 3, true);
        return;
      }
      if (!f.on) return;
      if (px < el.scrollLeft + 8) return scrollTo(el, px - view / 3, true);
      // Smooth page-ahead scrolling (like Premiere / Final Cut / CapCut):
      // Keep timeline stationary during normal playback so the playhead glides 100% smoothly with zero shaking;
      // when approaching the right edge (82% of view), smoothly scroll forward.
      if (px > el.scrollLeft + view * 0.82) {
        scrollTo(el, px - view * 0.18, true);
      }
    };
    const onScroll = () => {
      if (
        performance.now() < f.smoothUntil ||
        Math.abs(el.scrollLeft - f.mine) < 2
      )
        return;
      f.on = false;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const off = clock.subscribe(onClock);
    return () => {
      off();
      el.removeEventListener("scroll", onScroll);
    };
  }, [clock]);

  const timeAt = (clientX: number) => {
    const r = lanesRef.current!.getBoundingClientRect();
    return Math.min(
      empty ? span : contentSpan,
      Math.max(0, (clientX - r.left) / pxPerSec),
    );
  };

  /** Times clips and the playhead can snap to, leaving out one clip's own edges. */
  const edges = (except?: string, includePlayhead = true) => {
    const out = includePlayhead ? [0, p.clock.get()] : [0];
    if (doc.markers) {
      for (const m of doc.markers) out.push(m.t);
    }
    for (const tr of doc.tracks)
      tr.clips.forEach((c, i) => {
        if (c.id === except) return;
        const s = startOf(tr, i);
        out.push(s, s + clipLength(c as AnyClip));
      });
    return out;
  };
  const snapTo = (v: number, cands: number[], free: boolean) => {
    if (free || !snapping) {
      setSnapAt(null);
      return v;
    }
    const near = cands.find((c) => Math.abs(c - v) * pxPerSec < SNAP_PX);
    setSnapAt(near ?? null);
    return near ?? v;
  };

  /** The track lane at this height (works however far the timeline is scrolled). */
  const laneAt = (clientY: number): Track | null => {
    for (const el of lanesWrap.current?.querySelectorAll<HTMLElement>(
      "[data-lane]",
    ) ?? []) {
      const r = el.getBoundingClientRect();
      if (clientY >= r.top && clientY < r.bottom)
        return doc.tracks.find((tr) => tr.id === el.dataset.lane) ?? null;
    }
    return null;
  };

  const isAboveTopOverlay = (clientY: number): boolean => {
    const firstLane =
      lanesWrap.current?.querySelector<HTMLElement>("[data-lane]");
    if (!firstLane) return false;
    const r = firstLane.getBoundingClientRect();
    return clientY < r.top;
  };

  const isBelowLowestAudio = (clientY: number): boolean => {
    const audioLanes = lanesWrap.current?.querySelectorAll<HTMLElement>(
      '[data-testid="lane-audio"]',
    );
    if (!audioLanes || audioLanes.length === 0) return false;
    const last = audioLanes[audioLanes.length - 1];
    const r = last.getBoundingClientRect();
    return clientY > r.bottom;
  };

  const onStartTrackDrag = (e: React.PointerEvent, trackId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const sourceTrack = doc.tracks.find((t) => t.id === trackId);
    if (!sourceTrack || sourceTrack.kind === "main") return;

    trackDragRef.current = {
      sourceId: trackId,
      overTrackId: null,
      position: null,
    };
    setTrackDrag(trackDragRef.current);

    const handlePointerMove = (ev: PointerEvent) => {
      let overId: string | null = null;
      let targetEl: HTMLElement | null = null;

      const headEl = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest<HTMLElement>("[data-track-head]");
      if (headEl?.dataset.trackHead) {
        overId = headEl.dataset.trackHead;
        targetEl = headEl;
      } else {
        const laneEl = document
          .elementFromPoint(ev.clientX, ev.clientY)
          ?.closest<HTMLElement>("[data-lane]");
        if (laneEl?.dataset.lane) {
          overId = laneEl.dataset.lane;
          targetEl = laneEl;
        } else {
          const l = laneAt(ev.clientY);
          if (l) {
            overId = l.id;
            targetEl =
              lanesWrap.current?.querySelector<HTMLElement>(
                `[data-lane="${l.id}"]`,
              ) ?? null;
          }
        }
      }

      if (!overId || !targetEl) {
        if (trackDragRef.current?.overTrackId !== null) {
          trackDragRef.current = {
            sourceId: trackId,
            overTrackId: null,
            position: null,
          };
          setTrackDrag(trackDragRef.current);
        }
        return;
      }

      const overTrack = doc.tracks.find((t) => t.id === overId);
      if (
        !overTrack ||
        overTrack.id === trackId ||
        overTrack.kind !== sourceTrack.kind
      ) {
        if (trackDragRef.current?.overTrackId !== null) {
          trackDragRef.current = {
            sourceId: trackId,
            overTrackId: null,
            position: null,
          };
          setTrackDrag(trackDragRef.current);
        }
        return;
      }

      const rect = targetEl.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      const pos: "before" | "after" = ev.clientY < mid ? "before" : "after";
      if (
        trackDragRef.current?.overTrackId !== overId ||
        trackDragRef.current?.position !== pos
      ) {
        trackDragRef.current = {
          sourceId: trackId,
          overTrackId: overId,
          position: pos,
        };
        setTrackDrag(trackDragRef.current);
      }
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      const current = trackDragRef.current;
      trackDragRef.current = null;
      setTrackDrag(null);
      if (current?.overTrackId && current.position && p.onReorderTrack) {
        p.onReorderTrack(
          current.sourceId,
          current.overTrackId,
          current.position,
        );
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };
  const showLanding = (
    key: string,
    make: () => Omit<Landing, "key"> | null,
  ) => {
    if (key === landingKey.current) return;
    landingKey.current = key;
    const l = make();
    setLanding(l ? { ...l, key } : null);
  };
  const clearLanding = () => {
    landingKey.current = null;
    setLanding(null);
  };

  /** Where a dragged Video 1 clip (or dropped media) goes in the order. */
  const mainIndexAt = (tl: number, except?: string) => {
    const main = doc.tracks.find((tr) => tr.kind === "main")!;
    const clips = main.clips.filter((c) => c.id !== except);
    const starts = mainStarts(clips);
    let i = 0;
    while (i < clips.length && tl > starts[i] + clipLength(clips[i]) / 2) i++;
    return i;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || empty) return;
    const el = e.target as HTMLElement;
    const handle = el.closest<HTMLElement>("[data-edge]");
    const clipEl = el.closest<HTMLElement>("[data-clip]");
    const keyEl = el.closest<HTMLElement>("[data-key]");
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (clipEl) {
      // a clip drag never selects the names and times on the page; focus goes where a click would put it
      e.preventDefault();
      (handle ?? clipEl.querySelector<HTMLElement>("button"))?.focus({
        preventScroll: true,
      });
    }
    if (keyEl && clipEl) {
      const id = clipEl.dataset.clip!;
      const f = findClip(doc, id);
      const index = Number(keyEl.dataset.key);
      const k = f ? keysOf(f.clip)[index] : undefined;
      if (f && k && !f.track.locked) {
        dragScale.current = pxPerSec;
        drag.current = {
          kind: "key",
          id,
          index,
          x0: e.clientX,
          t0: k.t,
          start: startOf(f.track, f.index),
          pxPerSec,
          group: `key:move:${id}:${e.timeStamp}`,
          moved: false,
        };
        return;
      }
    }
    if (handle) {
      const id = handle.dataset.id!;
      const f = findClip(doc, id);
      if (!f || f.track.locked) return;
      const s = startOf(f.track, f.index);
      const edge = handle.dataset.edge as "in" | "out";
      const len = clipLength(f.clip);
      dragScale.current = pxPerSec;
      dragTotalRef.current = total;
      setDragTotal(total);

      let nextClipId: string | undefined = undefined;
      if (edge === "out" && f.track.kind === "main" && f.index + 1 < f.track.clips.length) {
        const nextClip = f.track.clips[f.index + 1];
        if ((nextClip as any).start === undefined) {
          nextClipId = nextClip.id;
          p.onPatchClip?.(nextClip.id, { start: s + len });
        }
      }

      drag.current = {
        kind: "trim",
        id,
        edge,
        x0: e.clientX,
        t0: edge === "in" ? s : s + len,
        s0: s,
        end0: s + len,
        len0: len,
        pxPerSec,
        group: `trim:${id}:${e.timeStamp}`,
        nextClipId,
      };
      dragLook("trim");
      p.onSelect(id);
      setActiveTrimTip({
        clipId: id,
        edge,
        duration: len,
        time: edge === "in" ? s : s + len,
      });
      return;
    }
    if (clipEl) {
      const id = clipEl.dataset.clip!;
      const f = findClip(doc, id);
      if (!f) return;
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        toggleMulti(id);
      } else {
        clearMulti();
        p.onSelect(id);
        if (p.onSelectClips) p.onSelectClips([id]);
        p.onSeek(Math.min(total, snapTo(timeAt(e.clientX), edges(), e.altKey)));
      }
      if (f.track.locked) return;
      dragScale.current = pxPerSec;
      drag.current = {
        kind: "move",
        id,
        x0: e.clientX,
        y0: e.clientY,
        start0: startOf(f.track, f.index),
        pxPerSec,
        group: `move:${id}:${e.timeStamp}`,
        moved: false,
        main: f.track.kind === "main",
      };
      dragLook("move");
      return;
    }
    drag.current = { kind: "seek" };
    // an empty spot in a track or lanes clears the selection; the ruler only moves the playhead
    const isRuler = !!(e.target as HTMLElement).closest("[data-ruler]");
    if (!isRuler) {
      clearMulti();
      p.onSelect(null);
      if (p.onSelectClips) p.onSelectClips([]);
    }
    p.onSeek(Math.min(total, snapTo(timeAt(e.clientX), edges(), e.altKey)));
  };

  const processSeek = (clientX: number, altKey: boolean) => {
    p.onSeek(Math.min(total, snapTo(timeAt(clientX), edges(), altKey)));
  };

  const processTrim = (clientX: number, altKey: boolean, isFinal = false) => {
    const d = drag.current;
    if (!d || d.kind !== "trim") return;

    const rawTarget = d.t0 + (clientX - d.x0) / d.pxPerSec;
    // When dragging trim handle, snap to other clips/markers but never to the lagging playhead
    const targetTime = snapTo(rawTarget, edges(d.id, false), altKey);

    const f = findClip(doc, d.id);
    if (f) {
      const minL = Math.min(d.len0, Math.max(MIN_TRIM_SECONDS, 1 / fps));
      let curLen = d.len0;
      let activeTime = targetTime;
      if (d.edge === "in") {
        curLen = Math.max(minL, d.end0 - targetTime);
        activeTime = d.end0 - curLen;
      } else {
        curLen = Math.max(minL, targetTime - d.s0);
        activeTime = d.s0 + curLen;
      }
      setActiveTrimTip({
        clipId: d.id,
        edge: d.edge,
        duration: curLen,
        time: activeTime,
      });

      // Synchronize playhead smoothly with the trim edge on every RAF frame for silky-smooth 60fps tracking
      if (d.edge === "in") {
        p.onSeek(Math.max(0, activeTime));
      } else {
        p.onSeek(Math.max(d.s0, activeTime - 1 / fps));
      }
    }

    p.onTrim(d.id, d.edge, targetTime, d.group);
  };

  const processMove = (clientX: number, clientY: number, altKey: boolean) => {
    const d = drag.current;
    if (!d || d.kind !== "move") return;

    if (
      !d.moved &&
      Math.abs(clientX - d.x0) < 4 &&
      Math.abs(clientY - d.y0) < 4
    )
      return;
    d.moved = true;
    const f = findClip(doc, d.id);
    if (!f) return;
    const len = clipLength(f.clip);
    const lane = laneAt(clientY);
    const isAboveTop = isAboveTopOverlay(clientY);
    const isBelowAudio = isBelowLowestAudio(clientY);
    // (a blank scene only moves along Video 1)
    const toMain =
      f.clip.type === "blank" ||
      (lane?.kind === "main" &&
        f.clip.type !== "audio" &&
        f.clip.type !== "text" &&
        f.clip.type !== "element") ||
      (!lane && !isAboveTop && !isBelowAudio && d.main);
    if (
      toMain &&
      f.clip.type !== "audio" &&
      f.clip.type !== "text" &&
      f.clip.type !== "element"
    ) {
      setGhost({ id: d.id, dx: clientX - d.x0 });
      const main = doc.tracks.find((tr) => tr.kind === "main")!;
      const index = mainIndexAt(
        Math.max(0, d.start0 + (clientX - d.x0) / d.pxPerSec),
        d.id,
      );
      d.index = index;
      showLanding(`clip:${d.id}:${index}`, () => {
        const l = dropLanding(
          doc,
          { clipId: d.id },
          { trackId: main.id, index },
        );
        return (
          l && {
            doc: l.doc,
            trackId: l.trackId,
            start: l.start,
            length: l.length,
            hover: main.id,
            name: "",
          }
        );
      });
      return;
    }
    let start = Math.max(0, d.start0 + (clientX - d.x0) / d.pxPerSec);
    const cands = edges(d.id);
    const s1 = snapTo(start, cands, altKey);
    if (s1 !== start) start = s1;
    else {
      const e1 = snapTo(start + len, cands, altKey);
      if (e1 !== start + len) start = e1 - len;
    }
    const kind = f.clip.type === "audio" ? "audio" : "overlay";
    const toTrack =
      lane && lane.kind === kind
        ? lane.id
        : f.track.kind === kind
          ? f.track.id
          : (doc.tracks.find((tr) => tr.kind === kind)?.id ?? f.track.id);
    setGhost(null);
    clearLanding();
    d.index = undefined;
    p.onMove(d.id, { trackId: toTrack, start }, d.group);
    d.main = false;
    d.start0 = start;
    d.x0 = clientX;
  };

  const processKey = (clientX: number, altKey: boolean) => {
    const d = drag.current;
    if (!d || d.kind !== "key") return;
    if (!d.moved && Math.abs(clientX - d.x0) < 3) return;
    d.moved = true;
    const to =
      snapTo(
        d.start + d.t0 + (clientX - d.x0) / d.pxPerSec,
        [t],
        altKey,
      ) - d.start;
    p.onKeyframe?.(
      d.id,
      t,
      { kind: "move", index: d.index, to },
      d.group,
    );
  };

  const processDragFrame = () => {
    dragRaf.current = null;
    const pd = pendingDrag.current;
    const d = drag.current;
    if (!pd || !d) return;

    if (d.kind === "seek") {
      processSeek(pd.clientX, pd.altKey);
    } else if (d.kind === "trim") {
      processTrim(pd.clientX, pd.altKey, false);
    } else if (d.kind === "move") {
      processMove(pd.clientX, pd.clientY, pd.altKey);
    } else if (d.kind === "key") {
      processKey(pd.clientX, pd.altKey);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;

    // Edge auto-scrolling
    if (d.kind === "trim" || d.kind === "move") {
      const el = scroller.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        if (e.clientX > rect.right - 40) {
          el.scrollLeft += 8;
        } else if (e.clientX < rect.left + 40 && el.scrollLeft > 0) {
          el.scrollLeft -= 8;
        }
      }
    }

    pendingDrag.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      altKey: e.altKey,
    };

    if (dragRaf.current === null) {
      dragRaf.current = requestAnimationFrame(processDragFrame);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRaf.current !== null) {
      cancelAnimationFrame(dragRaf.current);
      dragRaf.current = null;
    }
    try {
      (e.currentTarget as HTMLElement)?.releasePointerCapture?.(e.pointerId);
    } catch {}

    dragScale.current = null;
    dragTotalRef.current = null;
    setDragTotal(null);
    const d = drag.current;
    drag.current = null;
    pendingDrag.current = null;
    dragLook(null);
    setSnapAt(null);
    setActiveTrimTip(null);

    // Google Vids: when main track clip left handle is trimmed, ripple back to previous clip (or 0:00 for clip 0) and seek playhead.
    // When right handle is trimmed, release anchored next clip so it ripples to touch trimmed clip on drop.
    if (d?.kind === "trim") {
      processTrim(e.clientX, e.altKey, true);
      if (d.edge === "in") {
        const f = findClip(doc, d.id);
        if (f && f.track.kind === "main") {
          if (f.index === 0) {
            p.onPatchClip?.(d.id, { start: 0 });
            p.onSeek(0);
          } else {
            const starts = mainStarts(f.track.clips as MainClip[]);
            const prevEnd = starts[f.index - 1] + clipLength(f.track.clips[f.index - 1]);
            p.onPatchClip?.(d.id, { start: undefined });
            p.onSeek(prevEnd);
          }
        }
      } else if (d.edge === "out") {
        if (d.nextClipId) {
          p.onPatchClip?.(d.nextClipId, { start: undefined });
        }
      }
      return;
    }
    // a click on a keyframe: the playhead goes there
    if (d?.kind === "key" && !d.moved) p.onSeek(d.start + d.t0);
    if (d?.kind === "move" && d.moved) {
      if (d.index !== undefined) {
        const main = doc.tracks.find((tr) => tr.kind === "main")!;
        const lane = laneAt(e.clientY);
        if (
          !lane ||
          lane.kind === "main" ||
          findClip(doc, d.id)?.clip.type === "blank"
        )
          p.onMove(d.id, { trackId: main.id, index: d.index }, d.group);
      } else {
        const f = findClip(doc, d.id);
        if (f) {
          const isAboveTop = isAboveTopOverlay(e.clientY);
          const isBelowAudio = isBelowLowestAudio(e.clientY);
          const kind = f.clip.type === "audio" ? "audio" : "overlay";
          if (isAboveTop && kind === "overlay") {
            p.onMove(
              d.id,
              { trackId: "new-overlay", start: startOf(f.track, f.index) },
              d.group,
            );
          } else if (isBelowAudio && kind === "audio") {
            p.onMove(
              d.id,
              { trackId: "new-audio", start: startOf(f.track, f.index) },
              d.group,
            );
          }
        }
      }
    }
    setGhost(null);
    clearLanding();
  };

  const onContextMenu = (e: React.MouseEvent) => {
    const clip = (e.target as HTMLElement).closest<HTMLElement>("[data-clip]");
    if (clip) {
      e.preventDefault();
      p.onSelect(clip.dataset.clip!);
      setMenu({
        x: e.clientX,
        y: e.clientY,
        id: clip.dataset.clip!,
        at: timeAt(e.clientX),
      });
      return;
    }
    const lane = (e.target as HTMLElement).closest<HTMLElement>("[data-lane]");
    if (
      lane ||
      (e.target as HTMLElement).closest<HTMLElement>("[data-lanes-wrap]") ||
      (e.target as HTMLElement).closest<HTMLElement>(
        "[data-testid='timeline-scroller']",
      )
    ) {
      e.preventDefault();
      const clickTime = Math.min(total, Math.max(0, timeAt(e.clientX)));
      setEmptyMenu({
        x: e.clientX,
        y: e.clientY,
        at: clickTime,
        laneId: lane?.dataset.lane,
      });
      return;
    }
  };

  /** Right-click: a keyframe there (6 px) can be removed; otherwise one can be added there. */
  const keyItems = (
    f: NonNullable<ReturnType<typeof findClip>>,
    s: number,
    at: number,
  ): MenuItem[] => {
    if (f.clip.type === "audio" || !p.onKeyframe) return [];
    const into = at - s;
    const near = keysOf(f.clip).findIndex(
      (k) => Math.abs(k.t - into) * pxPerSec < 6,
    );
    const id = f.clip.id;
    return [
      "separator",
      near >= 0
        ? {
            label: "Remove keyframe",
            disabled: f.track.locked,
            onSelect: () =>
              p.onKeyframe!(id, at, { kind: "remove", index: near }),
          }
        : {
            label: "Add keyframe here",
            disabled:
              f.track.locked ||
              into < 0 ||
              into > clipLength(f.clip as AnyClip),
            onSelect: () => p.onKeyframe!(id, at, { kind: "toggle" }),
          },
    ];
  };
  const menuItems = (m: { id: string; at: number }): MenuItem[] => {
    const f = findClip(doc, m.id);
    if (!f) return [];
    const s = startOf(f.track, f.index);
    const splittable =
      !f.track.locked &&
      m.at > s + minLen &&
      m.at < s + clipLength(f.clip) - minLen;
    const sound =
      (f.clip.type === "video" || f.clip.type === "audio") &&
      !!media[f.clip.mediaId]?.hasAudio;
    return [
      {
        label: "Split here",
        shortcut: "S",
        disabled: !splittable,
        onSelect: () => p.onSplit(m.id, m.at),
      },
      { label: "Copy", shortcut: "⌘C", onSelect: () => p.onCopy(m.id) },
      {
        label: "Cut",
        shortcut: "⌘X",
        disabled: f.track.locked,
        onSelect: () => p.onCut(m.id),
      },
      {
        label: "Paste at the playhead",
        shortcut: "⌘V",
        disabled: !p.onPaste,
        onSelect: () => p.onPaste?.(),
      },
      ...(p.onCopyStyle
        ? [
            {
              label: "Copy style",
              shortcut: "⌥⌘C",
              onSelect: () => p.onCopyStyle!(m.id),
            },
          ]
        : []),
      ...(p.onPasteStyle
        ? [
            {
              label: "Paste style",
              shortcut: "⌥⌘V",
              disabled: !p.hasCopiedStyle || f.track.locked,
              onSelect: () => p.onPasteStyle!(m.id),
            },
          ]
        : []),
      {
        label: "Duplicate",
        shortcut: "⌘D",
        disabled: f.track.locked,
        onSelect: () => p.onDuplicate(m.id),
      },
      {
        label: "Delete",
        shortcut: "Del",
        disabled: f.track.locked,
        onSelect: () => p.onDelete(m.id),
      },
      ...keyItems(f, s, m.at),
      "separator",
      {
        label: "Remove silences…",
        disabled: f.track.locked || !sound,
        onSelect: () => p.onSilences(m.id),
      },
      ...((p.onDetachAudio || p.onToggleAudioDetach || p.onAttachAudio) && f.clip.type === "video" && sound
        ? [
            {
              label: tools.isAudioDetached ? "Attach audio" : "Detach audio",
              disabled: f.track.locked,
              onSelect: () =>
                p.onToggleAudioDetach
                  ? p.onToggleAudioDetach(m.id)
                  : tools.isAudioDetached && p.onAttachAudio
                    ? p.onAttachAudio(m.id)
                    : p.onDetachAudio!(m.id),
            } as MenuItem,
          ]
        : []),
      ...((p.onDetachAudio || p.onToggleAudioDetach || p.onAttachAudio) && f.clip.type === "audio" && tools.canAttachAudio
        ? [
            {
              label: "Attach to video",
              disabled: f.track.locked,
              onSelect: () =>
                p.onToggleAudioDetach
                  ? p.onToggleAudioDetach(m.id)
                  : p.onAttachAudio
                    ? p.onAttachAudio(m.id)
                    : p.onDetachAudio!(m.id),
            } as MenuItem,
          ]
        : []),
      // a blank scene before / after a Video 1 clip (for a title card, a pause, an end screen)
      ...(f.track.kind === "main" && p.onInsertBlank
        ? ([
            "separator",
            {
              label: "Add blank before",
              disabled: f.track.locked,
              onSelect: () => p.onInsertBlank!(f.index),
            },
            {
              label: "Add blank after",
              disabled: f.track.locked,
              onSelect: () => p.onInsertBlank!(f.index + 1),
            },
          ] as MenuItem[])
        : []),
    ];
  };

  const onDragOver = (e: React.DragEvent, trackId: string | null) => {
    const hasMedia = e.dataTransfer.types.includes(MEDIA_DRAG);
    const hasMeme = e.dataTransfer.types.includes(MEME_DRAG);
    const hasFiles = e.dataTransfer.types.includes("Files");
    const m = mediaDrag();
    const meme = memeDrag();
    if (!hasMedia && !hasMeme && !hasFiles && !m && !meme) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setOver(trackId ?? "any");
    const tr = trackId
      ? doc.tracks.find((q) => q.id === trackId)
      : (doc.tracks.find((q) => q.kind === "main") ?? doc.tracks[0]);
    if (!tr || !lanesRef.current) return;

    if (m && hasMedia) {
      const tl = timeAt(e.clientX);
      const onMain = tr.kind === "main" && m.kind !== "audio";
      const index = onMain ? mainIndexAt(tl) : undefined;
      const noClips = doc.tracks.every((q) => q.clips.length === 0);
      const at =
        onMain || noClips ? (noClips ? 0 : tl) : snapTo(tl, edges(), e.altKey);
      showLanding(
        `file:${m.id}:${tr.id}:${index ?? Math.round(at * fps)}`,
        () => {
          const l = dropLanding(
            doc,
            { media: m },
            { trackId: tr.id, at, index },
          );
          return (
            l && {
              doc: l.doc,
              trackId: l.trackId,
              start: l.start,
              length: l.length,
              hover: tr.id,
              name: m.fileName,
              drop: { trackId: tr.id, at, index },
            }
          );
        },
      );
    } else if (meme && (hasMeme || memeDrag())) {
      const tl = timeAt(e.clientX);
      const onMain = tr.kind === "main";
      const index = onMain ? mainIndexAt(tl) : undefined;
      const noClips = doc.tracks.every((q) => q.clips.length === 0);
      const at =
        onMain || noClips ? (noClips ? 0 : tl) : snapTo(tl, edges(), e.altKey);
      const fakeMedia: MediaLite = {
        id: meme.id,
        kind: "video",
        fileName: meme.title,
        duration: meme.duration,
        width: meme.width || 1280,
        height: meme.height || 720,
        fps: 25,
        hasAudio: true,
        suggestedKey: null,
        keyKind: null,
      };
      showLanding(
        `meme:${meme.id}:${tr.id}:${index ?? Math.round(at * fps)}`,
        () => {
          const l = dropLanding(
            doc,
            { media: fakeMedia },
            { trackId: tr.id, at, index },
          );
          return (
            l && {
              doc: l.doc,
              trackId: l.trackId,
              start: l.start,
              length: l.length,
              hover: tr.id,
              name: meme.title,
              drop: { trackId: tr.id, at, index },
            }
          );
        },
      );
    }
  };
  /** The drag left the timeline (not just moved onto a clip or another lane). */
  const onDragLeave = (e: React.DragEvent) => {
    if (lanesWrap.current?.contains(e.relatedTarget as Node | null)) return;
    setOver(null);
    setSnapAt(null);
    clearLanding();
  };
  const onDrop = (e: React.DragEvent, trackId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(null);
    setSnapAt(null);
    const l = landing;
    clearLanding();
    const id = e.dataTransfer.getData(MEDIA_DRAG);
    const memeData = e.dataTransfer.getData(MEME_DRAG);
    const activeMeme = memeDrag();
    const tl = lanesRef.current ? timeAt(e.clientX) : 0;
    const resolvedTrackId =
      trackId ??
      l?.drop?.trackId ??
      (doc.tracks.find((q) => q.kind === "main")?.id ?? null);
    const tr = resolvedTrackId
      ? doc.tracks.find((q) => q.id === resolvedTrackId)
      : null;

    if (memeData || activeMeme) {
      try {
        const item: MemeClipItem = memeData ? JSON.parse(memeData) : activeMeme;
        if (item && p.onDropMeme) {
          if (l?.drop && (l.hover === trackId || !trackId))
            p.onDropMeme(item, l.drop.trackId, l.drop.at ?? 0, l.drop.index);
          else
            p.onDropMeme(
              item,
              resolvedTrackId,
              tl,
              tr?.kind === "main" ? mainIndexAt(tl) : undefined,
            );
          return;
        }
      } catch {
        if (activeMeme && p.onDropMeme) {
          p.onDropMeme(
            activeMeme,
            resolvedTrackId,
            tl,
            tr?.kind === "main" ? mainIndexAt(tl) : undefined,
          );
          return;
        }
      }
    }

    if (id && l?.drop && (l.hover === trackId || !trackId))
      p.onDropMedia(id, l.drop.trackId, l.drop.at, l.drop.index);
    else if (id)
      p.onDropMedia(
        id,
        resolvedTrackId,
        tl,
        tr?.kind === "main" ? mainIndexAt(tl) : undefined,
      );
    else if (e.dataTransfer.files.length === 1)
      p.onDropFile(e.dataTransfer.files[0]);
  };

  const tool = (
    label: string,
    icon: IconName,
    onClick: ((e: React.MouseEvent<HTMLButtonElement>) => void) | null,
    title: string,
    extra?: ReactNode,
    expanded?: boolean,
    badge?: number | string,
    active?: boolean,
  ) => (
    <div className="relative">
      <button
        type="button"
        disabled={!onClick}
        onClick={onClick ?? undefined}
        title={title}
        aria-label={label}
        aria-haspopup={extra !== undefined ? "menu" : undefined}
        aria-expanded={extra !== undefined ? !!expanded : undefined}
        className={`relative flex size-7 items-center justify-center rounded-md transition-colors ${
          active
            ? "bg-primary-soft text-primary hover:bg-primary-soft/80"
            : "text-ink hover:bg-raised disabled:cursor-not-allowed disabled:text-muted disabled:opacity-40 disabled:hover:bg-transparent"
        }`}
      >
        <Icon name={icon} className="size-4" />
        {badge !== undefined && (
          <span className="absolute top-0 right-0 translate-x-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[8.5px] leading-none font-bold text-white shadow-xs pointer-events-none ring-1 ring-app">
            {badge}
          </span>
        )}
      </button>
      {extra}
    </div>
  );

  const selSound =
    !!sel &&
    (sel.clip.type === "video" || sel.clip.type === "audio") &&
    !!media[sel.clip.mediaId]?.hasAudio;
  const clipCount = doc.tracks.reduce((a, tr) => a + tr.clips.length, 0);
  const mainTr = doc.tracks.find((tr) => tr.kind === "main")!;
  // while dragging: the shadow (hidden once a cancelled file drag ends) and, on Video 1, where the other clips move to
  const shadow =
    landing && (!landing.key.startsWith("file:") || dragMedia) ? landing : null;
  const shadowLane = shadow
    ? doc.tracks.some((tr) => tr.id === shadow.trackId)
      ? shadow.trackId
      : shadow.hover
    : null;
  const sliding = !!shadow && shadow.trackId === mainTr.id;
  const slideTo = useMemo(() => {
    if (!sliding || !shadow) return null;
    const pv = shadow.doc.tracks.find((tr) => tr.kind === "main")!;
    const st = mainStarts(pv.clips);
    return new Map(pv.clips.map((c, i) => [c.id, st[i]]));
  }, [sliding, shadow]);

  return (
    <section
      aria-label="Timeline"
      className="panel flex h-full min-h-0 flex-col overflow-hidden"
    >
      <div className="flex items-center border-b border-line px-1.5 py-1">
        <div
          role="toolbar"
          aria-label="Editing tools"
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-0.5"
        >
          {tool(
            "Split",
            "split",
            tools.canSplit ? () => p.onSplit(tools.target!.clip.id, t) : null,
            "Split: Split at the playhead (S)",
          )}
          {tool(
            "Trim",
            "trim",
            tools.canTrim
              ? (e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setTrimMenu((o) =>
                    o ? null : { x: r.left, y: r.bottom + 4 },
                  );
                }
              : null,
            "Trim: Trim the clip under the playhead (Q / W)",
            trimMenu && tools.target ? (
              <ContextMenu
                x={trimMenu.x}
                y={trimMenu.y}
                label="Trim"
                onClose={() => setTrimMenu(null)}
                items={[
                  {
                    label: "Trim start to playhead",
                    shortcut: "Q",
                    onSelect: () =>
                      p.onTrim(
                        tools.target!.clip.id,
                        "in",
                        t,
                        `trimq:${tools.target!.clip.id}:${t}`,
                      ),
                  },
                  {
                    label: "Trim end to playhead",
                    shortcut: "W",
                    onSelect: () =>
                      p.onTrim(
                        tools.target!.clip.id,
                        "out",
                        t,
                        `trimw:${tools.target!.clip.id}:${t}`,
                      ),
                  },
                ]}
              />
            ) : null,
            !!trimMenu,
          )}
          {tool(
            "Delete",
            "trash",
            multiSelected.size > 1
              ? () => {
                  if (p.onDeleteMany) p.onDeleteMany(Array.from(multiSelected));
                  else multiSelected.forEach((id) => p.onDelete(id));
                  clearMulti();
                }
              : tools.canDelete
                ? () => p.onDelete(tools.selected!.clip.id)
                : null,
            multiSelected.size > 1
              ? `Delete ${multiSelected.size} selected clips (Del)`
              : "Delete: Delete the selected clip (Del)",
            undefined,
            undefined,
            multiSelected.size > 1 ? multiSelected.size : undefined,
          )}
          {tool(
            "Duplicate",
            "plus",
            multiSelected.size > 1
              ? () => {
                  multiSelected.forEach((id) => p.onDuplicate(id));
                }
              : tools.canDuplicate
                ? () => p.onDuplicate(tools.selected!.clip.id)
                : null,
            multiSelected.size > 1
              ? `Copy ${multiSelected.size} selected clips (⌘D)`
              : "Duplicate: Copy the selected clip (⌘D)",
            undefined,
            undefined,
            multiSelected.size > 1 ? multiSelected.size : undefined,
          )}
          {p.onCloseAllGaps &&
            tool(
              "Close gaps",
              "trim",
              p.onCloseAllGaps,
              "Tracks Gaps: Close all gaps across tracks",
            )}
          {tool(
            "Snapping",
            "magnet",
            () => setSnapping((s) => !s),
            snapping
              ? "Snapping is ON (hold Alt to bypass)"
              : "Snapping is OFF (click to enable)",
            undefined,
            undefined,
            undefined,
            snapping,
          )}
          {tool(
            "Crop",
            "crop",
            tools.canCrop && p.onCrop
              ? () => p.onCrop!(tools.selected!.clip.id)
              : null,
            tools.selected
              ? "Crop: Crop the selected clip on the preview"
              : "Select a video or picture first",
          )}
          {(() => {
            const v =
              tools.canSpeed || tools.canReverse ? tools.selected!.clip : null;
            return (
              <>
                {tool(
                  "Speed",
                  "speed",
                  tools.canSpeed && p.onPatchClip
                    ? (e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        setSpeedMenu((o) =>
                          o ? null : { x: r.left, y: r.bottom + 4 },
                        );
                      }
                    : null,
                  tools.selected
                    ? "Speed: Change the speed of the selected clip"
                    : "Select a video clip first",
                  speedMenu && v ? (
                    <ContextMenu
                      x={speedMenu.x}
                      y={speedMenu.y}
                      label="Speed"
                      onClose={() => setSpeedMenu(null)}
                      items={SPEED_MENU.map((x) => ({
                        label: `${x}×${x === 1 ? " (normal)" : x < 1 ? " slow motion" : ""}`,
                        onSelect: () =>
                          p.onPatchClip!(v.id, {
                            speed: x === 1 ? undefined : x,
                          }),
                      }))}
                    />
                  ) : null,
                  !!speedMenu,
                )}
                {tool(
                  "Reverse",
                  "reverse",
                  tools.canReverse && p.onPatchClip
                    ? () =>
                        p.onPatchClip!(v!.id, {
                          reversed: (v as { reversed?: boolean }).reversed
                            ? undefined
                            : true,
                        })
                    : null,
                  tools.selected
                    ? "Reverse: Play the selected clip backwards"
                    : "Select a video clip first",
                )}
                {tool(
                  "Freeze",
                  "freeze",
                  tools.canFreeze && p.onFreeze
                    ? () => p.onFreeze!(tools.target!.clip.id, t)
                    : null,
                  "Freeze: Hold the frame at the playhead (adds a 2-second picture on Video 1)",
                )}
              </>
            );
          })()}
          {(() => {
            const m = tools.canMask ? tools.selected!.clip : null;
            return tool(
              "Mask",
              "mask",
              tools.canMask && p.onMask
                ? (e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setMaskMenu((o) =>
                      o ? null : { x: r.left, y: r.bottom + 4 },
                    );
                  }
                : null,
              tools.selected
                ? "Mask: Give the selected clip a shape: rounded corners, a circle or a camera bubble"
                : "Select a video or picture first",
              maskMenu && m ? (
                <ContextMenu
                  x={maskMenu.x}
                  y={maskMenu.y}
                  label="Mask"
                  onClose={() => setMaskMenu(null)}
                  items={MASK_MENU.map((x) => ({
                    label: x.label,
                    onSelect: () => p.onMask!(m.id, x.kind),
                  }))}
                />
              ) : null,
              !!maskMenu,
            );
          })()}
          {tool(
            "Silences",
            "waveform",
            tools.canSilences
              ? () => p.onSilences(tools.selected!.clip.id)
              : null,
            tools.selected
              ? tools.canSilences
                ? "Silences: Find and cut the pauses in this clip's speech"
                : "This clip has no sound"
              : "Select a clip with speech first",
          )}
          {(() => {
            const isDetached = tools.isAudioDetached;
            const canToggle = tools.canAttachAudio || tools.canDetachAudio;
            const label = isDetached ? "Attach" : "Detach";
            const icon: IconName = isDetached ? "attachAudio" : "detachAudio";
            const tooltip = isDetached
              ? "Attach Audio: Re-attach and merge audio back into video"
              : tools.selected?.clip.type === "video"
                ? tools.canDetachAudio
                  ? "Detach Audio: Move audio to a dedicated audio track"
                  : "This video has no audio"
                : "Select a video or detached audio clip";

            const onClick =
              canToggle && (p.onToggleAudioDetach || p.onDetachAudio || p.onAttachAudio)
                ? () => {
                    const clipId = tools.selected!.clip.id;
                    if (p.onToggleAudioDetach) {
                      p.onToggleAudioDetach(clipId);
                    } else if (isDetached && p.onAttachAudio) {
                      p.onAttachAudio(clipId);
                    } else if (p.onDetachAudio) {
                      p.onDetachAudio(clipId);
                    }
                  }
                : null;

            return tool(
              label,
              icon,
              onClick,
              tooltip,
              undefined,
              undefined,
              undefined,
              isDetached,
            );
          })()}
          {(() => {
            const kc =
              tools.selected &&
              tools.selected.clip.type !== "audio" &&
              !tools.isLocked
                ? (tools.selected.clip as MotionClip)
                : null;
            return tool(
              "Keyframe",
              "keyframe",
              tools.canKeyframe && p.onKeyframe
                ? () => p.onKeyframe!(kc!.id, t, { kind: "toggle" })
                : null,
              !kc
                ? "Select a clip first, then add keyframes to move, zoom, turn or fade it"
                : !tools.canKeyframe
                  ? "Move the playhead onto the selected clip"
                  : tools.keyframeHere
                    ? "Remove the keyframe at the playhead"
                    : "Add a keyframe at the playhead (place, size, angle, opacity)",
            );
          })()}
          {tool(
            "Motion Tracking",
            "motionTrack",
            tools.selected?.clip.type === "video" && p.onMotionTracking
              ? () => p.onMotionTracking!(tools.selected!.clip.id)
              : null,
            tools.selected?.clip.type === "video"
              ? "Motion Tracking: Track points or areas and attach text, images, stickers, or blur"
              : "Select a video clip first to open Motion Tracking",
            undefined,
            undefined,
            undefined,
            p.isMotionTrackingOpen,
          )}
          {tool(
            "Marker",
            "marker",
            p.onAddMarker ? () => p.onAddMarker!(t) : null,
            "Marker: Add marker at playhead (M)",
          )}
        </div>
        <span className="ml-auto flex shrink-0 items-center gap-1 pl-2 text-xs text-muted">
          <span className="tabular-nums" data-testid="timeline-length">
            {empty
              ? ""
              : `${formatTenths(docDuration(doc))}${clipCount > 1 ? ` · ${clipCount} clips` : ""}`}
          </span>
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-md hover:bg-raised disabled:opacity-40"
            onClick={() => zoomStep(-1)}
            disabled={empty || pxPerSec <= minZoom + 0.1}
            aria-label="Zoom out the timeline"
            title="Zoom out (⌘ + scroll)"
          >
            −
          </button>
          <input
            type="range"
            className="w-20 accent-[var(--color-primary)]"
            min={0}
            max={100}
            step={1}
            value={scaleToSlider(pxPerSec, minZoom, maxZoom)}
            onChange={(e) =>
              zoomTo(sliderToScale(Number(e.target.value), minZoom, maxZoom))
            }
            disabled={empty}
            aria-label="Timeline zoom"
            aria-valuetext={`${Math.round(pxPerSec)} pixels per second`}
            title={`Timeline zoom: ${Math.round(pxPerSec)} px/s`}
            data-testid="timeline-zoom"
          />
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-md hover:bg-raised disabled:opacity-40"
            onClick={() => zoomStep(1)}
            disabled={empty || pxPerSec >= maxZoom - 0.1}
            aria-label="Zoom in the timeline"
            title="Zoom in (⌘ + scroll)"
          >
            +
          </button>
          <button
            type="button"
            className="rounded-md px-1.5 py-1 text-xs text-link hover:bg-raised disabled:opacity-40"
            onClick={fit}
            disabled={empty}
            title="Show the whole timeline"
          >
            Fit
          </button>
        </span>
      </div>

      <div className="relative flex min-h-0 flex-1">
        {/* track headers: their own column, so the sideways scrollbar runs under the lanes only */}
        <div
          className="relative z-40 flex shrink-0 flex-col border-r border-line bg-surface rounded-bl-xl"
          style={{ width: headW }}
        >
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Track names width"
            aria-valuemin={HEAD_MIN}
            aria-valuemax={HEAD_MAX}
            aria-valuenow={headW}
            tabIndex={0}
            data-testid="track-head-resizer"
            className="absolute inset-y-0 -right-1 z-40 w-2 cursor-col-resize hover:bg-primary/40 focus-visible:bg-primary/60"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const x0 = e.clientX;
              const w0 = headW;
              const move = (ev: PointerEvent) => setHead(w0 + ev.clientX - x0);
              const up = () => {
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
              };
              window.addEventListener("pointermove", move);
              window.addEventListener("pointerup", up);
            }}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              e.stopPropagation();
              setHead(headW + (e.key === "ArrowRight" ? 16 : -16));
            }}
          />
          <div className="flex h-6 shrink-0 items-center gap-0.5 border-b border-line bg-surface px-1">
            <TrackAdd
              icon="layers"
              label="Add an overlay track"
              hint="Add an overlay track (pictures, text, elements)"
              onClick={() => p.onAddTrack("overlay")}
            />
            <TrackAdd
              icon="audio"
              label="Add an audio track"
              hint="Add an audio track (music, voiceover)"
              onClick={() => p.onAddTrack("audio")}
            />
          </div>
          {/* scrolled by the lanes (a wheel here scrolls them too) */}
          <div
            ref={headsBody}
            data-testid="track-heads"
            className="min-h-0 flex-1 overflow-hidden"
            onWheel={(e) => {
              if (e.ctrlKey || e.metaKey) return;
              const k =
                e.deltaMode === 1
                  ? 16
                  : e.deltaMode === 2
                    ? (scroller.current?.clientHeight ?? 1)
                    : 1;
              scroller.current?.scrollBy({ top: e.deltaY * k });
            }}
          >
            {doc.tracks.map((tr) => {
              const isDraggingThis = trackDrag?.sourceId === tr.id;
              const isTargetBefore =
                trackDrag?.overTrackId === tr.id &&
                trackDrag.position === "before";
              const isTargetAfter =
                trackDrag?.overTrackId === tr.id &&
                trackDrag.position === "after";

              return (
                <div
                  key={tr.id}
                  data-track-head={tr.id}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setTrackMenu({
                      x: e.clientX,
                      y: e.clientY,
                      track: tr,
                    });
                  }}
                  className={`relative flex items-center gap-1 border-b border-line px-1.5 text-[0.6875rem] transition-colors ${
                    tr.kind === "main"
                      ? "h-16"
                      : tr.kind === "overlay"
                        ? "h-12"
                        : "h-9"
                  } ${isDraggingThis ? "opacity-40 bg-raised/50" : ""}`}
                >
                  {/* Drop indicator lines */}
                  {isTargetBefore && (
                    <div
                      aria-hidden="true"
                      className="absolute -top-0.5 inset-x-0 h-1 bg-primary z-50 rounded-full shadow-xs pointer-events-none"
                    />
                  )}
                  {isTargetAfter && (
                    <div
                      aria-hidden="true"
                      className="absolute -bottom-0.5 inset-x-0 h-1 bg-primary z-50 rounded-full shadow-xs pointer-events-none"
                    />
                  )}

                  {/* Drag Grip Handle (Overlay and Audio tracks only) */}
                  {tr.kind !== "main" ? (
                    <button
                      type="button"
                      data-track-drag-handle={tr.id}
                      aria-label={`Drag to reorder ${names[tr.id]}`}
                      title={`Drag to reorder ${names[tr.id]}`}
                      className="flex size-4 shrink-0 items-center justify-center rounded cursor-grab active:cursor-grabbing text-muted/60 hover:text-ink hover:bg-raised transition-colors focus:outline-none"
                      onPointerDown={(e) => onStartTrackDrag(e, tr.id)}
                    >
                      <Icon name="grip" className="size-3" />
                    </button>
                  ) : (
                    <div className="w-1 shrink-0" />
                  )}

                  <Icon
                    name={trackIcon(tr)}
                    className="size-3.5 shrink-0 text-muted"
                  />
                  <TrackName
                    name={names[tr.id]}
                    onRename={(n) => p.onSetTrack(tr.id, { name: n })}
                  />
                  {(tr.kind === "overlay" || tr.kind === "main") && (
                    <HeadBtn
                      on={"hidden" in tr && !!tr.hidden}
                      icon={"hidden" in tr && tr.hidden ? "eyeOff" : "eye"}
                      label={
                        "hidden" in tr && tr.hidden
                          ? `Show ${names[tr.id]}`
                          : `Hide ${names[tr.id]}`
                      }
                      onClick={() =>
                        p.onSetTrack(tr.id, {
                          hidden: !("hidden" in tr && tr.hidden),
                        })
                      }
                    />
                  )}
                  {(tr.kind === "main" ||
                    tr.kind === "audio" ||
                    (tr.kind === "overlay" &&
                      tr.clips.some((c) => c.type === "video"))) && (
                    <HeadBtn
                      on={"muted" in tr && !!tr.muted}
                      icon={"muted" in tr && tr.muted ? "mute" : "volume"}
                      label={
                        "muted" in tr && tr.muted
                          ? `Unmute ${names[tr.id]}`
                          : `Mute ${names[tr.id]}`
                      }
                      onClick={() =>
                        p.onSetTrack(tr.id, {
                          muted: !("muted" in tr && tr.muted),
                        })
                      }
                    />
                  )}
                  <HeadBtn
                    on={tr.locked}
                    icon="lock"
                    label={
                      tr.locked
                        ? `Unlock ${names[tr.id]}`
                        : `Lock ${names[tr.id]}`
                    }
                    onClick={() => p.onSetTrack(tr.id, { locked: !tr.locked })}
                  />
                  {tr.kind !== "main" && tr.clips.length === 0 && (
                    <HeadBtn
                      icon="close"
                      label={`Remove ${names[tr.id]}`}
                      onClick={() => p.onRemoveTrack(tr.id)}
                    />
                  )}
                </div>
              );
            })}
            {/* room for the lanes' sideways scrollbar, so both reach the bottom together */}
            {!empty && <div aria-hidden="true" className="h-4" />}
          </div>
        </div>

        <div
          ref={scroller}
          data-testid="timeline-scroller"
          className={`relative flex min-h-0 min-w-0 flex-1 ${empty ? "overflow-hidden" : "overflow-auto"}`}
        >
          {/* lanes */}
          <div className="relative min-w-0 flex-1">
            <div
              className="relative"
              style={{
                minWidth: "100%",
                width: empty ? "100%" : Math.max(lanesW, inner + 24),
              }}
            >
              <div
                data-ruler="true"
                data-testid="timeline-ruler"
                className={`sticky top-0 z-20 h-6 select-none border-b border-line bg-surface ${empty ? "" : "cursor-pointer"}`}
                role={empty ? undefined : "slider"}
                tabIndex={empty ? undefined : 0}
                aria-label={empty ? undefined : "Timeline position"}
                aria-valuemin={empty ? undefined : 0}
                aria-valuemax={
                  empty ? undefined : Math.round(total * 100) / 100
                }
                aria-valuenow={
                  empty ? undefined : Math.round(Math.min(total, t) * 100) / 100
                }
                aria-valuetext={
                  empty
                    ? undefined
                    : `${formatTime(Math.min(total, t))} of ${formatTime(total)}`
                }
                onKeyDown={(e) => {
                  if (empty) return;
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    e.stopPropagation();
                    p.onSeek(
                      Math.min(
                        total,
                        Math.max(
                          0,
                          t +
                            (e.key === "ArrowRight" ? 1 : -1) *
                              (e.shiftKey ? 5 : 1),
                        ),
                      ),
                    );
                  } else if (e.key === "Home" || e.key === "End") {
                    e.preventDefault();
                    e.stopPropagation();
                    p.onSeek(e.key === "Home" ? 0 : total);
                  }
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onContextMenu={(e) => {
                  e.preventDefault();
                  const target = e.currentTarget;
                  const rect = target.getBoundingClientRect();
                  const scrollLeft = scroller.current?.scrollLeft ?? 0;
                  const clickX = e.clientX - rect.left + scrollLeft - 12;
                  const tAtClick = Math.max(
                    0,
                    Math.min(total, clickX / pxPerSec),
                  );
                  setRulerMenu({ x: e.clientX, y: e.clientY, t: tAtClick });
                }}
              >
                <div className="relative mx-3 h-full">
                  {ticks.map((v) => (
                    <span
                      key={v}
                      aria-hidden="true"
                      className="absolute top-0 h-full whitespace-nowrap border-l border-line pl-1 text-[0.625rem] leading-6 text-muted"
                      style={{ left: x(v) }}
                    >
                      {tickLabel(v, step)}
                    </span>
                  ))}
                  {doc.markers?.map((m) => {
                    const colorMap: Record<string, string> = {
                      blue: "bg-sky-500 border-sky-300 text-sky-100",
                      red: "bg-rose-500 border-rose-300 text-rose-100",
                      green:
                        "bg-emerald-500 border-emerald-300 text-emerald-100",
                      amber: "bg-amber-500 border-amber-300 text-amber-100",
                      purple: "bg-purple-500 border-purple-300 text-purple-100",
                    };
                    const colorCls =
                      colorMap[m.color || "blue"] || colorMap.blue;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        data-marker-id={m.id}
                        aria-label={`Marker: ${m.label || "Untitled"} at ${formatTime(m.t)}`}
                        className="group absolute top-0 -translate-x-1/2 z-30 flex flex-col items-center cursor-pointer transition-transform hover:scale-110 focus:outline-none"
                        style={{ left: x(m.t) }}
                        title={`${m.label || "Marker"} (${formatTime(m.t)}) — Click to seek, double-click to edit`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          p.onSeek(m.t);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditingMarker(m);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setMarkerMenu({
                            id: m.id,
                            x: e.clientX,
                            y: e.clientY,
                          });
                        }}
                      >
                        <div
                          className={`size-3 rounded-xs border shadow-sm ${colorCls} flex items-center justify-center`}
                        >
                          <div className="size-1 rounded-full bg-white" />
                        </div>
                        <div
                          className={`h-2.5 w-0.5 ${colorCls.split(" ")[0]} opacity-80`}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div
                ref={lanesWrap}
                className="relative select-none"
                style={{ touchAction: "none" }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onContextMenu={onContextMenu}
                onDragOver={(e) => onDragOver(e, null)}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e, null)}
              >
                {doc.tracks.map((tr, ti) => {
                  const isTargetBefore =
                    trackDrag?.overTrackId === tr.id &&
                    trackDrag.position === "before";
                  const isTargetAfter =
                    trackDrag?.overTrackId === tr.id &&
                    trackDrag.position === "after";

                  return (
                    <div
                      key={tr.id}
                      data-lane={tr.id}
                      data-testid={`lane-${tr.kind}`}
                      className={`relative border-b border-line ${tr.kind === "main" ? "h-16" : tr.kind === "overlay" ? "h-12" : "h-9"} ${
                        over === tr.id ? "bg-primary-soft" : ""
                      } ${"hidden" in tr && tr.hidden ? "opacity-40" : ""}`}
                      onDragOver={(e) => onDragOver(e, tr.id)}
                      onDragLeave={onDragLeave}
                      onDrop={(e) => onDrop(e, tr.id)}
                    >
                      {/* Insertion indicator lines across lane */}
                      {isTargetBefore && (
                        <div
                          aria-hidden="true"
                          className="absolute -top-0.5 inset-x-0 h-1 bg-primary/70 z-50 rounded-full pointer-events-none"
                        />
                      )}
                      {isTargetAfter && (
                        <div
                          aria-hidden="true"
                          className="absolute -bottom-0.5 inset-x-0 h-1 bg-primary/70 z-50 rounded-full pointer-events-none"
                        />
                      )}
                      <div
                        ref={ti === 0 ? lanesRef : undefined}
                        className="relative mx-3 h-full"
                      >
                        {tr.clips.map((c, i) => {
                          const s = startOf(tr, i);
                          const left = x(
                            slideTo && tr.kind === "main" && c.id !== ghost?.id
                              ? (slideTo.get(c.id) ?? s)
                              : s,
                          );
                          const width = x(clipLength(c as AnyClip));
                          const isSelected = isSelectedClip(c.id);
                          const isGhost = ghost?.id === c.id;
                          // Windowing: cull distant clips outside visible window +/- 1 screen buffer (keep selected and ghosted clips)
                          const buffer = Math.max(800, view.width);
                          const inView =
                            isSelected ||
                            isGhost ||
                            (left + width >= view.left - buffer &&
                              left <= view.left + view.width + buffer);
                          if (!inView) return null;

                          return (
                            <ClipBlock
                              key={c.id}
                              clip={c as AnyClip}
                              media={
                                "mediaId" in c ? media[c.mediaId] : undefined
                              }
                              left={left}
                              sliding={
                                sliding &&
                                tr.kind === "main" &&
                                c.id !== ghost?.id
                              }
                              width={width}
                              selected={isSelected}
                              locked={tr.locked}
                              keysActive={isSelected && !tr.locked}
                              ghostDx={isGhost ? ghost.dx : 0}
                              highlights={
                                p.highlights?.clipId === c.id
                                  ? p.highlights.ranges
                                  : null
                              }
                              fps={fps}
                              view={view}
                              tileH={
                                tr.kind === "main"
                                  ? 56
                                  : tr.kind === "overlay"
                                    ? 40
                                    : 24
                              }
                              onToggle={() =>
                                p.onSelect(c.id === p.selectedId ? null : c.id)
                              }
                              onKeyMenu={(r) => {
                                p.onSelect(c.id);
                                setMenu({
                                  x: r.left + 12,
                                  y: r.bottom + 4,
                                  id: c.id,
                                  at: t,
                                });
                              }}
                              onKeyTrim={(edge, delta) => {
                                const targetT = (edge === "in" ? s : s + clipLength(c as AnyClip)) + delta;
                                if (edge === "in") {
                                  p.onSeek(Math.max(0, targetT + 1e-4));
                                } else {
                                  p.onSeek(Math.max(s, targetT - 1 / fps));
                                }
                                p.onTrim(
                                  c.id,
                                  edge,
                                  targetT,
                                  `trimkey:${c.id}:${edge}`,
                                );
                                if (edge === "in" && tr.kind === "main" && i === 0) {
                                  p.onPatchClip?.(c.id, { start: 0 });
                                  p.onSeek(0);
                                }
                                if (edge === "out" && tr.kind === "main" && i + 1 < tr.clips.length) {
                                  const nextClip = tr.clips[i + 1];
                                  p.onPatchClip?.(nextClip.id, { start: undefined });
                                }
                              }}
                              onCancelGeneration={p.onCancelGeneration}
                              onRetryGeneration={p.onRetryGeneration}
                            />
                          );
                        })}
                        {shadow && shadowLane === tr.id && (
                          <span
                            aria-hidden="true"
                            data-testid="drop-shadow"
                            className="pointer-events-none absolute inset-y-1 z-20 flex items-center overflow-hidden rounded-md border-2 border-dashed border-link bg-link/15 px-1.5 text-[0.625rem] font-medium text-ink"
                            style={{
                              left: x(shadow.start) + 1,
                              width: Math.max(4, x(shadow.length) - 1),
                            }}
                          >
                            <span className="truncate">
                              {shadowLane !== shadow.trackId
                                ? `${shadow.name} · new track`
                                : shadow.name}
                            </span>
                          </span>
                        )}
                        {/* the cuts on Video 1 and Overlay tracks: click to add or change the transition */}
                        {(tr.kind === "main" || tr.kind === "overlay") &&
                          p.onTransition &&
                          !shadow &&
                          !ghost &&
                          (() => {
                            if (tr.kind === "main") {
                              return (tr.clips as AnyClip[])
                                .slice(1)
                                .map((c, k) => {
                                  const i = k + 1;
                                  const ov = overlapAt(tr.clips, i);
                                  const has = !!(
                                    c as { transitionIn?: unknown }
                                  ).transitionIn;
                                  const on = p.selectedTransition === c.id;
                                  const kind = (
                                    c as { transitionIn?: { type: string } }
                                  ).transitionIn?.type;
                                  return (
                                    <button
                                      key={`tr-${c.id}`}
                                      type="button"
                                      data-testid="transition-marker"
                                      data-has={has ? "1" : "0"}
                                      aria-pressed={on}
                                      aria-label={
                                        has
                                          ? `Transition ${kind} before clip ${i + 1}. Change it.`
                                          : `Add a transition before clip ${i + 1}`
                                      }
                                      title={
                                        has
                                          ? `Transition: ${kind}`
                                          : "Add a transition"
                                      }
                                      onPointerDown={(e) => e.stopPropagation()}
                                      onClick={() => p.onTransition!(c.id)}
                                      className={`absolute top-1/2 z-20 flex size-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 items-center justify-center rounded-[3px] border-1 shadow ${on ? "border-white bg-primary" : has ? "border-white bg-fuchsia-500" : "border-white/70 bg-slate-800 opacity-70 hover:opacity-100"}`}
                                      style={{
                                        left: x(startOf(tr, i) + ov / 2),
                                      }}
                                    >
                                      <span
                                        aria-hidden="true"
                                        className="-rotate-45 text-[0.625rem] font-bold leading-none text-white"
                                      >
                                        {has ? "⇄" : "+"}
                                      </span>
                                    </button>
                                  );
                                });
                            }
                            // Overlay track cuts:
                            const sorted = [
                              ...(tr.clips as (AnyClip & { start: number })[]),
                            ].sort((a, b) => a.start - b.start);
                            return sorted.slice(1).map((c, k) => {
                              const prev = sorted[k];
                              const prevEnd = prev.start + clipLength(prev);
                              const has = !!(c as { transitionIn?: unknown })
                                .transitionIn;
                              const touchingOrOverlapping =
                                c.start <= prevEnd + 0.1 &&
                                c.start >= prev.start - 0.05;
                              if (!has && !touchingOrOverlapping) return null;
                              const on = p.selectedTransition === c.id;
                              const kind = (
                                c as { transitionIn?: { type: string } }
                              ).transitionIn?.type;
                              const trIn = (
                                c as { transitionIn?: ClipTransition }
                              ).transitionIn;
                              const ov = has
                                ? Math.max(
                                    0,
                                    Math.min(
                                      trIn?.duration ?? 0.5,
                                      prevEnd - c.start,
                                    ),
                                  )
                                : Math.max(0, prevEnd - c.start);
                              const markerX =
                                ov > 0 ? c.start + ov / 2 : c.start;
                              return (
                                <button
                                  key={`tr-${c.id}`}
                                  type="button"
                                  data-testid="transition-marker"
                                  data-has={has ? "1" : "0"}
                                  aria-pressed={on}
                                  aria-label={
                                    has
                                      ? `Transition ${kind ?? "crossfade"} before clip ${k + 2}. Change it.`
                                      : `Add a transition before clip ${k + 2}`
                                  }
                                  title={
                                    has
                                      ? `Transition: ${kind}`
                                      : "Add a transition"
                                  }
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={() => p.onTransition!(c.id)}
                                  className={`absolute top-1/2 z-20 flex size-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 items-center justify-center rounded-[3px] border-1 shadow ${on ? "border-white bg-primary" : has ? "border-white bg-fuchsia-500" : "border-white/70 bg-slate-800 opacity-70 hover:opacity-100"}`}
                                  style={{ left: x(markerX) }}
                                >
                                  <span
                                    aria-hidden="true"
                                    className="-rotate-45 text-[0.625rem] font-bold leading-none text-white"
                                  >
                                    {has ? "⇄" : "+"}
                                  </span>
                                </button>
                              );
                            });
                          })()}
                        {/* a blank scene: + at the end of Video 1 (then drag it anywhere on Video 1, like Google Vids) */}
                        {tr.kind === "main" &&
                          p.onInsertBlank &&
                          !shadow &&
                          !ghost &&
                          !tr.locked &&
                          tr.clips.length > 0 &&
                          (() => {
                            const n = tr.clips.length;
                            const end =
                              startOf(tr, n - 1) +
                              clipLength(tr.clips[n - 1] as AnyClip);
                            return (
                              <button
                                type="button"
                                data-testid="insert-blank"
                                aria-label="Add a blank scene or right-click to generate with AI"
                                title="Click to add blank scene • Right-click to generate with AI"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={() => p.onInsertBlank!(n)}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const rect = (
                                    e.currentTarget as HTMLElement
                                  ).getBoundingClientRect();
                                  setEmptyMenu({
                                    x: e.clientX,
                                    y: e.clientY,
                                    anchorX: rect.left + rect.width / 2,
                                    anchorY: rect.top,
                                    at: end,
                                    laneId: tr.id,
                                    plusIndex: n,
                                  });
                                }}
                                className="absolute top-1/2 z-20 flex size-5 -translate-y-1/2 items-center justify-center rounded-md border-1 border-control bg-surface text-muted shadow-sm hover:border-primary hover:bg-primary-soft hover:text-ink focus-visible:border-primary"
                                style={{ left: x(end) + 6 }}
                              >
                                <Icon
                                  name="plus"
                                  className="size-4"
                                  strokeWidth={2.5}
                                />
                              </button>
                            );
                          })()}
                      </div>
                    </div>
                  );
                })}
                {empty && (
                  <div
                    className={`absolute inset-x-4 inset-y-2 flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-solid text-center transition-colors ${over ? "border-primary bg-primary-soft" : "border-control bg-surface/90 shadow-xs"}`}
                    onDragOver={(e) => onDragOver(e, null)}
                    onDragLeave={() => setOver(null)}
                    onDrop={(e) => onDrop(e, null)}
                  >
                    <Icon name="film" className="size-7 text-muted" />
                    <p className="text-sm font-medium">
                      Drop media here to start editing
                    </p>
                    <p className="text-xs text-muted">
                      Videos, pictures and music, or{" "}
                      <button
                        type="button"
                        className="text-link underline"
                        onClick={p.onChoose}
                      >
                        choose a file
                      </button>
                    </p>
                  </div>
                )}
              </div>
              {/* marker vertical guides */}
              {doc.markers && doc.markers.length > 0 && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-3 z-10"
                  style={{ width: inner }}
                >
                  {doc.markers.map((m) => {
                    const guideColors: Record<string, string> = {
                      blue: "rgb(14, 165, 233)",
                      red: "rgb(244, 63, 94)",
                      green: "rgb(16, 185, 129)",
                      amber: "rgb(245, 158, 11)",
                      purple: "rgb(168, 85, 247)",
                    };
                    return (
                      <span
                        key={`guide-${m.id}`}
                        className="absolute inset-y-0 w-px -translate-x-1/2 opacity-35"
                        style={{
                          left: x(m.t),
                          backgroundColor:
                            guideColors[m.color || "blue"] || guideColors.blue,
                        }}
                      />
                    );
                  })}
                </div>
              )}
              {snapAt !== null && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-3 z-20"
                  style={{ width: inner }}
                >
                  <span
                    className="absolute inset-y-0 w-px bg-yellow-300"
                    style={{ left: x(snapAt) }}
                  />
                </div>
              )}
              {!empty && (
                <PlayheadNeedle
                  clock={p.clock}
                  total={total}
                  x={x}
                  inner={inner}
                />
              )}
              {activeTrimTip && (() => {
                let trackTop = 0;
                for (const tr of doc.tracks) {
                  if (tr.clips.some((c) => c.id === activeTrimTip.clipId)) break;
                  trackTop += tr.kind === "main" ? 64 : tr.kind === "overlay" ? 48 : 36;
                }
                const tipTop = trackTop - 28;
                return (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-3 z-30"
                    style={{ width: inner }}
                  >
                    <div
                      className="absolute z-50 -translate-x-1/2 flex items-center rounded-md bg-[#202124] px-2 py-0.5 text-xs font-semibold text-white shadow-lg ring-1 ring-white/10 tabular-nums pointer-events-none select-none"
                      style={{ left: x(activeTrimTip.time), top: tipTop }}
                    >
                      {activeTrimTip.duration.toFixed(1)}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label="Clip"
          items={menuItems(menu)}
          onClose={() => setMenu(null)}
        />
      )}
      {markerMenu && (
        <ContextMenu
          x={markerMenu.x}
          y={markerMenu.y}
          label="Marker"
          onClose={() => setMarkerMenu(null)}
          items={[
            {
              label: "Edit marker…",
              onSelect: () => {
                const m = doc.markers?.find((q) => q.id === markerMenu.id);
                if (m) setEditingMarker(m);
              },
            },
            {
              label: "Delete marker",
              shortcut: "Del",
              onSelect: () => p.onDeleteMarker?.(markerMenu.id),
            },
          ]}
        />
      )}
      {rulerMenu && (
        <ContextMenu
          x={rulerMenu.x}
          y={rulerMenu.y}
          label="Ruler"
          onClose={() => setRulerMenu(null)}
          items={[
            {
              label: `Add marker at ${formatTime(rulerMenu.t)}`,
              shortcut: "M",
              onSelect: () => p.onAddMarker?.(rulerMenu.t),
            },
            ...(p.onPaste
              ? [
                  {
                    label: "Paste at playhead",
                    shortcut: "⌘V",
                    onSelect: () => p.onPaste?.(),
                  },
                ]
              : []),
          ]}
        />
      )}
      {emptyMenu && (
        <ContextMenu
          x={emptyMenu.x}
          y={emptyMenu.y}
          label="Timeline"
          onClose={() => setEmptyMenu(null)}
          items={[
            ...(p.onOpenAiGen
              ? [
                  {
                    label: "✦ Generate AI with Gemini",
                    onSelect: () => {
                      const idx =
                        emptyMenu.plusIndex !== undefined
                          ? emptyMenu.plusIndex
                          : mainIndexAt(emptyMenu.at);
                      const anchorPoint =
                        emptyMenu.anchorX !== undefined &&
                        emptyMenu.anchorY !== undefined
                          ? { x: emptyMenu.anchorX, y: emptyMenu.anchorY }
                          : { x: emptyMenu.x, y: emptyMenu.y };
                      p.onOpenAiGen!({
                        anchor: anchorPoint,
                        target: {
                          trackId: emptyMenu.laneId || "main",
                          index: idx,
                          at: emptyMenu.at,
                          targetDescription: `Video 1 at ${formatTime(emptyMenu.at)}`,
                        },
                      });
                    },
                  },
                ]
              : []),
            ...(p.onPaste
              ? [
                  {
                    label: "Paste at playhead",
                    shortcut: "⌘V",
                    onSelect: () => p.onPaste?.(),
                  },
                ]
              : []),
            ...(p.onInsertBlank
              ? [
                  {
                    label: "Add blank scene here",
                    onSelect: () => {
                      const idx =
                        emptyMenu.plusIndex !== undefined
                          ? emptyMenu.plusIndex
                          : mainIndexAt(emptyMenu.at);
                      p.onInsertBlank!(idx);
                    },
                  },
                ]
              : []),
            ...(p.onCloseAllGaps
              ? [
                  {
                    label: "Close all gaps",
                    onSelect: () => p.onCloseAllGaps!(),
                  },
                ]
              : []),
            ...(p.onAddMarker
              ? [
                  {
                    label: `Add marker at ${formatTime(emptyMenu.at)}`,
                    shortcut: "M",
                    onSelect: () => p.onAddMarker!(emptyMenu.at),
                  },
                ]
              : []),
            { label: "Fit to timeline", onSelect: fit },
          ]}
        />
      )}
      {trackMenu && (
        <ContextMenu
          x={trackMenu.x}
          y={trackMenu.y}
          label="Track"
          onClose={() => setTrackMenu(null)}
          items={[
            ...(trackMenu.track.kind === "overlay" ||
            trackMenu.track.kind === "main"
              ? [
                  {
                    label:
                      "hidden" in trackMenu.track && trackMenu.track.hidden
                        ? `Show ${names[trackMenu.track.id] || "track"}`
                        : `Hide ${names[trackMenu.track.id] || "track"}`,
                    onSelect: () =>
                      p.onSetTrack(trackMenu.track.id, {
                        hidden: !(
                          "hidden" in trackMenu.track && trackMenu.track.hidden
                        ),
                      }),
                  },
                ]
              : []),
            ...(trackMenu.track.kind === "main" ||
            trackMenu.track.kind === "audio" ||
            (trackMenu.track.kind === "overlay" &&
              trackMenu.track.clips.some((c) => c.type === "video"))
              ? [
                  {
                    label:
                      "muted" in trackMenu.track && trackMenu.track.muted
                        ? `Unmute ${names[trackMenu.track.id] || "track"}`
                        : `Mute ${names[trackMenu.track.id] || "track"}`,
                    onSelect: () =>
                      p.onSetTrack(trackMenu.track.id, {
                        muted: !(
                          "muted" in trackMenu.track && trackMenu.track.muted
                        ),
                      }),
                  },
                ]
              : []),
            {
              label: trackMenu.track.locked
                ? `Unlock ${names[trackMenu.track.id] || "track"}`
                : `Lock ${names[trackMenu.track.id] || "track"}`,
              onSelect: () =>
                p.onSetTrack(trackMenu.track.id, {
                  locked: !trackMenu.track.locked,
                }),
            },
            ...(trackMenu.track.kind !== "main" &&
            trackMenu.track.clips.length === 0
              ? [
                  {
                    label: `Delete ${names[trackMenu.track.id] || "track"}`,
                    shortcut: "Del",
                    onSelect: () => p.onRemoveTrack(trackMenu.track.id),
                  },
                ]
              : []),
            {
              label: "Add video track",
              onSelect: () => p.onAddTrack("overlay"),
            },
            {
              label: "Add audio track",
              onSelect: () => p.onAddTrack("audio"),
            },
          ]}
        />
      )}
      {editingMarker && (
        <MarkerEditModal
          marker={editingMarker}
          onSave={(patch) => {
            p.onUpdateMarker?.(editingMarker.id, patch);
          }}
          onDelete={() => {
            p.onDeleteMarker?.(editingMarker.id);
          }}
          onClose={() => setEditingMarker(null)}
        />
      )}
    </section>
  );
}

/** "+ overlay" / "+ audio": a track icon with a small plus. */
function TrackAdd({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: IconName;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={hint}
      className="relative flex h-5 items-center gap-px rounded px-1 text-link hover:bg-raised"
    >
      <Icon name="plus" className="size-2.5" strokeWidth={3} />
      <Icon name={icon} className="size-3.5" />
    </button>
  );
}

function HeadBtn({
  icon,
  label,
  onClick,
  on,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  on?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={on === undefined ? undefined : on}
      className={`rounded p-0.5 hover:bg-raised ${on ? "text-warn-line" : "text-muted"}`}
    >
      <Icon name={icon} className="size-3.5" />
    </button>
  );
}

/** Chooses the track icon dynamically based on its kind and contents. */
function trackIcon(tr: Track): IconName {
  if (tr.kind === "audio") return "audio";
  if (tr.kind === "main") return "video";
  if (tr.clips.length === 0) return "layers";
  if ((tr.name ?? "").startsWith("Subtitles")) return "subtitles";
  const types = new Set(tr.clips.map((c) => c.type));
  if (types.size === 1) {
    const type = tr.clips[0]!.type;
    if (type === "video") return "video";
    if (type === "image") return "image";
    if (type === "text") return "text";
    if (type === "element") return "elements";
  }
  if (types.has("video")) return "video";
  if (types.has("image")) return "image";
  if (types.has("text")) return "text";
  if (types.has("element")) return "elements";
  return "layers";
}

const TONE: Record<AnyClip["type"], string> = {
  video: "",
  image: "border-2 border-violet-400 bg-tl-image",
  text: "border-2 border-amber-400 bg-tl-text",
  element: "border-2 border-pink-400 bg-tl-element",
  blank: "border-2 border-slate-400",
  audio: "border-2 border-teal-600 bg-tl-audio",
};
const KIND: Record<AnyClip["type"], string> = {
  video: "Video",
  image: "Picture",
  text: "Text",
  element: "Element",
  blank: "Blank",
  audio: "Sound",
};

/** The value once it has stopped changing for `ms` (the first one at once). */
function useSettled<T>(v: T, ms: number): T {
  const [settled, setSettled] = useState(v);
  useEffect(() => {
    if (Object.is(settled, v)) return;
    const t = setTimeout(() => setSettled(v), ms);
    return () => clearTimeout(t);
  }, [v, settled, ms]);
  return settled;
}

/** While a clip is dragged or trimmed: its cursor everywhere, and no text selection (globals.css `html[data-drag]`). */
function dragLook(kind: "move" | "trim" | null) {
  if (kind) document.documentElement.dataset.drag = kind;
  else delete document.documentElement.dataset.drag;
}

function ClipBlock(p: {
  clip: AnyClip;
  media?: MediaLite;
  left: number;
  width: number;
  selected: boolean;
  locked: boolean;
  ghostDx: number;
  /** Video 1 makes room for a dragged clip: glide to the new place */
  sliding?: boolean;
  /** its keyframe diamonds can be dragged / clicked (the selected clip) */
  keysActive?: boolean;
  highlights: Range[] | null;
  fps: number;
  /** the part of the lanes in view (px from the lanes' left): only those film frames are drawn */
  view: { left: number; width: number };
  /** the film frames' height (the clip's inside) */
  tileH: number;
  onToggle: () => void;
  onKeyMenu: (r: DOMRect) => void;
  onKeyTrim: (edge: "in" | "out", delta: number) => void;
  onCancelGeneration?: (clipId: string) => void;
  onRetryGeneration?: (clipId: string) => void;
}) {
  const c = p.clip;
  const len = clipLength(c);
  const perSec = p.width / Math.max(0.001, len);
  let bg: React.CSSProperties = {};
  // the strip shows source seconds: at 2× speed a second of source is half as wide
  const srcPerSec = perSec / (c.type === "video" ? (c.speed ?? 1) : 1);
  // a video: film frames at their own shape, side by side (see-through where its background is removed)
  const opsParam = useSettled(
    c.type === "video" ? filmOpsParam(c.ops) : "",
    400,
  );
  const m = p.media;
  // a file still uploading (lib/media/localMedia): the server has no filmstrip or waveform for it yet;
  // a frame taken in the browser stands in, then the server's follow
  const uploading = "mediaId" in c && notOnServer(c.mediaId);
  // (on its way to the server right now: its waveform / frames come after; a file kept only here shows none)
  const sending = "mediaId" in c && localItem(c.mediaId)?.state === "uploading";
  // a file from this computer: its film is made in the browser at once (with background removal on, the
  // server's keyed film is needed, once the file is there)
  const ownFilm = c.type === "video" && m && !opsParam ? localFilm(c.mediaId, m) : null;
  const film =
    c.type === "video" && m && m.width > 0 && m.duration > 0 && (ownFilm || !uploading)
      ? {
          url: ownFilm ?? `/api/videos/${c.mediaId}/film${opsParam ? `?ops=${opsParam}` : ""}`,
          tiles: filmTiles({
            width: p.width,
            from: p.view.left - p.left - p.view.width,
            to: p.view.left - p.left + 2 * p.view.width,
            tileH: p.tileH,
            media: m,
            srcIn: c.in,
            srcOut: c.out,
            srcPerSec,
            reversed: c.reversed,
          }),
        }
      : null;
  if (c.type === "video" && p.media) {
    bg = {
      backgroundImage: `url(${localThumb(c.mediaId) ?? `/api/videos/${c.mediaId}/thumb`})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
    };
  } else if (c.type === "audio" && p.media && !uploading)
    bg = {
      backgroundImage: `url(/api/videos/${c.mediaId}/wave)`,
      backgroundSize: `${p.media.duration * perSec}px 100%`,
      backgroundPosition: `${-c.in * perSec}px 0`,
    };
  else if (c.type === "image")
    bg = {
      backgroundImage: `url(${localSrc(c.mediaId) ?? `/api/videos/${c.mediaId}/source`})`,
      backgroundSize: "auto 100%",
      backgroundRepeat: "repeat-x",
    };
  const theme = useTheme();
  const isLight = theme === "light";
  // a blank scene: its own color (dynamically adapts between dark and light mode for default fill)
  if (c.type === "blank") {
    bg = { backgroundColor: resolveBlankFill(c.fill, isLight) };
  }
  const label =
    c.type === "text"
      ? c.text || "Text"
      : c.type === "element"
        ? elementName(c)
        : c.type === "blank"
          ? "Blank"
          : (p.media?.fileName ?? "Missing file");
  return (
    <div
      data-clip={c.id}
      data-testid="timeline-clip"
      data-type={c.type}
      data-selected={p.selected ? "true" : "false"}
      className={`absolute inset-y-1 overflow-hidden rounded-md isolate ${(c as any).generation ? "border-0 ring-0" : TONE[c.type]} ${p.selected && !(c as any).generation ? (isLight ? "z-10 ring-2 ring-[#1a73e8]" : "z-10 ring-2 ring-white shadow-[0_0_0_1px_rgba(0,0,0,0.85),0_0_12px_rgba(255,255,255,0.45)]") : ""} ${p.ghostDx ? "pointer-events-none z-30 scale-90 opacity-75 shadow-2xl ring-2 ring-link" : ""} ${p.sliding ? "transition-[left] duration-150 ease-out" : ""} ${p.locked ? "cursor-not-allowed" : "cursor-grab"}`}
      // (dragged on Video 1: it floats just above the lane, so the shadow where it lands stays in sight)
      style={{
        left: p.left + 1,
        width: Math.max(4, p.width - 1),
        transform: p.ghostDx
          ? `translate(${p.ghostDx}px, calc(-100% - 6px))`
          : undefined,
        ...bg,
      }}
      title={`${KIND[c.type]}: ${label} · ${formatTenths(len)}`}
    >
      <button
        type="button"
        className={`absolute inset-0 rounded-md ${c.type === "blank" ? "" : "bg-black/30"}`}
        aria-pressed={p.selected}
        aria-label={`${KIND[c.type]} clip: ${label}, ${formatTenths(len)}`}
        onClick={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            p.onToggle();
          } else if (
            e.key === "ContextMenu" ||
            (e.shiftKey && e.key === "F10")
          ) {
            e.preventDefault();
            p.onKeyMenu(e.currentTarget.getBoundingClientRect());
          }
        }}
      />
      {/* a sound still uploading has no waveform yet, a video no frame yet: a shimmer says it's coming */}
      {sending && ((c.type === "audio") || (c.type === "video" && !film && !localThumb(c.mediaId))) && (
        <span aria-hidden="true" className="skeleton pointer-events-none absolute inset-0 rounded-md bg-transparent" data-testid="clip-pending" />
      )}
      {film && (
        <span
          aria-hidden="true"
          data-testid="clip-film"
          data-src={film.url}
          className={`pointer-events-none absolute inset-0 overflow-hidden rounded-md ${opsParam ? "bg-checker-dark" : ""}`}
        >
          {film.tiles.map((f) => (
            <span
              key={f.key}
              data-testid="film-tile"
              className="absolute inset-y-0"
              style={{
                left: f.left,
                width: f.width,
                backgroundImage: `url(${film.url})`,
                backgroundSize: f.bgSize,
                backgroundPosition: f.bgPos,
                backgroundRepeat: "no-repeat",
              }}
            />
          ))}
        </span>
      )}
      {p.width > 44 && (
        <span className="pointer-events-none absolute bottom-0.5 right-3 rounded bg-black/70 px-1 text-[0.5rem] tabular-nums text-white">
          {formatTime(len)}
        </span>
      )}
      {c.type === "video" && (c.speed ?? 1) !== 1 && p.width > 30 && (
        <span
          className="pointer-events-none absolute left-3 top-0.5 rounded bg-amber-400 px-1 text-[0.625rem] font-bold text-black"
          data-testid="speed-badge"
        >
          {c.speed}×
        </span>
      )}
      {c.type === "video" && c.reversed && p.width > 30 && (
        <span
          className="pointer-events-none absolute right-3 top-0.5 rounded bg-fuchsia-400 px-1 text-[0.625rem] font-bold text-black"
          aria-hidden="true"
          title="Plays backwards"
        >
          ◀ rev
        </span>
      )}
      {p.highlights?.map((r, k) => {
        if (c.type !== "video" && c.type !== "audio") return null;
        const a = Math.max(c.in, r.start);
        const b = Math.min(c.out, r.end);
        if (b <= a) return null;
        return (
          <span
            key={k}
            aria-hidden="true"
            data-testid="silence-mark"
            className="pointer-events-none absolute inset-y-0 bg-red-500/55 ring-1 ring-red-300"
            style={{
              left: (a - c.in) * srcPerSec,
              width: Math.max(2, (b - a) * srcPerSec),
            }}
          />
        );
      })}
      {(c as any).generation &&
        ((c as any).generation.status === "generating" ||
          (c as any).generation.status === "queued" ||
          (c as any).generation.status === "failed") && (
          <span
            data-testid="generating-overlay"
            className={`absolute inset-0 z-20 flex size-full items-center gap-1.5 sm:gap-2 overflow-hidden rounded-md border-2 ${
              (c as any).generation.status === "failed"
                ? "border-rose-400 bg-rose-50/95"
                : (c as any).generation.mediaType === "audio" ||
                    c.type === "audio"
                  ? "border-teal-500 bg-white"
                  : "border-blue-500 bg-white"
            } p-1 shadow-sm text-slate-800 backdrop-blur-xs pointer-events-auto`}
          >
            {/* Left Gradient Thumbnail with Sparkle & Hover Cancel */}
            <span
              className="group relative flex size-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-tr from-sky-300 via-indigo-300 to-purple-300 shadow-xs cursor-pointer select-none"
              title={
                (c as any).generation.status === "failed"
                  ? "Dismiss failed clip"
                  : "Click to cancel generation"
              }
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                p.onCancelGeneration?.(c.id);
              }}
            >
              <svg
                className="size-3.5 text-purple-600 fill-purple-600 group-hover:hidden"
                viewBox="0 0 24 24"
              >
                <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
              </svg>
              <span className="hidden group-hover:flex items-center justify-center text-xs font-bold text-rose-600">
                ✕
              </span>
            </span>

            {/* Center: Status text & Progress Bar */}
            <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
              <span className="flex items-center justify-between text-[0.6875rem] font-semibold text-slate-800 leading-none">
                <span className="truncate">
                  {(c as any).generation.status === "failed"
                    ? "Failed: " +
                      ((c as any).generation.error || "Generation error")
                    : `Generating... (${Math.round((c as any).generation.progress ?? 0)}%)`}
                </span>
              </span>
              <span className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <span
                  className={`block h-full rounded-full transition-all duration-300 ${
                    (c as any).generation.status === "failed"
                      ? "bg-rose-500"
                      : "bg-blue-600"
                  }`}
                  style={{
                    width: `${Math.max(5, (c as any).generation.progress ?? 0)}%`,
                  }}
                />
              </span>
            </span>

            {/* Right Duration Badge */}
            {p.width > 90 && (
              <span className="shrink-0 rounded-md bg-slate-800/90 px-1.5 py-0.5 text-[0.625rem] font-semibold text-white tabular-nums shadow-xs">
                {clipLength(c).toFixed(1)}s
              </span>
            )}

            {/* Retry (failed / interrupted only) */}
            {(c as any).generation.status === "failed" &&
              p.onRetryGeneration && (
                <button
                  type="button"
                  aria-label="Retry generation"
                  title="Retry generation"
                  data-testid="retry-generation"
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    p.onRetryGeneration?.(c.id);
                  }}
                  className="flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-200/90 hover:bg-blue-600 hover:text-white text-slate-600 transition-colors cursor-pointer select-none"
                >
                  <Icon name="rotate" className="size-3" />
                </button>
              )}

            {/* Dedicated Always-Visible Close / Dismiss Button */}
            <button
              type="button"
              aria-label="Remove clip"
              title={
                (c as any).generation.status === "failed"
                  ? "Dismiss failed clip"
                  : "Cancel generation"
              }
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                p.onCancelGeneration?.(c.id);
              }}
              className="flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-200/90 hover:bg-rose-500 hover:text-white text-slate-600 transition-colors cursor-pointer select-none"
            >
              <Icon name="close" className="size-3" />
            </button>
          </span>
        )}
      {/* keyframes: amber diamonds on a line through the middle (the selected clip's can be dragged or clicked) */}
      {c.type !== "audio" &&
        (() => {
          const allKeys = keysOf(c);
          const vKeysWithIndex = allKeys
            .map((k, i) => ({ k, i }))
            .filter(({ k }) => k.t >= -1e-6 && k.t <= len + 1e-6);
          const kPos = (t: number) =>
            Math.min(Math.max(t * perSec, 7), p.width - 8);
          const firstPos =
            vKeysWithIndex.length >= 2 ? kPos(vKeysWithIndex[0].k.t) : 0;
          const lastPos =
            vKeysWithIndex.length >= 2
              ? kPos(vKeysWithIndex[vKeysWithIndex.length - 1].k.t)
              : 0;
          return (
            <>
              {vKeysWithIndex.length >= 2 && (
                <span
                  aria-hidden="true"
                  data-testid="keyframe-line"
                  className={`pointer-events-none absolute top-1/2 z-10 h-[2px] -translate-y-1/2 ${
                    p.keysActive ? "bg-amber-300" : "bg-amber-300/70"
                  }`}
                  style={{
                    left: firstPos,
                    width: Math.max(1, lastPos - firstPos),
                  }}
                />
              )}
              {vKeysWithIndex.map(({ k, i }) => (
                <span
                  key={i}
                  aria-hidden="true"
                  data-testid="keyframe"
                  data-key={p.keysActive ? i : undefined}
                  title={
                    p.keysActive
                      ? `Keyframe at ${formatTenths(k.t)} · drag to move it, click to go there, right-click to remove`
                      : undefined
                  }
                  className={`absolute top-1/2 z-20 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border border-black/50 ${
                    p.keysActive
                      ? "cursor-ew-resize bg-amber-300 hover:scale-125"
                      : "pointer-events-none bg-amber-300/70"
                  }`}
                  style={{ left: kPos(k.t) }}
                />
              ))}
            </>
          );
        })()}
      {!p.locked &&
        (["in", "out"] as const).map((edge) => (
          <span
            key={edge}
            data-edge={edge}
            data-id={c.id}
            role="slider"
            tabIndex={0}
            aria-label={`${edge === "in" ? "Start" : "End"} of ${label}`}
            aria-valuemin={0}
            aria-valuemax={Math.round(len * 100) / 100}
            aria-valuenow={edge === "in" ? 0 : Math.round(len * 100) / 100}
            aria-valuetext={`${edge === "in" ? "start" : "end"} edge, clip ${formatTenths(len)} long. Arrow keys move one frame, Shift one second.`}
            onKeyDown={(e) => {
              const d =
                e.key === "ArrowLeft" || e.key === "ArrowDown"
                  ? -1
                  : e.key === "ArrowRight" || e.key === "ArrowUp"
                    ? 1
                    : 0;
              if (!d) return;
              e.preventDefault();
              e.stopPropagation();
              p.onKeyTrim(edge, d * (e.shiftKey ? 1 : 1 / p.fps));
            }}
            style={{ touchAction: "none" }}
            className={`absolute inset-y-0 z-10 flex w-3.5 cursor-ew-resize items-center justify-center select-none bg-white/20 hover:bg-link focus-visible:bg-link group/handle transition-colors ${edge === "in" ? "left-0 rounded-l-md" : "right-0 rounded-r-md"}`}
          >
            <span aria-hidden="true" className="flex items-center justify-center pointer-events-none">
              <svg className="w-3.5 h-4.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" viewBox="0 0 14 16" fill="none">
                <rect x="6" y="2" width="2" height="12" rx="1" fill="white" />
                <path d="M4 5L1 8L4 11Z" fill="white" stroke="#1f2937" strokeWidth="0.75" />
                <path d="M10 5L13 8L10 11Z" fill="white" stroke="#1f2937" strokeWidth="0.75" />
              </svg>
            </span>
          </span>
        ))}
      {p.selected && (
        <span
          aria-hidden="true"
          data-selection-ring="true"
          className={`pointer-events-none absolute inset-0 z-20 rounded-md ${
            isLight
              ? "ring-2 ring-inset ring-[#1a73e8]"
              : "ring-2 ring-inset ring-white shadow-[0_0_0_1px_rgba(0,0,0,0.85),0_0_10px_rgba(255,255,255,0.45)]"
          }`}
        />
      )}
    </div>
  );
}

function MarkerEditModal({
  marker,
  onSave,
  onDelete,
  onClose,
}: {
  marker: TimelineMarker;
  onSave: (patch: { label?: string; color?: TimelineMarker["color"] }) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(marker.label || "");
  const [color, setColor] = useState<TimelineMarker["color"]>(
    marker.color || "blue",
  );

  const colors: { key: TimelineMarker["color"]; name: string; bg: string }[] = [
    { key: "blue", name: "Blue", bg: "bg-sky-500" },
    { key: "red", name: "Red", bg: "bg-rose-500" },
    { key: "green", name: "Green", bg: "bg-emerald-500" },
    { key: "amber", name: "Amber", bg: "bg-amber-500" },
    { key: "purple", name: "Purple", bg: "bg-purple-500" },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="marker-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-line bg-surface p-5 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (
            e.key === "Enter" &&
            (e.metaKey || e.ctrlKey || e.target instanceof HTMLInputElement)
          ) {
            onSave({ label: label.trim() || undefined, color });
            onClose();
          }
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`size-3 rounded-full ${colors.find((c) => c.key === color)?.bg || "bg-sky-500"}`}
            />
            <h3
              id="marker-dialog-title"
              className="text-sm font-semibold text-ink"
            >
              Edit Marker
            </h3>
          </div>
          <span className="text-xs font-mono text-muted">
            {formatTime(marker.t)}
          </span>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted">
            Marker Note / Name
          </label>
          <input
            autoFocus
            type="text"
            className="field w-full h-8 px-2.5 text-xs text-ink"
            placeholder="e.g. Beat drop, Intro cut, Title card..."
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted">Color</label>
          <div className="flex items-center gap-2.5">
            {colors.map((c) => (
              <button
                key={c.key}
                type="button"
                aria-label={c.name}
                onClick={() => setColor(c.key)}
                className={`size-7 rounded-full ${c.bg} transition-all flex items-center justify-center cursor-pointer ${
                  color === c.key
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-surface scale-110"
                    : "opacity-75 hover:opacity-100"
                }`}
              >
                {color === c.key && (
                  <Icon
                    name="check"
                    className="size-3.5 text-white"
                    strokeWidth={2.5}
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-line">
          <button
            type="button"
            className="text-xs text-rose-400 hover:text-rose-300 px-2 py-1 rounded hover:bg-rose-500/10 transition-colors cursor-pointer"
            onClick={() => {
              onDelete();
              onClose();
            }}
          >
            Delete
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-secondary h-7 px-3 text-xs"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary h-7 px-3 text-xs"
              onClick={() => {
                onSave({ label: label.trim() || undefined, color });
                onClose();
              }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
