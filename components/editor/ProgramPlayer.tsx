"use client";

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { clipLength, docDuration, findClip, LOGO_MAX_SIZE, mainStarts, mainTrack, type AnyClip, type AudioPlaced, type BlankClip, type ElementClip, type MediaLite, type TextClip, type TimelineDoc, type Transform, type VideoClip, type Watermark, watermarkPad, watermarkRect } from "@/lib/edit/doc";
import { drawLogoBadge, logoState } from "@/lib/player/logo";
import { ELEMENT_DRAG, elementDrag, MEDIA_DRAG, mediaDrag, MEME_DRAG, memeDrag, TEXT_DRAG, textDrag, useElementDrag, useMediaDrag, useMemeDrag, useTextDrag } from "@/lib/editor/mediaDrag";
import type { Clock } from "@/lib/editor/clock";
import { hexToRgb, LiveKeyRenderer, type LiveKeyParams } from "@/lib/editor/liveKey";
import { GlLook } from "@/lib/player/glLook";
import { clampCrop, colorMatrix, CROP_MAX, cropRect, isIdentity, maskRadius, rotationOf, vignetteOf } from "@/lib/player/look";
import { formatTime } from "@/lib/format";
import { animState, BLUR, typedCount } from "@/lib/player/anim";
import { cropViewRect, fadeAlpha, logoTransform, motionRect, nextZoom, placeRect, PREVIEW_ZOOMS, sideScale, workScale, type Rect } from "@/lib/player/layout";
import { pointerAngle, rotateCursor, turnAngle } from "@/lib/player/rotate";
import { ContextMenu, useMenuButton, type MenuItem } from "@/components/ui/ContextMenu";
import { hasKeys, motionAt, motionSpan, textRenderTransform, transformAt, type MotionClip } from "@/lib/edit/keyframes";
import { textAnchor } from "@/lib/text/layout";
import { setLevel, silence, soundLevel } from "@/lib/player/sound";
import { assignSlots, IDLE_UNLOAD_MS, MAX_VIDEO_ELEMENTS, type Slot, type Want } from "@/lib/player/videoPool";
import { fillFromBorder, patchRect } from "@/lib/player/patches";
import { docTransitions, docTransitionsAt, mainTransitionAt, mainTransitions } from "@/lib/player/transitions";
import { captionProgress, drawText, letterCount, textLayout } from "@/lib/text/render";
import { drawElement, movesByItself } from "@/lib/elements/draw";
import { elementRect, stretchElement, type Edge } from "@/lib/elements/geometry";
import { elementName } from "@/lib/elements/catalog";
import { DUCK_LEVEL, inSpeech } from "@/lib/audio/ducking";
import type { Range } from "@/lib/edit/timeline";
import type { Bg, BgMedia } from "./BackgroundSwatches";
import type { PlayerApi } from "./PreviewPane";
import { VideoControls } from "./VideoControls";
import { readPreviewMuted, writePreviewMuted } from "@/lib/editor/previewSound";
import { localSrc, localThumb } from "@/lib/media/localMedia";
import { Icon } from "@/components/ui/Icon";
import { cornerPin, cornerResize, pivotFromPointer, pivotOnCanvas, radiusDotLocal, radiusFromPointer, sideStretch, skewDrag, textSideStretch, xyForCenter, type HandleBox } from "@/lib/player/handles";
import { boxQuad, hasCorners, quadOk, type BoxLook, type CornerKey, type Corners, type Pt, type Quad } from "@/lib/player/quad";
import { drawWarpMesh, GlWarp } from "@/lib/player/glWarp";
import { drawBackdrop } from "@/lib/backdrops";
import { trackingAt, type TrackingPoint, type BlurAttachment } from "@/lib/tracking/types";
import { findTrackingAttachmentForClip, evaluateAttachmentTransform } from "@/lib/tracking/attach";

const BG_CLASS: Record<Exclude<Bg, "custom">, string> = { checker: "bg-checker", white: "bg-white", black: "bg-[#1f1f1f]", image: "bg-checker", video: "bg-checker" };
/** Preview resolution (the export uses the full canvas size). */
const MAX_SIDE = 1280;

type Layer = { clip: AnyClip; start: number; trackIndex: number };

/** The clips visible at time t, bottom to top: main track, then overlay tracks from the lowest up. */
export function layersAt(doc: TimelineDoc, t: number): Layer[] {
  const out: Layer[] = [];
  const main = mainTrack(doc);
  const starts = mainStarts(main.clips);
  main.clips.forEach((c, i) => {
    const s = starts[i];
    const len = clipLength(c);
    // Allow boundary tolerance at start (-1e-4) and at the track end so the final frame remains visible.
    // If the first clip has a leading start offset (e.g. during in-point trimming before ripple),
    // and t is at or before s, keep clip 0 visible so the frame being trimmed never drops out.
    const isLeadingTrim = i === 0 && s > 0 && t <= s + 1e-4;
    const isAtEnd = i === main.clips.length - 1 && t <= s + len + 1e-5;
    if (isLeadingTrim || (t >= s - 1e-4 && (isAtEnd || t < s + len - 1e-6))) {
      out.push({ clip: c, start: s, trackIndex: doc.tracks.indexOf(main) });
    }
  });
  for (let ti = doc.tracks.length - 1; ti >= 0; ti--) {
    const tr = doc.tracks[ti];
    if (tr.kind !== "overlay" || tr.hidden) continue;
    for (const c of tr.clips) {
      if (t >= c.start - 1e-4 && t <= c.start + clipLength(c) + 1e-6) {
        out.push({ clip: c, start: c.start, trackIndex: ti });
      }
    }
  }
  return out;
}

/** A sound the player plays with its own <audio>: a sound clip, or the cleaned sound of a video clip. */
type Sound = { id: string; src: string; in: number; start: number; len: number; volume: number; fadeIn: number; fadeOut: number; duck?: boolean; rate?: number };
const cleanUrl = (mediaId: string, level: string) => `/api/videos/${mediaId}/clean-audio?level=${level}`;

/**
 * Sounds with their own <audio> element: sound clips on audio tracks that
 * aren't muted, and video clips with "Remove background noise" (their video
 * plays muted; the cleaned sound — the same filter as the export — plays instead).
 */
function soundClips(doc: TimelineDoc, media: Record<string, MediaLite>): Sound[] {
  const out: Sound[] = [];
  for (const t of doc.tracks)
    if (t.kind === "audio" && !t.muted)
      for (const c of t.clips as AudioPlaced[]) out.push({ id: c.id, src: c.denoise ? cleanUrl(c.mediaId, c.denoise) : (localSrc(c.mediaId) ?? sourceUrl(c.mediaId)), in: c.in, start: c.start, len: clipLength(c), volume: c.volume, fadeIn: c.fadeIn, fadeOut: c.fadeOut, duck: c.duck });
  const main = mainTrack(doc);
  const starts = mainStarts(main.clips);
  for (const t of doc.tracks) {
    if (t.kind === "audio" || (t.kind === "overlay" && (t.hidden || t.muted)) || (t.kind === "main" && t.muted)) continue;
    t.clips.forEach((c, i) => {
      if (c.type !== "video" || !(c as VideoClip).denoise || (c as VideoClip).muted || !media[c.mediaId]?.hasAudio) return;
      const v = c as VideoClip;
      out.push({ id: `clean:${v.id}`, src: cleanUrl(v.mediaId, v.denoise!), in: v.in, start: t.kind === "main" ? starts[i] : (c as unknown as { start: number }).start, len: clipLength(v), volume: v.volume, fadeIn: v.fadeIn, fadeOut: v.fadeOut, rate: v.speed ?? 1 });
    });
  }
  return out;
}

/** Where a clip is on the canvas (project pixels) at `into` seconds into it, with its animation. */
type RRect = Rect & { rot: number };
function clipRect(c: AnyClip, into: number, W: number, H: number, media: Record<string, MediaLite>, uncropped?: "crop" | "patch"): RRect | null {
  // (a blank scene is the whole frame: it's picked on the timeline, not here)
  if (c.type === "audio" || c.type === "blank") return null;
  if (c.type === "element") {
    // (its own box: lib/elements/geometry; it turns like a picture)
    const er = elementRect(c, into, W, H);
    const a = animState(into, clipLength(c), c.anim);
    return { x: er.x + a.dx * W, y: er.y + a.dy * H, w: er.w, h: er.h, rot: er.rot };
  }
  let r: Rect | null = null;
  if (c.type === "text") {
    const tp = textPlacement(c, into, W, H);
    const lay = textLayout(tp.clip, W, H);
    if (!lay) return null;
    const pad = (lay.lines[0]?.size ?? 20) * 0.15;
    r = { x: tp.ox + tp.k * (lay.bounds.x - pad), y: tp.oy + tp.k * (lay.bounds.y - pad), w: tp.k * (lay.bounds.w + pad * 2), h: tp.k * (lay.bounds.h + pad * 2) };
  } else {
    const m = media[c.mediaId];
    const w = m?.width || W;
    const h = m?.height || H;
    // crop mode: the still, whole picture (no animation: it stands still while you crop)
    const ct = hasKeys(c) ? transformAt(c, into) : c.transform;
    if (uncropped === "crop") return { ...cropViewRect(w, h, W, H, ct), rot: rotationOf(ct) };
    if (uncropped === "patch") r = fullRect(w, h, W, H, ct);
    else {
      // keyframes move it (lib/player/layout motionRect)
      const mr = motionRect(w, h, W, H, c, into);
      r = mr;
      const a = "anim" in c ? animState(into, clipLength(c), c.anim) : null;
      return a ? { x: mr.x + a.dx * W, y: mr.y + a.dy * H, w: mr.w, h: mr.h, rot: mr.rot } : { x: mr.x, y: mr.y, w: mr.w, h: mr.h, rot: mr.rot };
    }
  }
  const rot = rotationOf(hasKeys(c) ? transformAt(c, into) : c.transform);
  const a = "anim" in c ? animState(into, clipLength(c), c.anim) : null;
  return a ? { ...r, x: r.x + a.dx * W, y: r.y + a.dy * H, rot } : { ...r, rot };
}

/**
 * A text clip's picture and where it goes: a moving text is drawn once at its
 * biggest, then scaled around its anchor and moved (the export does the same).
 * Map a point of the drawn text with `ox + k·x`, `oy + k·y`.
 */
function textPlacement(c: TextClip, into: number, W: number, H: number): { clip: TextClip; k: number; ox: number; oy: number; qx: number; qy: number; opacity: number } {
  const m = motionAt(c, into);
  const rt = textRenderTransform(c);
  const drawn = rt === c.transform ? c : { ...c, transform: rt };
  const a = textAnchor(c.style.preset, W, H);
  // (q: the drawn text's anchor, the point it grows from)
  if (!hasKeys(c) || !motionSpan(c).moving) return { clip: drawn, k: 1, ox: 0, oy: 0, qx: a.x + rt.x * W, qy: a.y + rt.y * H, opacity: m.opacity };
  const k = m.scale / rt.scale;
  return { clip: drawn, k, ox: a.x * (1 - k) + m.x * W, oy: a.y * (1 - k) + m.y * H, qx: a.x, qy: a.y, opacity: m.opacity };
}

/**
 * The whole (uncropped) picture at the size the cropped part is shown: for
 * crop mode, where the full frame shows and the crop box is drawn over it.
 */
function fullRect(w: number, h: number, W: number, H: number, t: Transform): Rect {
  const r = placeRect(w, h, W, H, t);
  const k = t.crop ?? { l: 0, t: 0, r: 0, b: 0 };
  const fw = r.w / Math.max(0.05, 1 - k.l - k.r);
  const fh = r.h / Math.max(0.05, 1 - k.t - k.b);
  // the crop box's middle stays where the cropped picture is (turned with it)
  const ox = ((k.l - k.r) / 2) * fw;
  const oy = ((k.t - k.b) / 2) * fh;
  const a = (rotationOf(t) * Math.PI) / 180;
  const cx = r.x + r.w / 2 - (ox * Math.cos(a) - oy * Math.sin(a));
  const cy = r.y + r.h / 2 - (ox * Math.sin(a) + oy * Math.cos(a));
  return { x: cx - fw / 2, y: cy - fh / 2, w: fw, h: fh };
}

/** A handle on screen → the picture's own edge (a flipped picture shows its left edge on the right). */
function sourceEdge(ed: string, t: Transform): string {
  if (ed === "move") return ed;
  return [...ed].map((ch) => (t.flipX && ch === "l" ? "r" : t.flipX && ch === "r" ? "l" : t.flipY && ch === "t" ? "b" : t.flipY && ch === "b" ? "t" : ch)).join("");
}

const SNAP = 0.012;
/** The Brand Kit logo snaps to its four corner spots within this share of the canvas. */
const LOGO_SNAP = 0.03;
const NO_T: Transform = { fit: "fit", x: 0, y: 0, scale: 1 };
type Drag = {
  id: string;
  kind: "move" | "size" | "side" | "rotate" | "stretch" | "crop" | "patch" | "logo" | "corner" | "skew" | "perspective" | "pivot" | "radius" | "trackingPoint" | "trackingBox";
  edge?: string;
  corner?: CornerKey;
  box?: { x: number; y: number; w: number; h: number };
  patchId?: string;
  trackingPointId?: string;
  trackInit?: { x: number; y: number; box: { w: number; h: number } };
  wm0?: Watermark;
  px: number;
  py: number;
  t0: Transform;
  rect: RRect;
  group: string;
  moved: boolean;
  stage: DOMRect;
  /** turning: the pointer's angle from the middle when grabbed */
  a0?: number;
  hBox?: HandleBox;
  look?: BoxLook;
  lastX?: number;
  lastY?: number;
  lastW?: number;
  lastH?: number;
};

/** Every video clip on picture tracks (each gets its own <video> element). */
function videoClips(doc: TimelineDoc): VideoClip[] {
  const out: VideoClip[] = [];
  for (const t of doc.tracks) if (t.kind !== "audio") for (const c of t.clips) if (c.type === "video") out.push(c as VideoClip);
  return out;
}

/**
 * Video clips to get ready early, per picture track: the next clip after time
 * t, and the next one from another file (a new file takes longest to load).
 */
function upcomingVideos(doc: TimelineDoc, t: number, ahead: number): { clip: VideoClip; start: number }[] {
  const out: { clip: VideoClip; start: number }[] = [];
  for (const tr of doc.tracks) {
    if (tr.kind === "audio" || (tr.kind === "overlay" && tr.hidden)) continue;
    const starts = tr.kind === "main" ? mainStarts(tr.clips) : tr.clips.map((c) => (c as { start: number }).start);
    const order = tr.clips.map((c, i) => ({ c, s: starts[i] })).filter((x) => x.c.type === "video" && x.s <= t + ahead && x.s + clipLength(x.c) > t - 1e-6);
    order.sort((a, b) => a.s - b.s);
    const now = order.find((x) => x.s <= t + 1e-6);
    const later = order.filter((x) => x.s > t + 1e-6);
    if (later[0]) out.push({ clip: later[0].c as VideoClip, start: later[0].s });
    const current = (now?.c ?? later[0]?.c) as VideoClip | undefined;
    const other = later.find((x) => (x.c as VideoClip).mediaId !== current?.mediaId);
    if (other && other !== later[0]) out.push({ clip: other.c as VideoClip, start: other.s });
  }
  return out;
}

const sourceUrl = (mediaId: string) => `/api/videos/${mediaId}/play`;
const proxyUrl = (mediaId: string) => `/api/videos/${mediaId}/proxy`;

/** A blurred copy of the picture (top of a packed AI video) into ctx. Safari has no canvas filters: shrink and grow instead. */
function blurInto(ctx: CanvasRenderingContext2D, el: HTMLVideoElement, w: number, h: number, sigma: number) {
  if (typeof ctx.filter === "string") {
    ctx.save();
    ctx.filter = `blur(${Math.max(1, sigma).toFixed(1)}px)`;
    ctx.drawImage(el, 0, 0, w, h, 0, 0, w, h);
    ctx.restore();
    return;
  }
  const f = Math.max(2, sigma / 1.5);
  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(w / f));
  small.height = Math.max(1, Math.round(h / f));
  small.getContext("2d")!.drawImage(el, 0, 0, w, h, 0, 0, small.width, small.height);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(small, 0, 0, w, h);
}
/** How long a clip may hold the picture (last frame stays) while its video seeks. */
const HOLD_MS = 1200;

/**
 * The program monitor: plays the whole timeline on the project canvas — the
 * main track back to back, overlays on top, each video clip with its own
 * background removal (live GPU key). Times are timeline seconds.
 */
export function ProgramPlayer(p: {
  doc: TimelineDoc;
  media: Record<string, MediaLite>;
  clock: Clock;
  playerRef?: React.RefObject<PlayerApi | null>;
  /** Live key settings for a video clip, or null (no removal). */
  liveOf: (clip: VideoClip) => LiveKeyParams | null;
  /** AI Removal's playing previews (picture over mask), by clip id. */
  packedOf?: (clip: VideoClip) => string | null;
  /** "Blur background" strength of a clip (source pixels), or null. */
  blurOf?: (clip: VideoClip) => number | null;
  /** A derived file to play instead of the upload (the stabilized copy), or null. */
  sourceOf?: (clip: VideoClip) => string | null;
  /** Where someone speaks on Video 1 (timeline seconds): ducked sound clips go quieter there. */
  speech?: Range[];
  /** The backwards copy of a reversed clip (when it's ready), or null. */
  reversedOf?: (clip: VideoClip) => string | null;
  /** Use lightweight 720p proxies for playback and scrubbing. */
  proxyMode?: boolean;
  /** Changes when an imported file becomes playable from this computer (lib/media/localMedia). */
  localVersion?: number;
  fit?: boolean;
  bg: Bg;
  custom: string;
  bgMedia?: BgMedia;
  /** Controls at the start of the toolbar row (the Program / This clip switch, preview background). */
  toolbar?: React.ReactNode;
  /** The selected clip gets a box on the preview: drag to move, corners to resize. */
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** A drag / nudge on the preview: only the fields it changes (the clip's keyframes may take them). */
  onTransform?: (clipId: string, patch: Partial<Transform>, group: string) => void;
  /** Double-click on a text (or an element with words): edit its words. */
  onEditText?: (clipId: string) => void;
  /** An element's side dragged: its new shape (width ÷ height), size and place. */
  onStretch?: (clipId: string, next: { aspect: number; x: number; y: number; scale: number }, group: string) => void;
  /** Corner radius dragged on the preview (share of the shorter side, 0-0.5). */
  onRadius?: (clipId: string, share: number, group: string) => void;
  /** Crop mode for this clip: the full frame shows and the crop box can be dragged. */
  cropId?: string | null;
  onCropDone?: () => void;
  /** Watermark box being placed on a clip (drag and resize it over the frame). */
  patchEdit?: { clipId: string; patchId: string } | null;
  onPatchBox?: (clipId: string, patchId: string, box: { x: number; y: number; w: number; h: number }, group: string) => void;
  onPatchDone?: () => void;
  /** The Brand Kit logo is selected: a box on it (drag to move, corners to resize). */
  logoSelected?: boolean;
  onSelectLogo?: (on: boolean) => void;
  onWatermark?: (w: Watermark, group: string) => void;
  /** Something dropped on the picture at `pt` (shares of the canvas); true = it was used. */
  onDropAt?: (pt: { x: number; y: number }, dt: DataTransfer) => boolean;
  /** Motion tracking overlays and interactions */
  trackingPoints?: TrackingPoint[];
  activeTrackingPointId?: string | null;
  isTrackingOpen?: boolean;
  isTracking?: boolean;
  trackingProgress?: { percent: number; frame: number; total: number; time: number } | null;
  onMoveTrackingPoint?: (pointId: string, pos: { x: number; y: number; box?: { w: number; h: number } }, group?: string) => void;
  onSelectTrackingPoint?: (pointId: string) => void;
  onStartTracking?: (pointId: string, direction: "forward" | "backward" | "both" | "stepForward" | "stepBackward", range: "full" | "playhead") => void;
  onCancelTracking?: () => void;
}) {
  const { doc } = p;
  const duration = Math.max(0.04, docDuration(doc));
  const fps = doc.canvas.fps;
  const scale = Math.min(1, MAX_SIDE / Math.max(doc.canvas.width, doc.canvas.height));
  const W = Math.round(doc.canvas.width * scale);
  const H = Math.round(doc.canvas.height * scale);
  const aspect = `${doc.canvas.width} / ${doc.canvas.height}`;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const glCanvas = useRef<HTMLCanvasElement | null>(null);
  const renderer = useRef<LiveKeyRenderer | null>(null);
  const lookRef = useRef<GlLook | false | null>(null);
  const warperRef = useRef<GlWarp | false | null>(null);
  const mixCanvas = useRef<HTMLCanvasElement | null>(null);
  const bdCache = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null);
  const patchCanvas = useRef<HTMLCanvasElement | null>(null);
  const bdVideo = useRef<HTMLVideoElement | null>(null);
  // the shared <video> elements (lib/player/videoPool) and the box they live in
  const poolBox = useRef<HTMLDivElement>(null);
  const slots = useRef<Slot[]>([]);
  const els = useRef<HTMLVideoElement[]>([]);
  const waitingSince = useRef(new Map<string, number>());
  const aiWaitingRef = useRef(false);
  const [aiWaiting, setAiWaiting] = useState(false);
  const sounds = useRef(new Map<string, HTMLAudioElement>());
  const images = useRef(new Map<string, HTMLImageElement>());
  // each element's picture (lib/elements/draw), drawn again when it changes
  const elementPics = useRef(new Map<string, { key: string; canvas: HTMLCanvasElement }>());
  // blank scenes' colors
  const colorPics = useRef(new Map<string, HTMLCanvasElement>());
  // (a Brand Kit font that loads later: elements drawn with the fallback are drawn again)
  const fontGen = useRef(0);
  // start where the playhead already is (e.g. after switching from the clip view)
  const tRef = useRef(p.clock.get());
  const playing = useRef(false);
  const startedAt = useRef<{ wall: number; t: number } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [time, setTime] = useState(() => p.clock.get());
  // sound on by default (a mute is remembered)
  const [muted, setMuted] = useState(readPreviewMuted);
  const [loop, setLoop] = useState(true);
  const [isFull, setIsFull] = useState(false);
  // viewer zoom (1 = fit the frame): look closer at edges and small text; scroll to move around
  const [zoom, setZoom] = useState(1);
  const viewRef = useRef<HTMLDivElement>(null);
  const zoomBy = (dir: 1 | -1) => setZoom((z) => nextZoom(z, dir));
  // the zoom size menu (a click on the size): Fit, then bigger, then smaller
  const { at: zoomMenu, close: closeZoomMenu, buttonProps: zoomButton } = useMenuButton();
  const zoomItem = (z: number): MenuItem => ({ label: z === 1 ? "Fit · 100%" : `${Math.round(z * 100)}%`, checked: Math.abs(zoom - z) < 1e-6, onSelect: () => setZoom(z) });
  const zoomItems: MenuItem[] = [zoomItem(1), "separator", ...PREVIEW_ZOOMS.filter((z) => z > 1).reverse().map(zoomItem), "separator", ...PREVIEW_ZOOMS.filter((z) => z < 1).reverse().map(zoomItem)];
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    // ⌘ / Ctrl + scroll (and a trackpad pinch) zooms the preview, not the page
    const onWheel = (e: WheelEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => Math.min(PREVIEW_ZOOMS[PREVIEW_ZOOMS.length - 1], Math.max(PREVIEW_ZOOMS[0], Math.round(z * Math.exp(-e.deltaY * 0.004) * 100) / 100)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  const docRef = useRef(doc);
  const liveRef = useRef(p.liveOf);
  const packedRef = useRef(p.packedOf);
  const blurRef = useRef(p.blurOf);
  const sourceRef = useRef(p.sourceOf);
  const speechRef = useRef(p.speech);
  const revRef = useRef(p.reversedOf);
  const cropIdRef = useRef(p.cropId);
  const mutedRef = useRef(muted);
  const loopRef = useRef(loop);
  useEffect(() => {
    docRef.current = doc;
    liveRef.current = p.liveOf;
    packedRef.current = p.packedOf;
    blurRef.current = p.blurOf;
    sourceRef.current = p.sourceOf;
    speechRef.current = p.speech;
    revRef.current = p.reversedOf;
    cropIdRef.current = p.cropId;
    mutedRef.current = muted;
    loopRef.current = loop;
  });

  const vClips = useMemo(() => videoClips(doc), [doc]);
  // (localVersion: an imported file became playable from this computer, lib/media/localMedia)
  const aClips = useMemo(() => soundClips(doc, p.media), [doc, p.media, p.localVersion]);
  const aClipsRef = useRef(aClips);
  useEffect(() => {
    aClipsRef.current = aClips;
  });
  const hasAudio = useMemo(() => aClips.length > 0 || vClips.some((c) => p.media[c.mediaId]?.hasAudio), [aClips, vClips, p.media]);

  // pictures (clips and a picture backdrop), loaded once per upload
  useEffect(() => {
    const want = doc.tracks.flatMap((t) => t.clips.filter((c) => c.type === "image").map((c) => (c as { mediaId: string }).mediaId));
    // pictures that cover a watermark
    for (const t of doc.tracks) for (const c of t.clips) if ("patches" in c) for (const p of c.patches ?? []) if (p.mediaId) want.push(p.mediaId);
    const bd = doc.canvas.backdrop;
    if (bd?.kind === "media" && p.media[bd.mediaId]?.kind === "image") want.push(bd.mediaId);
    // your logo (Brand Kit)
    if (doc.watermark) want.push(doc.watermark.mediaId);
    for (const id of want) {
      const had = images.current.get(id);
      // (a picture that failed, e.g. asked for before its upload: again, from this computer if it's here)
      if (!had || (had.complete && !had.naturalWidth && localSrc(id))) {
        const img = new Image();
        img.src = localSrc(id) ?? `/api/videos/${id}/source`;
        images.current.set(id, img);
      }
    }
    // elements that were deleted: let go of their pictures
    for (const id of elementPics.current.keys()) if (!findClip(doc, id)) elementPics.current.delete(id);
  }, [doc, p.media, p.localVersion]);
  useEffect(() => {
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (!fonts) return;
    const onLoaded = () => {
      fontGen.current++;
    };
    fonts.addEventListener("loadingdone", onLoaded);
    return () => fonts.removeEventListener("loadingdone", onLoaded);
  }, []);

  /** Put every video element where the timeline needs it, then draw one frame (called every animation frame). */
  const drawRef = useRef<() => void>(() => {});
  useEffect(() => {
    drawRef.current = () => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const d = docRef.current;
    const t = tRef.current;
    const layers = layersAt(d, t);
    const main = mainTrack(d);
    // music and voiceover: play the ones under the playhead, with their volume and fades
    for (const c of aClipsRef.current) {
      const el = sounds.current.get(c.id);
      if (!el) continue;
      const len = c.len;
      const on = t >= c.start && t < c.start + len;
      if (!on || !playing.current) {
        if (!el.paused) el.pause();
        continue;
      }
      const rate = c.rate ?? 1;
      const want = c.in + (t - c.start) * rate;
      // "quieter while someone speaks": the same ranges and level as the export; up to 200% like the export
      const duck = c.duck && inSpeech(speechRef.current ?? [], t) ? DUCK_LEVEL : 1;
      setLevel(el, mutedRef.current ? 0 : soundLevel(c, t - c.start, len, { duck }));
      if (el.paused) {
        if (Math.abs(el.currentTime - want) > 0.15 * rate) el.currentTime = want;
        if (Math.abs(el.playbackRate - rate) > 1e-3) el.playbackRate = rate;
        void el.play().catch(() => undefined);
      } else {
        const drift = want - el.currentTime;
        if (Math.abs(drift) > 1.2 * rate) {
          el.currentTime = want;
          if (Math.abs(el.playbackRate - rate) > 1e-3) el.playbackRate = rate;
        } else if (Math.abs(drift) > 0.12 * rate) {
          // Smooth steering: gentle 2% nudge without audio clicks
          const steer = drift > 0 ? 1.02 : 0.98;
          el.playbackRate = rate * steer;
        } else if (Math.abs(el.playbackRate - rate) > 1e-3) {
          el.playbackRate = rate;
        }
      }
    }
    // video: the clips showing now, then the next one on each track (it seeks to its first frame early)
    const now = performance.now();
    const revOf = (c: VideoClip) => (c.reversed ? (revRef.current?.(c) ?? null) : null);
    const srcOf = (c: VideoClip) => packedRef.current?.(c) ?? revOf(c) ?? sourceRef.current?.(c) ?? (p.proxyMode ? proxyUrl(c.mediaId) : sourceUrl(c.mediaId));
    /** Where the element should be for a clip `off` timeline seconds in (speed; a reversed copy starts at 0). */
    const timeIn = (c: VideoClip, off: number) => (revOf(c) && !packedRef.current?.(c) ? 0 : c.in) + Math.max(0, off) * (c.speed ?? 1);
    const active = layers.filter((l) => l.clip.type === "video");
    const next = upcomingVideos(d, t, 2).filter((u) => !active.some((l) => l.clip.id === u.clip.id));
    const wants: Want[] = [...active.map((l) => ({ clipId: l.clip.id, src: srcOf(l.clip as VideoClip) })), ...next.map((u) => ({ clipId: u.clip.id, src: srcOf(u.clip) }))];
    assignSlots(slots.current, wants, now, Math.min(MAX_VIDEO_ELEMENTS, wants.length + 1));
    const elOf = new Map<string, HTMLVideoElement>();
    slots.current.forEach((slot, i) => {
      let el = els.current[i];
      if (!el) {
        el = document.createElement("video");
        el.muted = true;
        el.playsInline = true;
        el.setAttribute("playsinline", "true");
        el.setAttribute("webkit-playsinline", "true");
        el.preload = "auto";
        el.disableRemotePlayback = true;
        el.width = 320;
        el.height = 180;
        el.addEventListener("loadeddata", () => drawRef.current());
        el.addEventListener("seeked", () => drawRef.current());
        el.addEventListener("error", () => {
          if (el.dataset.src && el.dataset.src.includes("/proxy")) {
            const fallback = el.dataset.src.replace("/proxy", "/play");
            el.dataset.src = fallback;
            el.src = fallback;
            el.load();
          }
        });
        poolBox.current?.appendChild(el);
        els.current[i] = el;
      }
      if (slot.src && el.dataset.src !== slot.src) {
        el.dataset.src = slot.src;
        el.src = slot.src;
      } else if (!slot.src && el.dataset.src) {
        delete el.dataset.src;
        el.removeAttribute("src");
        el.load();
      }
      if (slot.clipId) elOf.set(slot.clipId, el);
      else {
        if (!el.paused) el.pause();
        // not needed for a while: let go of the file (the download)
        if (slot.src && now - slot.usedAt > IDLE_UNLOAD_MS) slot.src = null;
      }
    });
    // Track transitions (their sound crosses over, like the export), and the elements in use this frame
    const trans = docTransitions(d);
    const chosen = new Set<HTMLVideoElement>();
    const ready = (el: HTMLVideoElement, want: number, rate = 1) => el.readyState >= 2 && !el.seeking && Math.abs(el.currentTime - want) <= 1.5 / fps;
    let blocking = false;
    // Identify master video clip (main track or first active video) to lock the timeline clock to
    const masterLayer = active.find((l) => l.trackIndex === d.tracks.indexOf(main)) ?? active[0];
    const masterClip = masterLayer?.clip as VideoClip | undefined;
    const masterEl = masterClip ? elOf.get(masterClip.id) : undefined;

    // a clip only waits from the moment it shows (not from an earlier visit)
    for (const id of waitingSince.current.keys()) if (!active.some((l) => l.clip.id === id)) waitingSince.current.delete(id);
    for (const l of active) {
      const c = l.clip as VideoClip;
      const el = elOf.get(c.id);
      if (!el) continue;
      const rate = c.speed ?? 1;
      const want = timeIn(c, t - l.start);
      const isMain = l.trackIndex === d.tracks.indexOf(main);
      const isMaster = el === masterEl;
      chosen.add(el);
      // with "Remove background noise" the cleaned sound plays from its own <audio>
      const trObj = d.tracks[l.trackIndex];
      const isMutedTrack = isMain ? main.muted : !!(trObj && "muted" in trObj && trObj.muted);
      const silent = mutedRef.current || c.muted || isMutedTrack || !!c.denoise;
      const tr = trans.get(c.id);
      setLevel(el, silent ? 0 : soundLevel(c, t - l.start, clipLength(c), { t, trIn: tr?.in, trOut: tr?.out }));
      if (playing.current) {
        if (el.paused) {
          if (Math.abs(el.currentTime - want) > 0.25 * rate) el.currentTime = want;
          if (Math.abs(el.playbackRate - rate) > 1e-3) el.playbackRate = rate;
          const p = el.play();
          if (p && typeof p.catch === "function") {
            p.catch(() => {
              if (!el.muted) {
                el.muted = true;
                void el.play().catch(() => undefined);
              }
            });
          }
        } else {
          const drift = want - el.currentTime;
          if (Math.abs(drift) > 1.2 * rate) {
            // Severe desync: seek to catch up
            el.currentTime = want;
            if (Math.abs(el.playbackRate - rate) > 1e-3) el.playbackRate = rate;
          } else if (Math.abs(drift) > 0.15 * rate) {
            // Smooth steering: gentle 2% nudge without flushing decoder buffer or clicking
            const steer = drift > 0 ? 1.02 : 0.98;
            el.playbackRate = rate * steer;
          } else if (Math.abs(el.playbackRate - rate) > 1e-3) {
            el.playbackRate = rate;
          }
        }
      } else {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - want) > 0.5 / fps && !el.seeking) el.currentTime = want;
        if (Math.abs(el.playbackRate - rate) > 1e-3) el.playbackRate = rate;
      }
      // Hold previous frame ONLY when paused/scrubbing to prevent black flashes
      if (!playing.current) {
        if (ready(el, want, rate)) waitingSince.current.delete(c.id);
        else {
          const since = waitingSince.current.get(c.id) ?? now;
          waitingSince.current.set(c.id, since);
          if (now - since < HOLD_MS) blocking = true;
        }
      } else {
        waitingSince.current.delete(c.id);
      }
    }
    for (const u of next) {
      const el = elOf.get(u.clip.id);
      if (!el) continue;
      chosen.add(el);
      silence(el);
      if (!el.paused) el.pause();
      const first = timeIn(u.clip, 0);
      if (Math.abs(el.currentTime - first) > 0.5 / fps && !el.seeking && el.readyState >= 1) el.currentTime = first;
    }
    // any other element (a leftover one) is silent and still: nothing plays that the timeline doesn't show
    for (const el of els.current) {
      if (!el || chosen.has(el)) continue;
      silence(el);
      if (!el.paused) el.pause();
    }
    // Never abort rendering during active playback
    if (blocking && !playing.current) return;
    // draw
    let aiPending = false;
    const k = cv.width / d.canvas.width;
    /**
     * One picture (w × h of a texture texW × texH) at rect r: crop, flip, color and shape on the GPU
     * (lib/player/glLook), then turned around its middle — the same order and numbers as the export.
     */
    const drawPicture = (src: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement, w: number, h: number, texW: number, texH: number, c: VideoClip | Extract<AnyClip, { type: "image" }> | ElementClip | BlankClip, r: Rect, mo?: { rot: number; into: number }) => {
      if (c.type === "blank") {
        // a blank scene: its color over the frame (a transition may turn or move it)
        ctx.save();
        ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
        if (mo?.rot) ctx.rotate((mo.rot * Math.PI) / 180);
        ctx.drawImage(src, -r.w / 2, -r.h / 2, r.w, r.h);
        ctx.restore();
        return;
      }
      if (c.type === "element") {
        // an element: its drawn picture, turned around its middle and flipped (like the export)
        const rot = mo ? mo.rot : (c.transform.rotation ?? 0);
        const skewX = c.transform.skewX ?? 0;
        const skewY = c.transform.skewY ?? 0;
        if (hasCorners(c.transform.corners)) {
          const quad = boxQuad({ cx: r.x + r.w / 2, cy: r.y + r.h / 2, w: r.w, h: r.h }, { rotation: rot, skewX, skewY, corners: c.transform.corners });
          if (quadOk(quad)) {
            if (warperRef.current === null) warperRef.current = GlWarp.create() ?? false;
            const warper = warperRef.current || null;
            let srcCanvas: HTMLCanvasElement | HTMLImageElement = src as any;
            if (c.transform.flipX || c.transform.flipY) {
              const fc = document.createElement("canvas");
              fc.width = w;
              fc.height = h;
              const fx = fc.getContext("2d");
              if (fx) {
                fx.translate(w / 2, h / 2);
                fx.scale(c.transform.flipX ? -1 : 1, c.transform.flipY ? -1 : 1);
                fx.drawImage(src, -w / 2, -h / 2, w, h);
                srcCanvas = fc;
              }
            }
            const at = warper?.render(srcCanvas, w, h, 0, 0, w, h, quad);
            if (warper && at) {
              ctx.drawImage(warper.canvas, at.x, at.y);
              return;
            }
            drawWarpMesh(ctx, srcCanvas, 0, 0, w, h, quad);
            return;
          }
        }
        ctx.save();
        ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
        if (rot) ctx.rotate((rot * Math.PI) / 180);
        if (skewX || skewY) ctx.transform(1, Math.tan((skewY * Math.PI) / 180), Math.tan((skewX * Math.PI) / 180), 1, 0, 0);
        if (c.transform.flipX || c.transform.flipY) ctx.scale(c.transform.flipX ? -1 : 1, c.transform.flipY ? -1 : 1);
        ctx.drawImage(src, -r.w / 2, -r.h / 2, r.w, r.h);
        ctx.restore();
        return;
      }
      // watermark / logo boxes: on the source picture first (lib/player/patches, like the export)
      if (c.patches?.length) {
        patchCanvas.current ??= document.createElement("canvas");
        const pc = patchCanvas.current;
        if (pc.width !== w || pc.height !== h) {
          pc.width = w;
          pc.height = h;
        }
        const px = pc.getContext("2d", { willReadFrequently: true })!;
        px.clearRect(0, 0, w, h);
        px.drawImage(src, 0, 0, w, h, 0, 0, w, h);
        for (const patch of c.patches) {
          const pr = patchRect(patch, w, h);
          if (patch.mode === "remove") {
            const img = px.getImageData(pr.x - 1, pr.y - 1, pr.w + 2, pr.h + 2);
            fillFromBorder(img.data, pr.w + 2, { x: 1, y: 1, w: pr.w, h: pr.h });
            px.putImageData(img, pr.x - 1, pr.y - 1);
          } else if (patch.mode === "blur") {
            const f = Math.max(2, (patch.strength ?? 12) / 1.5);
            const small = document.createElement("canvas");
            small.width = Math.max(1, Math.round(pr.w / f));
            small.height = Math.max(1, Math.round(pr.h / f));
            small.getContext("2d")!.drawImage(pc, pr.x, pr.y, pr.w, pr.h, 0, 0, small.width, small.height);
            px.imageSmoothingEnabled = true;
            px.drawImage(small, 0, 0, small.width, small.height, pr.x, pr.y, pr.w, pr.h);
          } else {
            const pic = patch.mediaId ? images.current.get(patch.mediaId) : undefined;
            if (pic?.complete && pic.naturalWidth) {
              const k2 = Math.min(pr.w / pic.naturalWidth, pr.h / pic.naturalHeight);
              const dw = pic.naturalWidth * k2;
              const dh = pic.naturalHeight * k2;
              px.drawImage(pic, pr.x + (pr.w - dw) / 2, pr.y + (pr.h - dh) / 2, dw, dh);
            } else {
              px.fillStyle = patch.color ?? "#000000";
              px.fillRect(pr.x, pr.y, pr.w, pr.h);
            }
          }
        }
        src = pc;
        texW = w;
        texH = h;
      }
      // crop mode: the whole picture, standing still (the crop box moves over it)
      const editing = cropIdRef.current === c.id;
      const keyed = hasKeys(c) && !!mo;
      const at = keyed ? transformAt(c, mo!.into) : c.transform;
      const t = editing ? { ...at, crop: undefined } : c.transform;
      if (editing) r = cropViewRect(w, h, cv.width, cv.height, at);
      const crop = cropRect(w, h, t);
      const matrix = colorMatrix(c.color);
      const mask = c.mask && (c.mask.shape !== "rect" || c.mask.border?.width) ? c.mask : null;
      const rot = editing ? rotationOf(t) : mo ? mo.rot : rotationOf(t);
      // a moving clip's shape is made at its biggest size and scaled (so its soft edge shrinks with it, like the export)
      let work: { w: number; h: number } | null = null;
      if (mask && keyed && !editing) {
        const span = motionSpan(c);
        if (span.moving) {
          const unit = placeRect(w, h, cv.width, cv.height, { ...c.transform, x: 0, y: 0, scale: 1 });
          const s = workScale(unit.w, unit.h, span.max.scale, cv.width, cv.height);
          work = { w: unit.w * s, h: unit.h * s };
        }
      }
      const vig = vignetteOf(c.color);
      const fancy = !isIdentity(matrix) || !!mask || !!t.flipX || !!t.flipY || vig > 0;
      if (hasCorners(t.corners)) {
        const quad = boxQuad({ cx: r.x + r.w / 2, cy: r.y + r.h / 2, w: r.w, h: r.h }, { rotation: rot, skewX: t.skewX, skewY: t.skewY, corners: t.corners });
        if (quadOk(quad)) {
          if (warperRef.current === null) warperRef.current = GlWarp.create() ?? false;
          const warper = warperRef.current || null;
          let warpSrc: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement = src;
          let wsx = crop.sx, wsy = crop.sy, wsw = crop.sw, wsh = crop.sh, wtw = texW, wth = texH;
          if (fancy) {
            if (lookRef.current === null) lookRef.current = GlLook.create() ?? false;
            const gl = lookRef.current || null;
            const ok =
              !!gl &&
              gl.render(src, texW, texH, {
                crop: crop,
                flipX: !!t.flipX,
                flipY: !!t.flipY,
                matrix,
                outW: work?.w ?? r.w,
                outH: work?.h ?? r.h,
                vignette: vig,
                mask: mask ? { shape: mask.shape === "circle" ? 2 : mask.shape === "rounded" ? 1 : 0, radius: maskRadius(mask, work?.w ?? r.w, work?.h ?? r.h), feather: mask.feather * k, border: mask.border?.width ? { rgb: hexToRgb(mask.border.color).map((v) => v / 255) as [number, number, number], width: mask.border.width * k } : null } : null,
              });
            if (ok && gl) {
              warpSrc = gl.canvas;
              wtw = gl.canvas.width;
              wth = gl.canvas.height;
              wsx = 0;
              wsy = 0;
              wsw = gl.canvas.width;
              wsh = gl.canvas.height;
            }
          }
          const at = warper?.render(warpSrc, wtw, wth, wsx, wsy, wsw, wsh, quad);
          if (warper && at) {
            ctx.drawImage(warper.canvas, at.x, at.y);
            return;
          }
          drawWarpMesh(ctx, warpSrc, wsx, wsy, wsw, wsh, quad);
          return;
        }
      }
      ctx.save();
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
      if (rot) ctx.rotate((rot * Math.PI) / 180);
      if (t.skewX || t.skewY) ctx.transform(1, Math.tan(((t.skewY ?? 0) * Math.PI) / 180), Math.tan(((t.skewX ?? 0) * Math.PI) / 180), 1, 0, 0);
      if (fancy) {
        // made once (false: this browser can't, don't try every frame)
        if (lookRef.current === null) lookRef.current = GlLook.create() ?? false;
        const gl = lookRef.current || null;
        const ok =
          !!gl &&
          gl.render(src, texW, texH, {
            crop: crop,
            flipX: !!t.flipX,
            flipY: !!t.flipY,
            matrix,
            outW: work?.w ?? r.w,
            outH: work?.h ?? r.h,
            vignette: vig,
            mask: mask ? { shape: mask.shape === "circle" ? 2 : mask.shape === "rounded" ? 1 : 0, radius: maskRadius(mask, work?.w ?? r.w, work?.h ?? r.h), feather: mask.feather * k, border: mask.border?.width ? { rgb: hexToRgb(mask.border.color).map((v) => v / 255) as [number, number, number], width: mask.border.width * k } : null } : null,
          });
        if (ok && gl) ctx.drawImage(gl.canvas, -r.w / 2, -r.h / 2, r.w, r.h);
        else ctx.drawImage(src, crop.sx, crop.sy, crop.sw, crop.sh, -r.w / 2, -r.h / 2, r.w, r.h);
      } else ctx.drawImage(src, crop.sx, crop.sy, crop.sw, crop.sh, -r.w / 2, -r.h / 2, r.w, r.h);
      ctx.restore();
    };
    /** A blank scene's color, as a tiny picture (drawn over the whole frame, so transitions work on it too). */
    const colorPic = (fill: string) => {
      let e = colorPics.current.get(fill);
      if (!e) {
        e = document.createElement("canvas");
        e.width = e.height = 4;
        const x = e.getContext("2d");
        if (x) {
          x.fillStyle = fill;
          x.fillRect(0, 0, 4, 4);
        }
        colorPics.current.set(fill, e);
      }
      return e;
    };
    /** An element's picture at w × h (cached; a progress bar or ticker changes every frame). */
    const elementPic = (c: ElementClip, w: number, h: number, into: number, len: number) => {
      const pw = Math.max(1, Math.round(w));
      const ph = Math.max(1, Math.round(h));
      const key = `${JSON.stringify(c.el)}|${pw}x${ph}|${fontGen.current}${movesByItself(c.el) ? `|${into.toFixed(3)}|${len}` : ""}`;
      let e = elementPics.current.get(c.id);
      if (!e) {
        e = { key: "", canvas: document.createElement("canvas") };
        elementPics.current.set(c.id, e);
      }
      if (e.key !== key) {
        const pc = e.canvas;
        if (pc.width !== pw || pc.height !== ph) {
          pc.width = pw;
          pc.height = ph;
        }
        const px = pc.getContext("2d");
        if (!px) return null;
        px.clearRect(0, 0, pw, ph);
        drawElement(px, c.el, pw, ph, { into, len });
        e.key = key;
      }
      return e.canvas;
    };
    // In paused / scrubbing / trimming mode:
    // If any active video element is seeking or not ready, keep the last valid frame on canvas.
    // Safari WebKit draws transparent pixels if drawImage is called while video is seeking!
    if (!playing.current && active.some((l) => {
      const el = elOf.get(l.clip.id);
      return el && (el.seeking || el.readyState < 2);
    })) {
      return;
    }
    // Never wipe canvas to transparent during scrubbing/trimming if project has clips
    if (layers.length === 0 && !playing.current && d.tracks.some((tr) => tr.clips.length > 0)) {
      return;
    }
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (d.canvas.background !== "transparent") {
      ctx.fillStyle = d.canvas.background;
      ctx.fillRect(0, 0, cv.width, cv.height);
    }
    // the backdrop (Replace Background): drawn studio set / gradient, or a picture / looping video filling the canvas
    const bd = d.canvas.backdrop;
    if (bd?.kind === "media") {
      const m = p.media[bd.mediaId];
      let src: HTMLImageElement | HTMLVideoElement | null = null;
      let sw = 0;
      let sh = 0;
      if (m?.kind === "image") {
        const img = images.current.get(bd.mediaId);
        if (img?.complete && img.naturalWidth) [src, sw, sh] = [img, img.naturalWidth, img.naturalHeight];
      } else if (m?.kind === "video") {
        let v = bdVideo.current;
        const bdUrl = localSrc(bd.mediaId) ?? sourceUrl(bd.mediaId);
        if (!v || v.dataset.src !== bdUrl) {
          v?.remove();
          v = document.createElement("video");
          v.muted = true;
          v.playsInline = true;
          v.loop = true;
          v.preload = "auto";
          v.dataset.src = bdUrl;
          v.src = bdUrl;
          poolBox.current?.appendChild(v);
          bdVideo.current = v;
        }
        const want = m.duration ? t % m.duration : 0;
        if (playing.current) {
          if (v.paused) void v.play().catch(() => undefined);
          if (Math.abs(v.currentTime - want) > 1.2) v.currentTime = want;
        } else {
          if (!v.paused) v.pause();
          if (Math.abs(v.currentTime - want) > 0.5 / fps && !v.seeking) v.currentTime = want;
        }
        if (v.readyState >= 2) [src, sw, sh] = [v, v.videoWidth, v.videoHeight];
      }
      if (src && sw && sh) {
        const k = Math.max(cv.width / sw, cv.height / sh);
        ctx.drawImage(src, (cv.width - sw * k) / 2, (cv.height - sh * k) / 2, sw * k, sh * k);
      }
    } else if (bd) {
      const key = `${JSON.stringify(bd)}|${cv.width}x${cv.height}`;
      if (bdCache.current?.key !== key) {
        const c = document.createElement("canvas");
        c.width = cv.width;
        c.height = cv.height;
        const x = c.getContext("2d");
        if (x) drawBackdrop(x, bd, cv.width, cv.height);
        bdCache.current = { key, canvas: c };
      }
      ctx.drawImage(bdCache.current.canvas, 0, 0);
    } else if (bdVideo.current) {
      bdVideo.current.pause();
      bdVideo.current.remove();
      bdVideo.current = null;
    }
    // transitions on all tracks (lib/player/transitions, the same curves as the export)
    const mainIdx = d.tracks.indexOf(main);
    const mt = docTransitionsAt(d, t);
    let dipDone = false;
    const drawDip = () => {
      if (dipDone) return;
      dipDone = true;
      if (!mt.dip || mt.dip.alpha <= 0) return;
      ctx.globalAlpha = mt.dip.alpha;
      ctx.fillStyle = mt.dip.color;
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.globalAlpha = 1;
    };
    for (const l of layers) {
      const c = l.clip;
      if (l.trackIndex !== mainIdx) drawDip();
      const into = Math.max(0, t - l.start);
      const len = clipLength(c);
      // (a typewriter counts the letters)
      const typing = c.type === "text" && (c.anim.in === "typewriter" || c.anim.out === "typewriter");
      const an = "anim" in c ? animState(into, len, c.anim, typing ? letterCount(textPlacement(c as TextClip, into, d.canvas.width, d.canvas.height).clip, d.canvas.width, d.canvas.height) : 0) : null;
      const ts = mt.states.get(c.id);
      // (keyframes / opacity multiply in: motionAt)
      const mop = c.type === "audio" || c.type === "blank" ? 1 : motionAt(c as MotionClip, into).opacity;
      const base = cropIdRef.current === c.id ? 1 : ("fadeIn" in c ? fadeAlpha(into, len, c.fadeIn, c.fadeOut) : 1) * (ts?.alpha ?? 1) * mop;
      ctx.globalAlpha = cropIdRef.current === c.id ? 1 : base * (an?.alpha ?? 1);
      // blur (in / out): a blurred copy over the sharp one, like the export (BLUR × the height)
      const blurA = cropIdRef.current === c.id ? 0 : base * (an?.blur ?? 0);
      const blurPx = BLUR * cv.height;
      const tx = (ts?.dx ?? 0) * cv.width;
      const ty = (ts?.dy ?? 0) * cv.height;
      // a transition into it: a size, a turn (around its middle) and a reveal (lib/player/transitions)
      const draw = (src: Parameters<typeof drawPicture>[0], w: number, h: number, texW: number, texH: number, clip: Parameters<typeof drawPicture>[5], r: Rect, mo: { rot: number; into: number }) => {
        // (and its pop / zoom: around its middle)
        const k = (ts?.scale ?? 1) * (cropIdRef.current === c.id ? 1 : (an?.scale ?? 1));
        const rr = k === 1 ? r : { x: r.x + (r.w * (1 - k)) / 2, y: r.y + (r.h * (1 - k)) / 2, w: r.w * k, h: r.h * k };
        const rv = ts?.reveal;
        if (rv) {
          ctx.save();
          ctx.beginPath();
          const e = rv.p;
          const cx = r.x + r.w / 2;
          const cy = r.y + r.h / 2;
          const R = Math.hypot(r.w, r.h) / 2;
          if (rv.kind === "wipeLeft") ctx.rect(r.x + r.w * (1 - e), r.y, r.w * e, r.h);
          else if (rv.kind === "wipeRight") ctx.rect(r.x, r.y, r.w * e, r.h);
          else if (rv.kind === "wipeUp") ctx.rect(r.x, r.y + r.h * (1 - e), r.w, r.h * e);
          else if (rv.kind === "wipeDown") ctx.rect(r.x, r.y, r.w, r.h * e);
          else if (rv.kind === "circleOpen") ctx.arc(cx, cy, R * e, 0, Math.PI * 2);
          else {
            ctx.rect(r.x, r.y, r.w, r.h);
            ctx.arc(cx, cy, R * (1 - e), 0, Math.PI * 2);
          }
          ctx.clip(rv.kind === "circleClose" ? "evenodd" : "nonzero");
        }
        drawPicture(src, w, h, texW, texH, clip, rr, { ...mo, rot: mo.rot + (ts?.rot ?? 0) });
        if (blurA > 0.001) {
          const a0 = ctx.globalAlpha;
          ctx.globalAlpha = blurA;
          ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
          drawPicture(src, w, h, texW, texH, clip, rr, { ...mo, rot: mo.rot + (ts?.rot ?? 0) });
          ctx.filter = "none";
          ctx.globalAlpha = a0;
        }
        if (rv) ctx.restore();
      };
      const attInfo = findTrackingAttachmentForClip(d, c.id);
      let renderClip = c;
      if (attInfo && "transform" in c) {
        const videoT = Math.max(0, (t - attInfo.videoStart) * (attInfo.videoClip.speed ?? 1));
        const evalT = evaluateAttachmentTransform(attInfo.point, attInfo.attachment, c as MotionClip, videoT);
        renderClip = { ...c, transform: evalT };
      }

      if (renderClip.type === "text") {
        // drawn in project pixels (like the export's PNG), scaled down to the preview
        const PW = d.canvas.width;
        const PH = d.canvas.height;
        const tp = textPlacement(renderClip as TextClip, into, PW, PH);
        const sx = cv.width / PW;
        const sy = cv.height / PH;
        // pop / zoom: around its anchor too (like the export)
        const k = tp.k * (an?.scale ?? 1);
        const ox = tp.ox + tp.qx * (tp.k - k);
        const oy = tp.oy + tp.qy * (tp.k - k);
        const upTo = typing && an ? typedCount(an.typed, letterCount(tp.clip, PW, PH)) : Infinity;
        // word-by-word captions: how far through the caption we are (the highlighted word follows it)
        const said = captionProgress(tp.clip, into, len);
        ctx.save();
        ctx.setTransform(sx * k, 0, 0, sy * k, sx * ox + (an?.dx ?? 0) * cv.width, sy * oy + (an?.dy ?? 0) * cv.height);
        drawText(ctx, tp.clip, PW, PH, upTo, said);
        if (blurA > 0.001) {
          ctx.globalAlpha = blurA;
          // (blur in project pixels: the context is scaled)
          ctx.filter = `blur(${(blurPx / Math.max(1e-6, sy * k)).toFixed(1)}px)`;
          drawText(ctx, tp.clip, PW, PH, upTo, said);
          ctx.filter = "none";
        }
        ctx.restore();
      } else if (renderClip.type === "blank") {
        const pic = colorPic(renderClip.fill);
        draw(pic, pic.width, pic.height, pic.width, pic.height, renderClip, { x: tx, y: ty, w: cv.width, h: cv.height }, { rot: 0, into });
      } else if (renderClip.type === "element") {
        const r = elementRect(renderClip, into, cv.width, cv.height);
        const pic = elementPic(renderClip, r.w, r.h, into, len);
        if (!pic) continue;
        draw(pic, pic.width, pic.height, pic.width, pic.height, renderClip, { x: r.x + (an?.dx ?? 0) * cv.width + tx, y: r.y + (an?.dy ?? 0) * cv.height + ty, w: r.w, h: r.h }, { rot: r.rot, into });
      } else if (renderClip.type === "image") {
        const img = images.current.get(renderClip.mediaId);
        if (!img?.complete || !img.naturalWidth) continue;
        const r = motionRect(img.naturalWidth, img.naturalHeight, cv.width, cv.height, renderClip, into);
        draw(img, img.naturalWidth, img.naturalHeight, img.naturalWidth, img.naturalHeight, renderClip, { x: r.x + (an?.dx ?? 0) * cv.width + tx, y: r.y + (an?.dy ?? 0) * cv.height + ty, w: r.w, h: r.h }, { rot: r.rot, into });
      } else if (renderClip.type === "video") {
        const el = elOf.get(renderClip.id);
        if (!el || el.readyState < 2) continue;
        const packedSrc = packedRef.current?.(renderClip as VideoClip) ?? null;
        const packed = !!packedSrc && el.dataset.src === packedSrc;
        const vw = el.videoWidth;
        const vh = packed ? el.videoHeight / 2 : el.videoHeight;
        const r = motionRect(vw, vh, cv.width, cv.height, renderClip as VideoClip, into);
        const mo = { rot: r.rot, into };
        let live = liveRef.current(renderClip as VideoClip);
        // AI Removal whose preview video isn't ready: show the clip as it is (never the wrong half)
        if (live?.method === "packed" && !packed) {
          live = null;
          aiPending = true;
        }
        if (live || packed) {
          glCanvas.current ??= document.createElement("canvas");
          renderer.current ??= LiveKeyRenderer.create(glCanvas.current);
          if (renderer.current && renderer.current.render(el, packed ? { ...(live ?? ({} as LiveKeyParams)), method: "packed" } : live!, "result")) {
            let src: HTMLCanvasElement = glCanvas.current;
            // Blur background: the cut-out subject over a blurred copy of the picture (like the export's aiMatte)
            const blur = packed ? (blurRef.current?.(renderClip as VideoClip) ?? null) : null;
            if (blur) {
              mixCanvas.current ??= document.createElement("canvas");
              const mc = mixCanvas.current;
              if (mc.width !== vw || mc.height !== vh) {
                mc.width = vw;
                mc.height = vh;
              }
              const mx = mc.getContext("2d")!;
              mx.clearRect(0, 0, vw, vh);
              blurInto(mx, el, vw, vh, blur);
              mx.drawImage(src, 0, 0, vw, vh);
              src = mc;
            }
            draw(src, vw, vh, vw, vh, renderClip, { x: r.x + tx, y: r.y + ty, w: r.w, h: r.h }, mo);
            continue;
          }
        }
        draw(el, vw, vh, el.videoWidth, el.videoHeight, renderClip, { x: r.x + tx, y: r.y + ty, w: r.w, h: r.h }, mo);
      }
    }
    drawDip();
    // Render tracked blur attachments on canvas
    const mStarts = mainStarts(main.clips);
    for (const tr of d.tracks) {
      if (tr.kind !== "main" && tr.kind !== "overlay") continue;
      tr.clips.forEach((c, idx) => {
        if (c.type !== "video") return;
        const pts = (c.id === p.selectedId && p.trackingPoints) ? p.trackingPoints : c.tracking?.points;
        if (!pts || !pts.length) return;
        const cStart = tr.kind === "main" ? mStarts[idx] : (c as unknown as { start: number }).start;
        const into = (t - cStart) * (c.speed ?? 1);
        if (into < 0 || into > clipLength(c)) return;

        for (const pt of pts) {
          if (!pt.attachments?.length || (!pt.keyframes?.length && !p.isTrackingOpen)) continue;
          const kf = trackingAt(pt, into) ?? (p.isTrackingOpen && !pt.keyframes?.length ? {
            x: pt.initial.x,
            y: pt.initial.y,
            scale: 1,
            rotation: 0,
            confidence: 1,
            box: pt.initial?.box,
          } : null);
          if (!kf) continue;
          for (const att of pt.attachments) {
            if (att.type !== "blur") continue;
            const dp = dragPreviewRef.current;
            const isDragThis = !!(dp && dp.pointId === pt.id);
            const effKfX = isDragThis && dp ? dp.x : kf.x;
            const effKfY = isDragThis && dp ? dp.y : kf.y;
            const effBox = isDragThis && dp?.box ? dp.box : kf.box;
            const wNorm = effBox?.w ?? (att as BlurAttachment).size?.w ?? pt.initial?.box?.w ?? 0.14;
            const hNorm = effBox?.h ?? (att as BlurAttachment).size?.h ?? pt.initial?.box?.h ?? 0.14;
            const padX = ((att.padding ?? 0) / 100) * cv.width * 0.4;
            const padY = ((att.padding ?? 0) / 100) * cv.height * 0.4;
            const bw = Math.max(16, (wNorm * cv.width + padX * 2) * (kf.scale ?? 1));
            const bh = Math.max(16, (hNorm * cv.height + padY * 2) * (kf.scale ?? 1));
            const offX = (att.offset?.x ?? 0) * cv.width;
            const offY = (att.offset?.y ?? 0) * cv.height;
            const cx = effKfX * cv.width + offX;
            const cy = effKfY * cv.height + offY;
            const bx = cx - bw / 2;
            const by = cy - bh / 2;

            ctx.save();
            if (att.shape === "ellipse") {
              ctx.beginPath();
              ctx.ellipse(cx, cy, bw / 2, bh / 2, ((kf.rotation ?? 0) * Math.PI) / 180, 0, Math.PI * 2);
              ctx.clip();
            } else {
              ctx.beginPath();
              ctx.rect(bx, by, bw, bh);
              ctx.clip();
            }

            mixCanvas.current ??= document.createElement("canvas");
            const mc = mixCanvas.current;

            const sx = Math.max(0, Math.min(cv.width - 2, bx));
            const sy = Math.max(0, Math.min(cv.height - 2, by));
            const sw = Math.max(2, Math.min(bw, cv.width - sx));
            const sh = Math.max(2, Math.min(bh, cv.height - sy));

            if (att.mode === "pixelate") {
              const pixelSize = Math.max(6, Math.round(((att.intensity ?? 20) / 50) * 32));
              const destW = Math.max(1, Math.floor(sw / pixelSize));
              const destH = Math.max(1, Math.floor(sh / pixelSize));
              mc.width = destW;
              mc.height = destH;
              const mx = mc.getContext("2d");
              if (mx) {
                mx.imageSmoothingEnabled = false;
                mx.drawImage(cv, sx, sy, sw, sh, 0, 0, destW, destH);
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(mc, 0, 0, destW, destH, sx, sy, sw, sh);
                ctx.imageSmoothingEnabled = true;
              }
            } else {
              // High-quality smooth Gaussian Blur via downsample-upsample + filter
              const blurFactor = Math.max(4, Math.round(((att.intensity ?? 25) / 50) * 14));
              const destW = Math.max(2, Math.floor(sw / blurFactor));
              const destH = Math.max(2, Math.floor(sh / blurFactor));
              mc.width = destW;
              mc.height = destH;
              const mx = mc.getContext("2d");
              if (mx) {
                mx.imageSmoothingEnabled = true;
                mx.drawImage(cv, sx, sy, sw, sh, 0, 0, destW, destH);
                ctx.imageSmoothingEnabled = true;
                const blurPx = Math.max(4, Math.round(((att.intensity ?? 25) / 50) * 10));
                ctx.filter = `blur(${blurPx}px)`;
                ctx.drawImage(mc, 0, 0, destW, destH, sx, sy, sw, sh);
                ctx.filter = "none";
              }
            }
            ctx.restore();
          }
        }
      });
    }
    // your logo on top of everything (Brand Kit), like the export
    const wm = d.watermark;
    const logo = wm ? images.current.get(wm.mediaId) : undefined;
    if (wm && logo?.complete && logo.naturalWidth) {
      // (a part of the video, coming in / going out: lib/player/logo; a box and rounded corners: its badge)
      const lr = watermarkRect(wm, cv.width, cv.height, logo.naturalWidth, logo.naturalHeight);
      const st = logoState(wm, t, docDuration(d), cv.width, lr);
      if (st.show) {
        ctx.globalAlpha = wm.opacity * st.alpha;
        const bw = lr.w * st.scale;
        const bh = lr.h * st.scale;
        drawLogoBadge(ctx, logo, logo.naturalWidth, logo.naturalHeight, wm, { x: lr.x + lr.w / 2 + st.dx - bw / 2, y: lr.y + lr.h / 2 - bh / 2, w: bw, h: bh }, watermarkPad(wm, cv.width) * st.scale);
      }
    }
    ctx.globalAlpha = 1;
    if (aiPending !== aiWaitingRef.current) {
      aiWaitingRef.current = aiPending;
      setAiWaiting(aiPending);
    }
    };
  });

  // let go of every video file when the player closes
  useEffect(() => {
    const list = els.current;
    return () => {
      for (const el of list) {
        el.pause();
        el.removeAttribute("src");
        el.load();
        el.remove();
      }
      list.length = 0;
      slots.current = [];
    };
  }, []);

  // the clock loop: moves time while playing, redraws every frame
  useEffect(() => {
    let raf = 0;
    let drawFailed = false;
    const tick = () => {
      if (playing.current && startedAt.current) {
        let t = startedAt.current.t + (performance.now() - startedAt.current.wall) / 1000;
        const end = Math.max(0.04, docDuration(docRef.current));
        if (t >= end) {
          if (loopRef.current) {
            t = 0;
            startedAt.current = { wall: performance.now(), t: 0 };
          } else {
            t = Math.max(0, end - 1 / fps);
            playing.current = false;
            setIsPlaying(false);
          }
        }
        tRef.current = t;
        p.clock.set(t);
        setTime(t);
      }
      // one bad frame must not stop the loop (it also pauses and silences what shouldn't play)
      try {
        drawRef.current();
      } catch (err) {
        if (!drawFailed) console.error("preview frame failed", err);
        drawFailed = true;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fps, p.clock]);

  // the timeline (or anything else) moved the clock while paused
  useEffect(
    () =>
      p.clock.subscribe(() => {
        if (playing.current) return;
        const t = p.clock.get();
        if (Math.abs(t - tRef.current) > 1e-4) {
          tRef.current = t;
          setTime(t);
        }
      }),
    [p.clock],
  );

  useEffect(() => {
    const onChange = () => setIsFull(!!frameRef.current && document.fullscreenElement === frameRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const seek = useCallback(
    (t: number) => {
      const c = Math.min(Math.max(0, t), Math.max(0, docDuration(docRef.current) - 1 / fps));
      tRef.current = c;
      if (playing.current) startedAt.current = { wall: performance.now(), t: c };
      p.clock.set(c);
      setTime(c);
    },
    [fps, p.clock],
  );
  const play = useCallback(() => {
    if (playing.current) return;
    if (tRef.current >= docDuration(docRef.current) - 1.5 / fps) tRef.current = 0;
    playing.current = true;
    startedAt.current = { wall: performance.now(), t: tRef.current };
    setIsPlaying(true);
    try {
      drawRef.current();
    } catch {
      // tick will handle next frame
    }
  }, [fps]);
  const pause = useCallback(() => {
    playing.current = false;
    startedAt.current = null;
    setIsPlaying(false);
    p.clock.set(tRef.current);
  }, [p.clock]);
  const toggle = useCallback(() => (playing.current ? pause() : play()), [play, pause]);
  const step = useCallback(
    (n: number) => {
      pause();
      seek(tRef.current + n / fps);
    },
    [pause, seek, fps],
  );
  const getVideoElement = useCallback((clipId?: string) => {
    if (clipId) {
      const idx = slots.current.findIndex((s) => s.clipId === clipId);
      if (idx !== -1 && els.current[idx]) return els.current[idx];
    }
    return els.current.find((el) => el && !el.paused) ?? els.current[0] ?? null;
  }, []);
  useImperativeHandle(p.playerRef, () => ({ seek, toggle, play, pause, step, getVideoElement }), [seek, toggle, play, pause, step, getVideoElement]);

  // ---------- selecting, moving and resizing on the preview ----------
  const PW = doc.canvas.width;
  const PH = doc.canvas.height;
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [guides, setGuides] = useState<{ v: boolean; h: boolean; vLines?: number[]; hLines?: number[] }>({ v: false, h: false, vLines: [], hLines: [] });
  const [movingPos, setMovingPos] = useState<{ x: number; y: number } | null>(null);
  // the angle while turning a clip from a corner (shown in the middle of it)
  const [turning, setTurning] = useState<number | null>(null);
  const [tmode, setTmode] = useState<"transform" | "skew" | "perspective">("transform");
  const [ctrlHeld, setCtrlHeld] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") setCtrlHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") setCtrlHeld(false);
    };
    const onBlur = () => setCtrlHeld(false);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const [dragPreview, setDragPreview] = useState<{
    pointId: string;
    x: number;
    y: number;
    box?: { w: number; h: number };
  } | null>(null);
  const dragPreviewRef = useRef(dragPreview);
  useEffect(() => {
    dragPreviewRef.current = dragPreview;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && tmode !== "transform") {
        setTmode("transform");
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [tmode]);

  const editable = !!p.onTransform;
  const visible = layersAt(doc, time).filter((l) => l.clip.type !== "audio");
  const rectOf = (l: Layer) => {
    const attInfo = findTrackingAttachmentForClip(doc, l.clip.id);
    if (attInfo && "transform" in l.clip) {
      const videoT = Math.max(0, (time - attInfo.videoStart) * (attInfo.videoClip.speed ?? 1));
      const evalT = evaluateAttachmentTransform(attInfo.point, attInfo.attachment, l.clip as MotionClip, videoT);
      return clipRect({ ...l.clip, transform: evalT }, time - l.start, PW, PH, p.media);
    }
    return clipRect(l.clip, time - l.start, PW, PH, p.media);
  };
  const selLayer = p.selectedId ? visible.find((l) => l.clip.id === p.selectedId) : undefined;
  const selRect = selLayer ? rectOf(selLayer) : null;
  const selLocked = selLayer ? !!findClip(doc, selLayer.clip.id)?.track.locked : false;
  const selTransform = selLayer && "transform" in selLayer.clip ? (() => {
    const attInfo = findTrackingAttachmentForClip(doc, selLayer.clip.id);
    if (attInfo) {
      const videoT = Math.max(0, (time - attInfo.videoStart) * (attInfo.videoClip.speed ?? 1));
      return evaluateAttachmentTransform(attInfo.point, attInfo.attachment, selLayer.clip as MotionClip, videoT);
    }
    return hasKeys(selLayer.clip) ? transformAt(selLayer.clip as MotionClip, time - selLayer.start) : selLayer.clip.transform;
  })() : undefined;
  // your logo (Brand Kit): on top of everything; click it to move or resize it
  const wm = doc.watermark;
  const wmMedia = wm ? p.media[wm.mediaId] : undefined;
  const logoBox: RRect | null = (() => {
    if (!wm || !wmMedia || !p.onWatermark) return null;
    const b = watermarkRect(wm, PW, PH, wmMedia.width || 1, wmMedia.height || 1);
    // (only while it shows; it can be caught while it moves in or out too)
    const st = logoState(wm, time, duration, PW, b);
    if (!st.show) return null;
    return { x: b.x + b.w / 2 + st.dx - (b.w * st.scale) / 2, y: b.y + b.h / 2 - (b.h * st.scale) / 2, w: b.w * st.scale, h: b.h * st.scale, rot: 0 };
  })();

  /** Project pixels under a pointer. */
  const toCanvas = (e: { clientX: number; clientY: number }, r: DOMRect) => ({ x: ((e.clientX - r.left) / r.width) * PW, y: ((e.clientY - r.top) / r.height) * PH });
  /** Is the point on the (possibly turned) clip? (A thin line can be caught a little around it too.) */
  const catchHalf = 0.012 * Math.min(PW, PH);
  const inside = (r: RRect | null, pt: { x: number; y: number }) => {
    if (!r) return false;
    const a = (-r.rot * Math.PI) / 180;
    const dx = pt.x - (r.x + r.w / 2);
    const dy = pt.y - (r.y + r.h / 2);
    const lx = dx * Math.cos(a) - dy * Math.sin(a);
    const ly = dx * Math.sin(a) + dy * Math.cos(a);
    return Math.abs(lx) <= Math.max(r.w / 2, catchHalf) && Math.abs(ly) <= Math.max(r.h / 2, catchHalf);
  };

  const startDrag = (e: React.PointerEvent, id: string, kind: Drag["kind"], rect: RRect, edge?: string, corner?: CornerKey) => {
    const f = findClip(docRef.current, id);
    if (!f || f.track.locked || f.clip.type === "audio" || f.clip.type === "blank" || !stageRef.current) return;
    // (a moving clip starts from how it looks now, at the playhead)
    const layer = visible.find((l) => l.clip.id === id);
    const attInfo = findTrackingAttachmentForClip(docRef.current, id);
    let t0 = layer && hasKeys(f.clip) ? transformAt(f.clip as MotionClip, time - layer.start) : f.clip.transform;
    if (attInfo && "transform" in f.clip) {
      const videoT = Math.max(0, (time - attInfo.videoStart) * (attInfo.videoClip.speed ?? 1));
      t0 = evaluateAttachmentTransform(attInfo.point, attInfo.attachment, f.clip as MotionClip, videoT);
    }
    const stage = stageRef.current.getBoundingClientRect();
    const mid = { x: stage.left + ((rect.x + rect.w / 2) / PW) * stage.width, y: stage.top + ((rect.y + rect.h / 2) / PH) * stage.height };
    const look: BoxLook = { rotation: t0.rotation, skewX: t0.skewX, skewY: t0.skewY, pivot: t0.pivot, corners: t0.corners };
    const hBox: HandleBox = {
      cx: rect.x + rect.w / 2,
      cy: rect.y + rect.h / 2,
      w: rect.w,
      h: rect.h,
      unitW: rect.w / (t0.scale * (t0.scaleX ?? 1)),
      unitH: rect.h / (t0.scale * (t0.scaleY ?? 1)),
    };
    drag.current = { id, kind, edge, corner, px: e.clientX, py: e.clientY, t0, rect, group: `preview:${kind}:${id}:${Math.round(e.timeStamp)}`, moved: false, stage, a0: pointerAngle(mid.x, mid.y, e.clientX, e.clientY), hBox, look };
    stageRef.current.setPointerCapture(e.pointerId);
  };

  const startLogo = (e: React.PointerEvent, edge: string) => {
    if (!wm || !logoBox || !stageRef.current) return;
    drag.current = { id: "logo", kind: "logo", edge, wm0: wm, px: e.clientX, py: e.clientY, t0: NO_T, rect: logoBox, group: `logo:drag:${Math.round(e.timeStamp)}`, moved: false, stage: stageRef.current.getBoundingClientRect() };
    stageRef.current.setPointerCapture(e.pointerId);
  };
  const onStageDown = (e: React.PointerEvent) => {
    if (!editable || e.button !== 0 || !stageRef.current || p.cropId || p.patchEdit) return;
    const pt = toCanvas(e, stageRef.current.getBoundingClientRect());
    // the logo first (it's drawn on top of everything), then the selected clip (so one under another can still be dragged), then the topmost
    if (inside(logoBox, pt) && p.onSelectLogo) {
      if (!p.logoSelected) p.onSelectLogo(true);
      return startLogo(e, "move");
    }
    const hit = inside(selRect, pt) && selLayer ? selLayer : [...visible].reverse().find((l) => inside(rectOf(l), pt));
    if (!hit) {
      p.onSelect?.(null);
      if (p.logoSelected) p.onSelectLogo?.(false);
      return;
    }
    if (hit.clip.id !== p.selectedId) p.onSelect?.(hit.clip.id);
    const r = rectOf(hit);
    if (r) startDrag(e, hit.clip.id, "move", r);
  };
  const onHandleDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (e.button === 0 && selLayer && selRect) startDrag(e, selLayer.clip.id, "size", selRect);
  };
  const onRotateDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (e.button === 0 && selLayer && selRect) startDrag(e, selLayer.clip.id, "rotate", selRect);
  };
  /** A picture's, video's or text's side (data-edge l / r / t / b): resize it, or skew if Ctrl/Cmd is held. */
  const onSideDown = (e: React.PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    const edge = e.currentTarget.dataset.edge;
    if (e.button === 0 && selLayer && selRect && edge) {
      if (e.ctrlKey || e.metaKey || ctrlHeld || tmode === "skew") {
        startDrag(e, selLayer.clip.id, "skew", selRect, edge);
      } else {
        startDrag(e, selLayer.clip.id, "side", selRect, edge);
      }
    }
  };
  /** An element's side (data-edge l / r / t / b): stretch it, or skew if Ctrl/Cmd is held. */
  const onStretchDown = (e: React.PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    const edge = e.currentTarget.dataset.edge;
    if (e.button === 0 && selLayer && selRect && edge) {
      if (e.ctrlKey || e.metaKey || ctrlHeld || tmode === "skew") {
        startDrag(e, selLayer.clip.id, "skew", selRect, edge);
      } else {
        startDrag(e, selLayer.clip.id, "stretch", selRect, edge);
      }
    }
  };
  // crop mode: the clip's full frame and its crop box
  const cropLayer = p.cropId ? visible.find((l) => l.clip.id === p.cropId) : undefined;
  const cropFull = cropLayer ? clipRect(cropLayer.clip, time - cropLayer.start, PW, PH, p.media, "crop") : null;
  // watermark box editing: over the clip's full frame, like crop mode
  const patchLayer = p.patchEdit ? visible.find((l) => l.clip.id === p.patchEdit!.clipId) : undefined;
  const patchFull = patchLayer ? clipRect(patchLayer.clip, time - patchLayer.start, PW, PH, p.media, "patch") : null;
  const patchList = patchLayer && "patches" in patchLayer.clip ? (patchLayer.clip.patches ?? []) : [];
  const patchT = patchLayer && "transform" in patchLayer.clip ? patchLayer.clip.transform : undefined;
  const onPatchDown = (e: React.PointerEvent, patchId: string, edge: string) => {
    e.stopPropagation();
    const box = patchList.find((x) => x.id === patchId);
    if (e.button !== 0 || !patchLayer || !patchFull || !box || !stageRef.current) return;
    drag.current = { id: patchLayer.clip.id, kind: "patch", edge, patchId, box: { x: box.x, y: box.y, w: box.w, h: box.h }, px: e.clientX, py: e.clientY, t0: (patchLayer.clip as VideoClip).transform, rect: patchFull, group: `patch:${patchId}:${Math.round(e.timeStamp)}`, moved: false, stage: stageRef.current.getBoundingClientRect() };
    stageRef.current.setPointerCapture(e.pointerId);
  };
  /** A watermark box or one of its corners (data-patch, data-edge on the element). */
  const onPatchPointer = (e: React.PointerEvent<HTMLElement>) => {
    const id = e.currentTarget.dataset.patch;
    if (id) onPatchDown(e, id, e.currentTarget.dataset.edge ?? "move");
  };
  const onCropDown = (e: React.PointerEvent, edge: string) => {
    e.stopPropagation();
    if (e.button === 0 && cropLayer && cropFull) startDrag(e, cropLayer.clip.id, "crop", cropFull, edge);
  };
  const onStageMove = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g || !p.onTransform) return;
    const dxPx = e.clientX - g.px;
    const dyPx = e.clientY - g.py;
    if (!g.moved && Math.hypot(dxPx, dyPx) < 3) return;
    g.moved = true;
    if (g.kind === "logo" && g.wm0) {
      const w0 = g.wm0;
      const r = g.rect;
      if (g.edge === "move") {
        const hw = r.w / 2 / PW;
        const hh = r.h / 2 / PH;
        let cx = Math.min(1 - hw, Math.max(hw, (r.x + r.w / 2) / PW + dxPx / g.stage.width));
        let cy = Math.min(1 - hh, Math.max(hh, (r.y + r.h / 2) / PH + dyPx / g.stage.height));
        let v = false;
        let h = false;
        if (!e.altKey) {
          // near a corner spot (its margin from the edges): back in that corner; else the middle lines (Alt: free)
          const my = (w0.margin * PW) / PH;
          const nx = Math.abs(cx - (w0.margin + hw)) < LOGO_SNAP ? "l" : Math.abs(cx - (1 - w0.margin - hw)) < LOGO_SNAP ? "r" : null;
          const ny = Math.abs(cy - (my + hh)) < LOGO_SNAP ? "t" : Math.abs(cy - (1 - my - hh)) < LOGO_SNAP ? "b" : null;
          if (nx && ny) {
            setGuides((o) => (o.v || o.h ? { v: false, h: false } : o));
            p.onWatermark?.({ ...w0, corner: `${ny}${nx}` as Watermark["corner"], x: undefined, y: undefined }, g.group);
            return;
          }
          if (Math.abs(cx - 0.5) < SNAP) {
            cx = 0.5;
            v = true;
          }
          if (Math.abs(cy - 0.5) < SNAP) {
            cy = 0.5;
            h = true;
          }
        }
        setGuides((o) => (o.v === v && o.h === h ? o : { v, h }));
        const r4 = (n: number) => Math.round(n * 10000) / 10000;
        p.onWatermark?.({ ...w0, x: r4(cx), y: r4(cy) }, g.group);
      } else if (g.edge && g.edge.length === 1) {
        // a side: even resize, the opposite side stays (so the logo is placed by hand from here)
        const s0 = sideScale({ ...r, rot: 0 }, g.edge as Edge, (dxPx / g.stage.width) * PW, (dyPx / g.stage.height) * PH, w0.size, undefined, 0.04, LOGO_MAX_SIZE);
        const r4 = (n: number) => Math.round(n * 10000) / 10000;
        p.onWatermark?.({ ...w0, size: Math.round(s0.scale * 1000) / 1000, x: r4((r.x + r.w / 2 + s0.dx) / PW), y: r4((r.y + r.h / 2 + s0.dy) / PH) }, g.group);
      } else {
        // resize: the corner follows the pointer (a logo in a corner stays in it; a placed one keeps its middle)
        const cxPx = g.stage.left + ((r.x + r.w / 2) / PW) * g.stage.width;
        const cyPx = g.stage.top + ((r.y + r.h / 2) / PH) * g.stage.height;
        const d0 = Math.hypot(g.px - cxPx, g.py - cyPx) || 1;
        const d1 = Math.hypot(e.clientX - cxPx, e.clientY - cyPx);
        const size = Math.round(Math.min(LOGO_MAX_SIZE, Math.max(0.04, w0.size * (d1 / d0))) * 1000) / 1000;
        p.onWatermark?.({ ...w0, size }, g.group);
      }
      return;
    }
    if (g.kind === "move") {
      let dx = dxPx / g.stage.width;
      let dy = dyPx / g.stage.height;

      const boxW = g.rect.w / PW;
      const boxH = g.rect.h / PH;
      const cxRaw = (g.rect.x + g.rect.w / 2) / PW + dx;
      const cyRaw = (g.rect.y + g.rect.h / 2) / PH + dy;

      const vLines: number[] = [];
      const hLines: number[] = [];

      if (!e.altKey) {
        // targets: 0.5 (center), 0 & 1 (edges), 0.05 & 0.95 (safe zone), other visible clips
        const xTargets = [0.5, 0, 1, 0.05, 0.95];
        const yTargets = [0.5, 0, 1, 0.05, 0.95];
        for (const l of visible) {
          if (l.clip.id === g.id) continue;
          const r = rectOf(l);
          if (r) {
            const rx = r.x / PW;
            const rw = r.w / PW;
            const ry = r.y / PH;
            const rh = r.h / PH;
            xTargets.push(rx, rx + rw / 2, rx + rw);
            yTargets.push(ry, ry + rh / 2, ry + rh);
          }
        }

        // Test snap for X
        let bestDiffX: number | null = null;
        let bestTargetX: number | null = null;
        const testPointsX = [
          { pt: cxRaw, offset: 0 },
          { pt: cxRaw - boxW / 2, offset: -boxW / 2 },
          { pt: cxRaw + boxW / 2, offset: boxW / 2 },
        ];
        for (const t of xTargets) {
          for (const tp of testPointsX) {
            const diff = t - tp.pt;
            if (Math.abs(diff) < SNAP) {
              if (bestDiffX === null || Math.abs(diff) < Math.abs(bestDiffX)) {
                bestDiffX = diff;
                bestTargetX = t;
              }
            }
          }
        }
        if (bestDiffX !== null && bestTargetX !== null) {
          dx += bestDiffX;
          vLines.push(bestTargetX);
        }

        // Test snap for Y
        let bestDiffY: number | null = null;
        let bestTargetY: number | null = null;
        const testPointsY = [
          { pt: cyRaw, offset: 0 },
          { pt: cyRaw - boxH / 2, offset: -boxH / 2 },
          { pt: cyRaw + boxH / 2, offset: boxH / 2 },
        ];
        for (const t of yTargets) {
          for (const tp of testPointsY) {
            const diff = t - tp.pt;
            if (Math.abs(diff) < SNAP) {
              if (bestDiffY === null || Math.abs(diff) < Math.abs(bestDiffY)) {
                bestDiffY = diff;
                bestTargetY = t;
              }
            }
          }
        }
        if (bestDiffY !== null && bestTargetY !== null) {
          dy += bestDiffY;
          hLines.push(bestTargetY);
        }
      }

      setGuides({ v: vLines.length > 0, h: hLines.length > 0, vLines, hLines });
      const finalCX = (g.rect.x + g.rect.w / 2) / PW + dx;
      const finalCY = (g.rect.y + g.rect.h / 2) / PH + dy;
      setMovingPos({ x: Math.round(finalCX * 100), y: Math.round(finalCY * 100) });
      const clamp = (n: number) => Math.min(2, Math.max(-2, n));
      p.onTransform(g.id, { x: clamp(g.t0.x + dx), y: clamp(g.t0.y + dy) }, g.group);
    } else if (g.kind === "rotate") {
      // turn around the middle by how far the pointer went round it: 0/90/180/270 snap (Shift: 15° steps, Alt: free)
      const cxPx = g.stage.left + ((g.rect.x + g.rect.w / 2) / PW) * g.stage.width;
      const cyPx = g.stage.top + ((g.rect.y + g.rect.h / 2) / PH) * g.stage.height;
      const deg = turnAngle(g.t0.rotation ?? 0, g.a0 ?? 0, pointerAngle(cxPx, cyPx, e.clientX, e.clientY), { shift: e.shiftKey, alt: e.altKey });
      setTurning(deg);
      p.onTransform(g.id, { rotation: deg === 0 ? undefined : deg }, g.group);
    } else if (g.kind === "side" && g.edge) {
      // even resize from a side: the opposite side stays put (text grows from its anchor, so it's moved back to stay)
      const f = findClip(docRef.current, g.id);
      const a = f?.clip.type === "text" ? textAnchor(f.clip.style.preset, PW, PH) : null;
      const pivot = a ? { x: a.x + g.t0.x * PW, y: a.y + g.t0.y * PH } : undefined;
      const r = sideScale(g.rect, g.edge as Edge, (dxPx / g.stage.width) * PW, (dyPx / g.stage.height) * PH, g.t0.scale, pivot);
      const r4 = (n: number) => Math.round(n * 10000) / 10000;
      p.onTransform(g.id, { scale: r.scale, x: r4(g.t0.x + r.dx / PW), y: r4(g.t0.y + r.dy / PH) }, g.group);
    } else if (g.kind === "stretch" && g.edge) {
      // one side follows the pointer, the other stays put (Alt: from the middle)
      const next = stretchElement(g.rect, g.edge as Edge, (dxPx / g.stage.width) * PW, (dyPx / g.stage.height) * PH, PW, PH, e.altKey);
      p.onStretch?.(g.id, next, g.group);
    } else if (g.kind === "patch" && g.box && g.patchId) {
      // the pointer's move in the picture's own directions, as a share of the full frame (a flipped picture: mirrored)
      const a = (-g.rect.rot * Math.PI) / 180;
      const sx = (dxPx / g.stage.width) * PW;
      const sy = (dyPx / g.stage.height) * PH;
      const lx = ((sx * Math.cos(a) - sy * Math.sin(a)) / g.rect.w) * (g.t0.flipX ? -1 : 1);
      const ly = ((sx * Math.sin(a) + sy * Math.cos(a)) / g.rect.h) * (g.t0.flipY ? -1 : 1);
      const b = { ...g.box };
      const ed = sourceEdge(g.edge ?? "move", g.t0);
      const cl = (v: number) => Math.min(1, Math.max(0, v));
      if (ed === "move") {
        b.x = Math.min(1 - b.w, cl(g.box.x + lx));
        b.y = Math.min(1 - b.h, cl(g.box.y + ly));
      } else {
        if (ed.includes("l")) {
          b.x = Math.min(g.box.x + g.box.w - 0.01, cl(g.box.x + lx));
          b.w = g.box.x + g.box.w - b.x;
        }
        if (ed.includes("r")) b.w = Math.max(0.01, Math.min(1 - g.box.x, g.box.w + lx));
        if (ed.includes("t")) {
          b.y = Math.min(g.box.y + g.box.h - 0.01, cl(g.box.y + ly));
          b.h = g.box.y + g.box.h - b.y;
        }
        if (ed.includes("b")) b.h = Math.max(0.01, Math.min(1 - g.box.y, g.box.h + ly));
      }
      const r4 = (v: number) => Math.round(v * 10000) / 10000;
      p.onPatchBox?.(g.id, g.patchId, { x: r4(b.x), y: r4(b.y), w: r4(b.w), h: r4(b.h) }, g.group);
    } else if (g.kind === "trackingPoint" && g.trackingPointId && g.trackInit) {
      const normDx = dxPx / g.stage.width;
      const normDy = dyPx / g.stage.height;
      const nextX = Math.max(0, Math.min(1, Math.round((g.trackInit.x + normDx) * 10000) / 10000));
      const nextY = Math.max(0, Math.min(1, Math.round((g.trackInit.y + normDy) * 10000) / 10000));
      g.lastX = nextX;
      g.lastY = nextY;
      const preview = {
        pointId: g.trackingPointId,
        x: nextX,
        y: nextY,
        box: g.trackInit.box,
      };
      dragPreviewRef.current = preview;
      setDragPreview(preview);
      drawRef.current?.();
    } else if (g.kind === "trackingBox" && g.trackingPointId && g.trackInit && g.edge) {
      const normDx = dxPx / g.stage.width;
      const normDy = dyPx / g.stage.height;
      let nw = g.trackInit.box.w;
      let nh = g.trackInit.box.h;
      if (g.edge.includes("e")) nw = Math.max(0.02, Math.min(0.9, g.trackInit.box.w + normDx * 2));
      if (g.edge.includes("w")) nw = Math.max(0.02, Math.min(0.9, g.trackInit.box.w - normDx * 2));
      if (g.edge.includes("s")) nh = Math.max(0.02, Math.min(0.9, g.trackInit.box.h + normDy * 2));
      if (g.edge.includes("n")) nh = Math.max(0.02, Math.min(0.9, g.trackInit.box.h - normDy * 2));
      const rNw = Math.round(nw * 10000) / 10000;
      const rNh = Math.round(nh * 10000) / 10000;
      g.lastW = rNw;
      g.lastH = rNh;
      const preview = {
        pointId: g.trackingPointId,
        x: g.trackInit.x,
        y: g.trackInit.y,
        box: { w: rNw, h: rNh },
      };
      dragPreviewRef.current = preview;
      setDragPreview(preview);
      drawRef.current?.();
    } else if (g.kind === "crop") {
      // move crop edges: the pointer's move in the picture's own (turned, flipped) directions, as a share of the whole picture
      const a = (-g.rect.rot * Math.PI) / 180;
      const sx = (dxPx / g.stage.width) * PW;
      const sy = (dyPx / g.stage.height) * PH;
      const lx = ((sx * Math.cos(a) - sy * Math.sin(a)) / g.rect.w) * (g.t0.flipX ? -1 : 1);
      const ly = ((sx * Math.sin(a) + sy * Math.cos(a)) / g.rect.h) * (g.t0.flipY ? -1 : 1);
      const k0 = g.t0.crop ?? { l: 0, t: 0, r: 0, b: 0 };
      const k = { ...k0 };
      const lim = (v: number, other: number) => Math.min(CROP_MAX, Math.max(0, Math.min(v, 0.9 - other)));
      const ed = sourceEdge(g.edge ?? "", g.t0);
      if (ed === "move") {
        // the box keeps its size; no edge may go past 45 % (the project couldn't be saved)
        const w = 1 - k0.l - k0.r;
        const h = 1 - k0.t - k0.b;
        k.l = Math.min(CROP_MAX, 1 - w, Math.max(0, 1 - w - CROP_MAX, k0.l + lx));
        k.r = 1 - w - k.l;
        k.t = Math.min(CROP_MAX, 1 - h, Math.max(0, 1 - h - CROP_MAX, k0.t + ly));
        k.b = 1 - h - k.t;
      } else {
        if (ed.includes("l")) k.l = lim(k0.l + lx, k0.r);
        if (ed.includes("r")) k.r = lim(k0.r - lx, k0.l);
        if (ed.includes("t")) k.t = lim(k0.t + ly, k0.b);
        if (ed.includes("b")) k.b = lim(k0.b - ly, k0.t);
      }
      const round = (v: number) => Math.round(v * 1000) / 1000;
      const c = clampCrop(k);
      const crop = { l: round(c.l), t: round(c.t), r: round(c.r), b: round(c.b) };
      p.onTransform(g.id, { crop: crop.l || crop.t || crop.r || crop.b ? crop : undefined }, g.group);
    } else if (g.kind === "corner" && g.corner && g.hBox && g.look) {
      const pt = toCanvas(e, g.stage);
      const next = cornerResize(g.hBox, g.look, g.t0, g.corner, pt, { free: e.shiftKey, fromCenter: e.altKey }, PW, PH);
      if (next) p.onTransform(g.id, next, g.group);
    } else if (g.kind === "perspective" && g.corner && g.hBox && g.look) {
      const pt = toCanvas(e, g.stage);
      const corners = cornerPin(g.hBox, g.look, g.corner, pt, e.shiftKey);
      if (corners) p.onTransform(g.id, { corners }, g.group);
    } else if (g.kind === "skew" && g.edge && g.hBox && g.look) {
      const pt = toCanvas(e, g.stage);
      const next = skewDrag(g.hBox, g.look, g.edge as any, pt, e.shiftKey ? 5 : 0);
      p.onTransform(g.id, next, g.group);
    } else if (g.kind === "pivot" && g.hBox && g.look) {
      const pt = toCanvas(e, g.stage);
      const next = pivotFromPointer(g.hBox, g.look, pt, e.altKey, PW, PH);
      if (next) p.onTransform(g.id, next, g.group);
    } else if (g.kind === "radius" && g.hBox && g.look) {
      const pt = toCanvas(e, g.stage);
      const radius = radiusFromPointer(g.hBox, g.look, pt);
      if (p.onRadius) {
        p.onRadius(g.id, radius, g.group);
      } else {
        p.onTransform?.(g.id, { radius: radius === 0 ? undefined : radius } as any, g.group);
      }
    } else {
      // resize from the middle: the corner follows the pointer
      const cxPx = g.stage.left + ((g.rect.x + g.rect.w / 2) / PW) * g.stage.width;
      const cyPx = g.stage.top + ((g.rect.y + g.rect.h / 2) / PH) * g.stage.height;
      const d0 = Math.hypot(g.px - cxPx, g.py - cyPx) || 1;
      const d1 = Math.hypot(e.clientX - cxPx, e.clientY - cyPx);
      const scale = Math.min(5, Math.max(0.05, Math.round(g.t0.scale * (d1 / d0) * 100) / 100));
      p.onTransform(g.id, { scale }, g.group);
    }
  };
  const onStageUp = (e?: React.PointerEvent) => {
    if (e && stageRef.current && stageRef.current.hasPointerCapture(e.pointerId)) {
      try {
        stageRef.current.releasePointerCapture(e.pointerId);
      } catch {}
    }
    const g = drag.current;
    if (g && g.moved) {
      if (g.kind === "trackingPoint" && g.trackingPointId && g.trackInit) {
        const finalX = g.lastX ?? g.trackInit.x;
        const finalY = g.lastY ?? g.trackInit.y;
        p.onMoveTrackingPoint?.(g.trackingPointId, { x: finalX, y: finalY, box: g.trackInit.box }, g.group);
      } else if (g.kind === "trackingBox" && g.trackingPointId && g.trackInit) {
        const finalW = g.lastW ?? g.trackInit.box.w;
        const finalH = g.lastH ?? g.trackInit.box.h;
        p.onMoveTrackingPoint?.(g.trackingPointId, {
          x: g.trackInit.x,
          y: g.trackInit.y,
          box: { w: finalW, h: finalH },
        }, g.group);
      }
    }
    dragPreviewRef.current = null;
    setDragPreview(null);
    drawRef.current?.();
    drag.current = null;
    setGuides({ v: false, h: false, vLines: [], hLines: [] });
    setTurning(null);
    setMovingPos(null);
  };
  const nudge = (e: React.KeyboardEvent) => {
    if (!selLayer || selLocked || !p.onTransform || selLayer.clip.type === "audio" || selLayer.clip.type === "blank") return;
    const t0 = hasKeys(selLayer.clip) ? transformAt(selLayer.clip as MotionClip, time - selLayer.start) : selLayer.clip.transform;
    const step = e.shiftKey ? 0.05 : 0.005;
    let next: Partial<Transform> | null = null;
    if (e.key === "ArrowLeft") next = { x: t0.x - step };
    else if (e.key === "ArrowRight") next = { x: t0.x + step };
    else if (e.key === "ArrowUp") next = { y: t0.y - step };
    else if (e.key === "ArrowDown") next = { y: t0.y + step };
    else if (e.key === "+" || e.key === "=") next = { scale: Math.min(5, t0.scale * 1.05) };
    else if (e.key === "-") next = { scale: Math.max(0.05, t0.scale / 1.05) };
    else if (e.key === "[" || e.key === "]" || e.key === "{" || e.key === "}") {
      // turn: 1° (Shift: 15°), −180…179
      const d = (e.key === "]" || e.key === "}" ? 1 : -1) * (e.shiftKey ? 15 : 1);
      const deg = Math.round(((((t0.rotation ?? 0) + d + 180) % 360) + 360) % 360) - 180;
      next = { rotation: deg === 0 ? undefined : deg };
    }
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    p.onTransform(selLayer.clip.id, next, `preview:nudge:${selLayer.clip.id}`);
  };
  const nudgeLogo = (e: React.KeyboardEvent) => {
    if (!wm || !logoBox || !p.onWatermark) return;
    const step = e.shiftKey ? 0.05 : 0.005;
    const d = e.key === "ArrowLeft" ? [-step, 0] : e.key === "ArrowRight" ? [step, 0] : e.key === "ArrowUp" ? [0, -step] : e.key === "ArrowDown" ? [0, step] : null;
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    const c = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 10000) / 10000;
    p.onWatermark({ ...wm, x: c((logoBox.x + logoBox.w / 2) / PW + d[0]), y: c((logoBox.y + logoBox.h / 2) / PH + d[1]) }, "logo:nudge");
  };
  // a picture dragged from My Assets over the preview: a box shows where (and how big) it lands
  const dragged = useMediaDrag();
  const textDragged = useTextDrag();
  const elementDragged = useElementDrag();
  const memeDragged = useMemeDrag();
  const [dropAt, setDropAt] = useState<{ x: number; y: number } | null>(null);
  const dropGhost = (() => {
    if (!dropAt) return null;
    if (dragged && dragged.kind === "image") {
      const t = logoTransform(dropAt, dragged.width, dragged.height, PW, PH);
      return placeRect(dragged.width, dragged.height, PW, PH, t);
    }
    if (textDragged) {
      const gw = Math.round(PW * 0.42);
      const gh = Math.round(PH * 0.12);
      return {
        x: Math.round(Math.max(0, Math.min(PW - gw, dropAt.x * PW - gw / 2))),
        y: Math.round(Math.max(0, Math.min(PH - gh, dropAt.y * PH - gh / 2))),
        w: gw,
        h: gh,
      };
    }
    if (elementDragged) {
      const asp = elementDragged.aspect && elementDragged.aspect > 0 ? elementDragged.aspect : 1;
      let gh = Math.round(PH * 0.22);
      let gw = Math.round(gh * asp);
      if (gw > PW * 0.85) {
        gw = Math.round(PW * 0.85);
        gh = Math.round(gw / asp);
      }
      return {
        x: Math.round(Math.max(0, Math.min(PW - gw, dropAt.x * PW - gw / 2))),
        y: Math.round(Math.max(0, Math.min(PH - gh, dropAt.y * PH - gh / 2))),
        w: gw,
        h: gh,
      };
    }
    if (memeDragged) {
      const asp = memeDragged.width && memeDragged.height ? memeDragged.width / memeDragged.height : 16 / 9;
      let gh = Math.round(PH * 0.28);
      let gw = Math.round(gh * asp);
      if (gw > PW * 0.8) {
        gw = Math.round(PW * 0.8);
        gh = Math.round(gw / asp);
      }
      return {
        x: Math.round(Math.max(0, Math.min(PW - gw, dropAt.x * PW - gw / 2))),
        y: Math.round(Math.max(0, Math.min(PH - gh, dropAt.y * PH - gh / 2))),
        w: gw,
        h: gh,
      };
    }
    return null;
  })();
  const pointOf = (e: React.DragEvent) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const onStageDragOver = (e: React.DragEvent) => {
    const hasMedia = e.dataTransfer.types.includes(MEDIA_DRAG) && mediaDrag()?.kind === "image";
    const hasText = e.dataTransfer.types.includes(TEXT_DRAG) || textDrag() != null;
    const hasElement = e.dataTransfer.types.includes(ELEMENT_DRAG) || elementDrag() != null;
    const hasMeme = e.dataTransfer.types.includes(MEME_DRAG) || memeDrag() != null;
    const hasFiles = e.dataTransfer.types.includes("Files");
    if (!p.onDropAt || !stageRef.current || (!hasMedia && !hasText && !hasElement && !hasMeme && !hasFiles)) return;
    e.preventDefault();
    const pt = pointOf(e);
    setDropAt((o) => (o && Math.abs(o.x - pt.x) < 0.002 && Math.abs(o.y - pt.y) < 0.002 ? o : pt));
  };
  const onStageDrop = (e: React.DragEvent) => {
    setDropAt(null);
    if (!p.onDropAt || !stageRef.current) return;
    // (preventDefault tells the preview panel around it that the drop was used)
    if (p.onDropAt(pointOf(e), e.dataTransfer)) e.preventDefault();
  };
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const selName = selLayer ? (selLayer.clip.type === "text" ? `Text “${selLayer.clip.text.split("\n")[0].slice(0, 40)}”` : selLayer.clip.type === "element" ? elementName(selLayer.clip) : selLayer.clip.type === "blank" ? "Blank scene" : selLayer.clip.type === "image" ? "Picture" : "Video clip") : "";

  const canPin = selLayer && "transform" in selLayer.clip;
  const selLook: BoxLook = selTransform
    ? { rotation: selTransform.rotation, skewX: selTransform.skewX, skewY: selTransform.skewY, pivot: selTransform.pivot, corners: selTransform.corners }
    : {};
  const selHBox: HandleBox | null = selRect && selTransform
    ? {
        cx: selRect.x + selRect.w / 2,
        cy: selRect.y + selRect.h / 2,
        w: selRect.w,
        h: selRect.h,
        unitW: selRect.w / (selTransform.scale * (selTransform.scaleX ?? 1)),
        unitH: selRect.h / (selTransform.scale * (selTransform.scaleY ?? 1)),
      }
    : null;

  const hasShapeMod = !!(
    selTransform?.skewX ||
    selTransform?.skewY ||
    (selTransform?.scaleX ?? 1) !== 1 ||
    (selTransform?.scaleY ?? 1) !== 1 ||
    hasCorners(selTransform?.corners) ||
    selTransform?.pivot
  );

  const modeBar = editable && selLayer && selRect && selTransform && !selLocked && !p.cropId && !p.patchEdit && (
    <div
      data-testid="transform-toolbar"
      role="toolbar"
      aria-label="Selection box mode"
      onPointerDown={(e) => e.stopPropagation()}
      className="flex shrink-0 items-center gap-1.5"
    >
      {hasShapeMod && (
        <button
          type="button"
          aria-label="Reset shape"
          title="Reset shape: no stretch, skew, perspective or pivot"
          onClick={(e) => {
            const plain = { ...selLook, skewX: undefined, skewY: undefined, corners: undefined, pivot: undefined };
            const sx = selTransform?.scaleX ?? 1;
            const sy = selTransform?.scaleY ?? 1;
            const hBox = selHBox ?? {
              cx: selRect.x + selRect.w / 2,
              cy: selRect.y + selRect.h / 2,
              w: selRect.w,
              h: selRect.h,
              unitW: selRect.w / (selTransform.scale * (selTransform.scaleX ?? 1)),
              unitH: selRect.h / (selTransform.scale * (selTransform.scaleY ?? 1)),
            };
            const xy = xyForCenter({ x: hBox.cx, y: hBox.cy }, hBox.w / sx, hBox.h / sy, hBox.unitW, hBox.unitH, plain, PW, PH);
            p.onTransform?.(selLayer.clip.id, { scaleX: undefined, scaleY: undefined, skewX: undefined, skewY: undefined, corners: undefined, pivot: undefined, ...xy }, `preview:reset-shape:${selLayer.clip.id}:${Math.round(e.timeStamp)}`);
          }}
          className="flex h-7 items-center gap-1 rounded bg-raised px-2 text-xs font-medium text-muted hover:text-ink transition-colors border border-line"
        >
          <Icon name="reset" className="size-3.5" />
          <span>Reset shape</span>
        </button>
      )}
    </div>
  );

  const empty = mainTrack(doc).clips.length === 0 && docDuration(doc) === 0;
  return (
    <figure className={`m-0 flex min-w-0 flex-col ${p.fit ? "h-full min-h-0" : ""}`} aria-labelledby="program-caption">
      <div className="flex h-10 shrink-0 items-center justify-between gap-1.5 border-b border-line px-2 text-xs">
        <div className="flex items-center gap-1.5 shrink-0">
          {p.toolbar}
          {modeBar}
          <span role="group" aria-label="Preview zoom" className="flex items-center gap-0.5 rounded-md border border-line px-0.5">
            <button type="button" className="flex size-7 items-center justify-center rounded text-muted hover:bg-raised hover:text-ink disabled:opacity-40" onClick={() => zoomBy(-1)} disabled={zoom <= PREVIEW_ZOOMS[0]} aria-label="Zoom out the preview" title="Zoom out (⌘ + scroll)">
              −
            </button>
            <button
              type="button"
              data-testid="preview-zoom"
              className={`min-w-11 rounded px-1 text-xs tabular-nums hover:bg-raised ${zoomMenu ? "bg-raised" : ""}`}
              {...zoomButton}
              title="Zoom size"
              aria-label={zoom === 1 ? "Preview zoom: fit. Choose a size" : `Preview zoom ${Math.round(zoom * 100)} percent. Choose a size`}
            >
              {zoom === 1 ? "Fit" : `${Math.round(zoom * 100)}%`}
            </button>
            <button type="button" className="flex size-7 items-center justify-center rounded text-muted hover:bg-raised hover:text-ink disabled:opacity-40" onClick={() => zoomBy(1)} disabled={zoom >= PREVIEW_ZOOMS[PREVIEW_ZOOMS.length - 1]} aria-label="Zoom in the preview" title="Zoom in (⌘ + scroll)">
              +
            </button>
          </span>
          {zoomMenu && <ContextMenu x={zoomMenu.x} y={zoomMenu.y} width={190} label="Zoom size" items={zoomItems} onClose={closeZoomMenu} />}
        </div>
        <span id="program-caption" data-testid="program-caption" className="ml-auto flex items-center gap-1.5 truncate text-xs tabular-nums text-muted shrink-0" aria-live="off">
          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-raised px-1.5 py-0.5 text-[0.6875rem] font-medium text-muted">
            <Icon name="film" className="size-3 text-primary" /> Program
          </span>
          <span className="hidden sm:inline text-[0.6875rem] text-muted">
            {doc.canvas.width} × {doc.canvas.height}
          </span>
        </span>
      </div>
      <div
        ref={frameRef}
        data-testid="program-frame"
        className={`relative flex flex-col bg-preview ${isFull ? "h-full w-full" : p.fit ? "min-h-40 flex-1" : ""}`}
        onPointerDown={(e) => {
          if (!editable || e.button !== 0 || p.cropId || p.patchEdit) return;
          const target = e.target as HTMLElement;
          const insideStage = !!stageRef.current?.contains(target);
          const isInteractive = !!target.closest("button") || !!target.closest("input") || !!target.closest("select") || !!target.closest("[role='menu']") || !!target.closest("[role='group']");
          if (!insideStage && !isInteractive) {
            p.onSelect?.(null);
            if (p.logoSelected) p.onSelectLogo?.(false);
          }
        }}
      >
        <div
          ref={viewRef}
          tabIndex={0}
          data-testid="program-view"
          aria-label="Program preview. Space plays or pauses. ⌘ + scroll zooms."
          className={`on-dark relative flex ${zoom > 1 ? "overflow-auto" : "overflow-hidden"} ${isFull || p.fit ? "min-h-0 flex-1 [container-type:size] py-2" : "max-h-[70vh] [container-type:inline-size]"}`}
          onPointerDown={(e) => {
            // a click on the dark area around the canvas (not on a scrollbar, stage or control) selects nothing
            if (!editable || e.button !== 0 || p.cropId || p.patchEdit) return;
            const target = e.target as HTMLElement;
            const insideStage = !!stageRef.current?.contains(target);
            const isInteractive = !!target.closest("button") || !!target.closest("input") || !!target.closest("select") || !!target.closest("[role='menu']") || !!target.closest("[role='group']");
            if (!insideStage && !isInteractive) {
              p.onSelect?.(null);
              if (p.logoSelected) p.onSelectLogo?.(false);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === " " && e.target === e.currentTarget) {
              e.preventDefault();
              toggle();
            }
          }}
        >
          <div
            ref={stageRef}
            data-testid="program-stage"
            onPointerDown={onStageDown}
            onPointerMove={onStageMove}
            onPointerUp={onStageUp}
            onPointerCancel={onStageUp}
            onDoubleClick={() => (selLayer?.clip.type === "text" || selLayer?.clip.type === "element") && p.onEditText?.(selLayer.clip.id)}
            onDragOver={onStageDragOver}
            onDragLeave={(e) => !stageRef.current?.contains(e.relatedTarget as Node | null) && setDropAt(null)}
            onDrop={onStageDrop}
            className={`relative m-auto shrink-0 touch-none ${p.bg === "custom" ? "" : BG_CLASS[p.bg]}`}
            style={{
              width: isFull || p.fit ? `calc(${zoom} * min(100cqw, 100cqh * ${aspect}))` : `${zoom * 100}%`,
              aspectRatio: aspect,
              ...(p.bg === "custom" ? { background: p.custom } : {}),
              ...(p.bg === "image" && p.bgMedia?.kind === "image" ? { backgroundImage: `url(${p.bgMedia.url})`, backgroundSize: "cover", backgroundPosition: "center" } : {}),
            }}
          >
            {p.bg === "video" && p.bgMedia?.kind === "video" && <video src={p.bgMedia.url} className="absolute inset-0 size-full object-cover" autoPlay muted loop playsInline aria-hidden="true" />}
            {/* the shared video elements: tiny but "visible", so browsers don't pause them to save power */}
            <div ref={poolBox} aria-hidden="true" data-testid="video-pool" className="pointer-events-none absolute -top-[9999px] -left-[9999px] w-[320px] h-[180px] overflow-hidden opacity-[0.01]" />
            <canvas ref={canvasRef} data-testid="program-canvas" width={W} height={H} className="absolute inset-0 size-full" aria-label="Program: the whole timeline as it will be exported" role="img" />
            {empty && <span className="absolute inset-0 flex items-center justify-center text-sm text-muted">Add a video or picture to the timeline</span>}
            {aiWaiting && (
              <span className="pointer-events-none absolute right-2 top-2 z-10 rounded-full bg-black/80 px-3 py-1 text-xs text-white" data-testid="ai-preparing">
                AI preview is being made · showing the clip as it is
              </span>
            )}
            {cropLayer && cropFull && cropLayer.clip.type !== "text" && cropLayer.clip.type !== "audio" && cropLayer.clip.type !== "blank" && (
              <div data-testid="crop-frame" className="absolute" style={{ left: pct(cropFull.x, PW), top: pct(cropFull.y, PH), width: pct(cropFull.w, PW), height: pct(cropFull.h, PH), rotate: cropFull.rot ? `${cropFull.rot}deg` : undefined }}>
                {(() => {
                  const tr = cropLayer.clip.transform;
                  const k = tr.crop ?? { l: 0, t: 0, r: 0, b: 0 };
                  // a flipped picture shows its left edge on the right: the box is mirrored too
                  const box = { left: `${(tr.flipX ? k.r : k.l) * 100}%`, top: `${(tr.flipY ? k.b : k.t) * 100}%`, width: `${(1 - k.l - k.r) * 100}%`, height: `${(1 - k.t - k.b) * 100}%` };
                  return (
                    <div data-testid="crop-box" className="absolute cursor-move outline outline-2 outline-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" style={box} onPointerDown={(e) => onCropDown(e, "move")}>
                      <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,transparent_33.2%,rgba(255,255,255,.35)_33.3%,transparent_33.5%,transparent_66.5%,rgba(255,255,255,.35)_66.6%,transparent_66.8%),linear-gradient(to_bottom,transparent_33.2%,rgba(255,255,255,.35)_33.3%,transparent_33.5%,transparent_66.5%,rgba(255,255,255,.35)_66.6%,transparent_66.8%)]" />
                      {(["l", "r", "t", "b", "lt", "rt", "lb", "rb"] as const).map((ed) => (
                        <span
                          key={ed}
                          data-testid={`crop-${ed}`}
                          aria-hidden="true"
                          onPointerDown={(e) => onCropDown(e, ed)}
                          className="absolute rounded-sm border-2 border-white bg-link"
                          style={{
                            width: ed.length === 1 && (ed === "t" || ed === "b") ? 22 : 12,
                            height: ed.length === 1 && (ed === "l" || ed === "r") ? 22 : 12,
                            left: ed.includes("l") ? 0 : ed.includes("r") ? "100%" : "50%",
                            top: ed.includes("t") ? 0 : ed.includes("b") ? "100%" : "50%",
                            translate: "-50% -50%",
                            cursor: ed === "l" || ed === "r" ? "ew-resize" : ed === "t" || ed === "b" ? "ns-resize" : ed === "lt" || ed === "rb" ? "nwse-resize" : "nesw-resize",
                          }}
                        />
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
            {patchLayer && patchFull && (
              <div data-testid="patch-frame" className="pointer-events-none absolute outline-dashed outline-1 outline-white/50" style={{ left: pct(patchFull.x, PW), top: pct(patchFull.y, PH), width: pct(patchFull.w, PW), height: pct(patchFull.h, PH), rotate: patchFull.rot ? `${patchFull.rot}deg` : undefined }}>
                {patchList.map((b) => {
                  const on = b.id === p.patchEdit?.patchId;
                  return (
                    <div
                      key={b.id}
                      data-testid={on ? "patch-box" : undefined}
                      className={`pointer-events-auto absolute ${on ? "cursor-move outline outline-2 outline-amber-300" : "outline-dashed outline-1 outline-amber-200/60"}`}
                      style={{ left: `${(patchT?.flipX ? 1 - b.x - b.w : b.x) * 100}%`, top: `${(patchT?.flipY ? 1 - b.y - b.h : b.y) * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}
                      data-patch={on ? b.id : undefined}
                      data-edge="move"
                      onPointerDown={onPatchPointer}
                    >
                      <span className="pointer-events-none absolute -top-5 left-0 whitespace-nowrap rounded bg-amber-300 px-1 text-[0.625rem] font-semibold text-black">{b.mode === "remove" ? "Remove" : b.mode === "blur" ? "Blur" : "Cover"}</span>
                      {on &&
                        (["lt", "rt", "lb", "rb"] as const).map((ed) => (
                          <span
                            key={ed}
                            data-testid={`patch-${ed}`}
                            aria-hidden="true"
                            data-patch={b.id}
                            data-edge={ed}
                            onPointerDown={onPatchPointer}
                            className="absolute size-3 rounded-sm border-2 border-white bg-amber-400"
                            style={{ left: ed.includes("l") ? 0 : "100%", top: ed.includes("t") ? 0 : "100%", translate: "-50% -50%", cursor: ed === "lt" || ed === "rb" ? "nwse-resize" : "nesw-resize" }}
                          />
                        ))}
                    </div>
                  );
                })}
              </div>
            )}
            {p.patchEdit && (
              <div className="absolute left-1/2 top-2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-lg bg-black/80 px-2 py-1 text-xs text-white">
                Drag the box over the watermark
                <button type="button" className="btn btn-primary min-h-0 px-2.5 py-1 text-xs" onClick={p.onPatchDone} data-testid="patch-done">
                  Done
                </button>
              </div>
            )}
            {p.cropId && (
              <div className="absolute left-1/2 top-2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-lg bg-black/80 px-2 py-1 text-xs text-white">
                Drag the box or its edges to crop
                <button type="button" className="btn btn-primary min-h-0 px-2.5 py-1 text-xs" onClick={p.onCropDone} data-testid="crop-done">
                  Done
                </button>
              </div>
            )}
            {/* Smart Motion Tracking Overlays (Editor-only: omitted in export) */}
            {p.isTrackingOpen && p.trackingPoints && p.trackingPoints.length > 0 && (
              <div className="pointer-events-none absolute inset-0 size-full overflow-visible z-25" data-testid="tracking-overlay-stage">
                {p.trackingPoints.map((tp) => {
                  const isAct = tp.id === (p.activeTrackingPointId || p.trackingPoints?.[0]?.id);
                  const selClip = p.selectedId ? findClip(doc, p.selectedId) : null;
                  let clipT = time;
                  if (selClip) {
                    const cStart = selClip.track.kind === "main" ? mainStarts(mainTrack(doc).clips)[selClip.index] : (selClip.clip as any).start ?? 0;
                    clipT = Math.max(0, (time - cStart) * ((selClip.clip as VideoClip).speed ?? 1));
                  }
                  const curTrack = trackingAt(tp, clipT) ?? (p.isTrackingOpen ? {
                    x: tp.initial.x,
                    y: tp.initial.y,
                    scale: 1,
                    rotation: 0,
                    confidence: 1,
                    box: tp.initial?.box,
                  } : null);
                  if (!curTrack) return null;
                  const isDragThis = dragPreview && dragPreview.pointId === tp.id;
                  const effTrackX = isDragThis ? dragPreview.x : curTrack.x;
                  const effTrackY = isDragThis ? dragPreview.y : curTrack.y;
                  const effBox = isDragThis && dragPreview.box ? dragPreview.box : curTrack.box;
                  const ptX = effTrackX * 100;
                  const ptY = effTrackY * 100;
                  const curBoxW = effBox?.w ?? tp.initial.box?.w ?? 0.14;
                  const curBoxH = effBox?.h ?? tp.initial.box?.h ?? 0.14;
                  const boxW = Math.max(2, curBoxW * (curTrack.scale || 1) * 100);
                  const boxH = Math.max(2, curBoxH * (curTrack.scale || 1) * 100);
                  const blurAtt = tp.attachments?.find((a) => a.type === "blur") as BlurAttachment | undefined;
                  const isEllipse = blurAtt ? blurAtt.shape === "ellipse" : tp.type !== "area";

                  const startBoxDrag = (e: React.PointerEvent, edge: string) => {
                    e.stopPropagation();
                    const stageRect = stageRef.current?.getBoundingClientRect();
                    if (!stageRect) return;
                    stageRef.current?.setPointerCapture(e.pointerId);
                    drag.current = {
                      id: tp.id,
                      kind: "trackingBox",
                      trackingPointId: tp.id,
                      edge,
                      px: e.clientX,
                      py: e.clientY,
                      t0: NO_T,
                      rect: { x: 0, y: 0, w: 0, h: 0, rot: 0 },
                      group: `trackBox:${tp.id}:${Math.round(e.timeStamp)}`,
                      moved: false,
                      stage: stageRect,
                      trackInit: { x: effTrackX, y: effTrackY, box: { w: boxW / 100, h: boxH / 100 } },
                    };
                  };

                  return (
                    <div key={tp.id} className="contents">
                      {/* Motion Path Trajectory (Breadcrumb Trail) */}
                      {isAct && tp.keyframes && tp.keyframes.length > 1 && (
                        <svg className="absolute inset-0 size-full pointer-events-none overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                          <polyline
                            points={tp.keyframes.map((k) => `${k.x * 100},${k.y * 100}`).join(" ")}
                            fill="none"
                            stroke={tp.color || "#3b82f6"}
                            strokeWidth="1.2"
                            strokeDasharray="2 2"
                            opacity="0.6"
                            vectorEffect="non-scaling-stroke"
                          />
                          {tp.keyframes
                            .filter((_, idx) => idx % 12 === 0 || idx === tp.keyframes.length - 1)
                            .map((k, ki) => (
                              <circle
                                key={ki}
                                cx={k.x * 100}
                                cy={k.y * 100}
                                r="1.2"
                                fill={Math.abs(k.t - time) < 0.05 ? "#ffffff" : tp.color || "#3b82f6"}
                                stroke={tp.color || "#3b82f6"}
                                strokeWidth="0.8"
                                vectorEffect="non-scaling-stroke"
                              />
                            ))}
                        </svg>
                      )}

                      {/* Anchor Connector Line to Attached Elements */}
                      {isAct &&
                        (tp.attachments || []).map((att) => {
                          if (att.type !== "clip") return null;
                          const f = findClip(doc, att.clipId);
                          if (!f) return null;
                          const targetLayer = visible.find((l) => l.clip.id === att.clipId);
                          let attX = (effTrackX + (att.offset?.x || 0)) * 100;
                          let attY = (effTrackY + (att.offset?.y || 0)) * 100;
                          if (targetLayer) {
                            const r = rectOf(targetLayer);
                            if (r) {
                              attX = ((r.x + r.w / 2) / PW) * 100;
                              attY = ((r.y + r.h / 2) / PH) * 100;
                            }
                          }
                          return (
                            <svg key={att.id} className="absolute inset-0 size-full pointer-events-none overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                              <line
                                x1={`${ptX}`}
                                y1={`${ptY}`}
                                x2={`${attX}`}
                                y2={`${attY}`}
                                stroke={tp.color || "#3b82f6"}
                                strokeWidth="1.5"
                                strokeDasharray="3 3"
                                opacity="0.8"
                                vectorEffect="non-scaling-stroke"
                              />
                              <circle cx={attX} cy={attY} r="2.5" fill={tp.color || "#3b82f6"} stroke="#ffffff" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                            </svg>
                          );
                        })}

                      {/* Adobe Premiere Pro Ellipse Mask Outline or Rect Template Region */}
                      {isEllipse ? (
                        <>
                          <svg className="absolute inset-0 size-full pointer-events-none overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                            {blurAtt?.feather && blurAtt.feather > 0 ? (
                              <ellipse
                                cx={ptX}
                                cy={ptY}
                                rx={boxW / 2 + (blurAtt.feather / 100) * 10}
                                ry={boxH / 2 + (blurAtt.feather / 100) * 10}
                                fill="none"
                                stroke={tp.color || "#3b82f6"}
                                strokeWidth="1"
                                strokeDasharray="3 3"
                                opacity="0.45"
                                vectorEffect="non-scaling-stroke"
                              />
                            ) : null}
                            <ellipse
                              cx={ptX}
                              cy={ptY}
                              rx={boxW / 2}
                              ry={boxH / 2}
                              fill={isAct ? `${tp.color || "#3b82f6"}20` : "transparent"}
                              stroke={tp.color || "#3b82f6"}
                              strokeWidth={isAct ? 2 : 1.25}
                              strokeDasharray={isAct ? undefined : "3 3"}
                              vectorEffect="non-scaling-stroke"
                              className="pointer-events-auto cursor-move"
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                const stageRect = stageRef.current?.getBoundingClientRect();
                                if (!stageRect) return;
                                stageRef.current?.setPointerCapture(e.pointerId);
                                drag.current = {
                                  id: tp.id,
                                  kind: "trackingPoint",
                                  trackingPointId: tp.id,
                                  px: e.clientX,
                                  py: e.clientY,
                                  t0: NO_T,
                                  rect: { x: 0, y: 0, w: 0, h: 0, rot: 0 },
                                  group: `trackPt:${tp.id}:${Math.round(e.timeStamp)}`,
                                  moved: false,
                                  stage: stageRect,
                                  trackInit: { x: effTrackX, y: effTrackY, box: { w: boxW / 100, h: boxH / 100 } },
                                };
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                p.onSelectTrackingPoint?.(tp.id);
                              }}
                            />
                          </svg>

                          {/* Cardinal Resize Handles (North, South, West, East) */}
                          {isAct && (
                            <>
                              <span
                                onPointerDown={(e) => startBoxDrag(e, "n")}
                                className="pointer-events-auto absolute size-2.5 rounded-full border border-white shadow-xs cursor-ns-resize"
                                style={{
                                  backgroundColor: tp.color || "#3b82f6",
                                  left: `${ptX}%`,
                                  top: `${ptY - boxH / 2}%`,
                                  translate: "-50% -50%",
                                }}
                                title="Adjust height"
                              />
                              <span
                                onPointerDown={(e) => startBoxDrag(e, "s")}
                                className="pointer-events-auto absolute size-2.5 rounded-full border border-white shadow-xs cursor-ns-resize"
                                style={{
                                  backgroundColor: tp.color || "#3b82f6",
                                  left: `${ptX}%`,
                                  top: `${ptY + boxH / 2}%`,
                                  translate: "-50% -50%",
                                }}
                                title="Adjust height"
                              />
                              <span
                                onPointerDown={(e) => startBoxDrag(e, "w")}
                                className="pointer-events-auto absolute size-2.5 rounded-full border border-white shadow-xs cursor-ew-resize"
                                style={{
                                  backgroundColor: tp.color || "#3b82f6",
                                  left: `${ptX - boxW / 2}%`,
                                  top: `${ptY}%`,
                                  translate: "-50% -50%",
                                }}
                                title="Adjust width"
                              />
                              <span
                                onPointerDown={(e) => startBoxDrag(e, "e")}
                                className="pointer-events-auto absolute size-2.5 rounded-full border border-white shadow-xs cursor-ew-resize"
                                style={{
                                  backgroundColor: tp.color || "#3b82f6",
                                  left: `${ptX + boxW / 2}%`,
                                  top: `${ptY}%`,
                                  translate: "-50% -50%",
                                }}
                                title="Adjust width"
                              />
                              {/* 4 Diagonal perimeter handles */}
                              <span
                                onPointerDown={(e) => startBoxDrag(e, "nw")}
                                className="pointer-events-auto absolute size-2 rounded-xs border border-white shadow-xs cursor-nwse-resize"
                                style={{
                                  backgroundColor: tp.color || "#3b82f6",
                                  left: `${ptX - boxW * 0.354}%`,
                                  top: `${ptY - boxH * 0.354}%`,
                                  translate: "-50% -50%",
                                }}
                              />
                              <span
                                onPointerDown={(e) => startBoxDrag(e, "ne")}
                                className="pointer-events-auto absolute size-2 rounded-xs border border-white shadow-xs cursor-nesw-resize"
                                style={{
                                  backgroundColor: tp.color || "#3b82f6",
                                  left: `${ptX + boxW * 0.354}%`,
                                  top: `${ptY - boxH * 0.354}%`,
                                  translate: "-50% -50%",
                                }}
                              />
                              <span
                                onPointerDown={(e) => startBoxDrag(e, "sw")}
                                className="pointer-events-auto absolute size-2 rounded-xs border border-white shadow-xs cursor-nesw-resize"
                                style={{
                                  backgroundColor: tp.color || "#3b82f6",
                                  left: `${ptX - boxW * 0.354}%`,
                                  top: `${ptY + boxH * 0.354}%`,
                                  translate: "-50% -50%",
                                }}
                              />
                              <span
                                onPointerDown={(e) => startBoxDrag(e, "se")}
                                className="pointer-events-auto absolute size-2 rounded-xs border border-white shadow-xs cursor-nwse-resize"
                                style={{
                                  backgroundColor: tp.color || "#3b82f6",
                                  left: `${ptX + boxW * 0.354}%`,
                                  top: `${ptY + boxH * 0.354}%`,
                                  translate: "-50% -50%",
                                }}
                              />
                            </>
                          )}
                        </>
                      ) : (
                        <div
                          className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 transition-colors cursor-move ${
                            isAct ? "border-2 border-dashed shadow-sm" : "border border-dashed opacity-60"
                          }`}
                          style={{
                            left: `${ptX}%`,
                            top: `${ptY}%`,
                            width: `${boxW}%`,
                            height: `${boxH}%`,
                            borderColor: tp.color || "#3b82f6",
                            backgroundColor: isAct ? `${tp.color || "#3b82f6"}15` : "transparent",
                          }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            const stageRect = stageRef.current?.getBoundingClientRect();
                            if (!stageRect) return;
                            stageRef.current?.setPointerCapture(e.pointerId);
                            drag.current = {
                              id: tp.id,
                              kind: "trackingPoint",
                              trackingPointId: tp.id,
                              px: e.clientX,
                              py: e.clientY,
                              t0: NO_T,
                              rect: { x: 0, y: 0, w: 0, h: 0, rot: 0 },
                              group: `trackPt:${tp.id}:${Math.round(e.timeStamp)}`,
                              moved: false,
                              stage: stageRect,
                              trackInit: { x: effTrackX, y: effTrackY, box: { w: boxW / 100, h: boxH / 100 } },
                            };
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            p.onSelectTrackingPoint?.(tp.id);
                          }}
                        >
                          {isAct &&
                            (["nw", "ne", "sw", "se"] as const).map((cr) => (
                              <span
                                key={cr}
                                onPointerDown={(e) => startBoxDrag(e, cr)}
                                className="pointer-events-auto absolute size-2.5 rounded-xs border border-white shadow-xs cursor-nwse-resize"
                                style={{
                                  backgroundColor: tp.color || "#3b82f6",
                                  left: cr.includes("e") ? "100%" : 0,
                                  top: cr.includes("s") ? "100%" : 0,
                                  translate: "-50% -50%",
                                }}
                              />
                            ))}
                        </div>
                      )}

                      {/* Label Badge */}
                      <span
                        className="pointer-events-none absolute whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-semibold text-white shadow-xs flex items-center gap-1 select-none z-30"
                        style={{
                          backgroundColor: tp.color || "#3b82f6",
                          left: `${ptX}%`,
                          top: `${ptY - boxH / 2 - 2.5}%`,
                          translate: "-50% -100%",
                        }}
                      >
                        <span className="size-1.5 rounded-full bg-white animate-pulse" />
                        {tp.name}
                      </span>

                      {/* Center Crosshair Target Reticle */}
                      <div
                        className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 size-7 flex items-center justify-center cursor-grab active:cursor-grabbing z-30"
                        style={{ left: `${ptX}%`, top: `${ptY}%` }}
                        title={`Drag to position ${tp.name}`}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          const stageRect = stageRef.current?.getBoundingClientRect();
                          if (!stageRect) return;
                          stageRef.current?.setPointerCapture(e.pointerId);
                          drag.current = {
                            id: tp.id,
                            kind: "trackingPoint",
                            trackingPointId: tp.id,
                            px: e.clientX,
                            py: e.clientY,
                            t0: NO_T,
                            rect: { x: 0, y: 0, w: 0, h: 0, rot: 0 },
                            group: `trackPt:${tp.id}:${Math.round(e.timeStamp)}`,
                            moved: false,
                            stage: stageRect,
                            trackInit: { x: effTrackX, y: effTrackY, box: { w: boxW / 100, h: boxH / 100 } },
                          };
                        }}
                      >
                        {/* Crosshairs */}
                        <span className="absolute inset-y-0 w-0.5 pointer-events-none opacity-80" style={{ backgroundColor: tp.color || "#3b82f6" }} />
                        <span className="absolute inset-x-0 h-0.5 pointer-events-none opacity-80" style={{ backgroundColor: tp.color || "#3b82f6" }} />
                        {/* Outer ring */}
                        <span
                          className="size-5 rounded-full border-2 bg-white/40 backdrop-blur-xs flex items-center justify-center shadow-xs"
                          style={{ borderColor: tp.color || "#3b82f6" }}
                        >
                          <span
                            className="size-2 rounded-full shadow-xs"
                            style={{ backgroundColor: tp.color || "#3b82f6" }}
                          />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Floating Action Pill for Motion Tracking & Face Lock */}
            {p.isTrackingOpen && (
              <div
                className="absolute bottom-3.5 left-1/2 -translate-x-1/2 z-35 flex items-center gap-2 rounded-full bg-black/85 backdrop-blur-md px-3.5 py-1.5 text-xs text-white shadow-xl border border-white/15 pointer-events-auto select-none"
                data-testid="tracking-floating-pill"
              >
                {p.isTracking && p.trackingProgress ? (
                  <>
                    <span className="size-2 rounded-full bg-sky-400 animate-ping" />
                    <span className="font-semibold text-sky-300">
                      Tracking Motion... {p.trackingProgress.percent}%
                    </span>
                    <button
                      type="button"
                      onClick={p.onCancelTracking}
                      className="ml-1 rounded-full bg-red-500/80 hover:bg-red-500 px-2 py-0.5 text-[11px] font-semibold text-white transition-colors"
                    >
                      Cancel
                    </button>
                  </>
                ) : p.trackingPoints && p.trackingPoints.length > 0 ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-emerald-400" />
                      <span className="font-medium text-white/90">
                        {p.trackingPoints.find((x) => x.id === (p.activeTrackingPointId || p.trackingPoints?.[0]?.id))?.name || "Target"} Locked
                      </span>
                    </div>
                    <span className="text-white/30">|</span>
                    <button
                      type="button"
                      onClick={() => {
                        const actId = p.activeTrackingPointId || p.trackingPoints?.[0]?.id;
                        if (actId) p.onStartTracking?.(actId, "both", "full");
                      }}
                      className="flex items-center gap-1 rounded-full bg-sky-500 hover:bg-sky-400 px-2.5 py-0.5 text-xs font-semibold text-white shadow-xs transition-transform active:scale-95"
                    >
                      <Icon name="play" className="size-3 fill-white" />
                      Start Tracking
                    </button>
                  </>
                ) : (
                  <div className="flex items-center gap-1.5 text-white/80">
                    <Icon name="motionTrack" className="size-3.5 text-sky-400" />
                    <span>Auto-detect or place a mask to track</span>
                  </div>
                )}
              </div>
            )}
            {guides.vLines && guides.vLines.length > 0 ? (
              guides.vLines.map((vx, i) => (
                <span key={`vl-${i}-${vx}`} aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-px bg-fuchsia-400 z-30 shadow-[0_0_4px_rgba(232,121,249,0.9)]" style={{ left: `${vx * 100}%` }} />
              ))
            ) : guides.v ? (
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-fuchsia-400 z-30" />
            ) : null}
            {guides.hLines && guides.hLines.length > 0 ? (
              guides.hLines.map((hy, i) => (
                <span key={`hl-${i}-${hy}`} aria-hidden="true" className="pointer-events-none absolute inset-x-0 h-px bg-fuchsia-400 z-30 shadow-[0_0_4px_rgba(232,121,249,0.9)]" style={{ top: `${hy * 100}%` }} />
              ))
            ) : guides.h ? (
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-fuchsia-400 z-30" />
            ) : null}
            {editable && selLayer && selRect && !p.cropId && !p.patchEdit && (
              <div
                data-testid="selection-box"
                data-mode={tmode}
                role="group"
                tabIndex={0}
                aria-label={`${selName} selected. ${selLocked ? "Its track is locked." : selLayer.clip.type === "text" ? "Drag to move, drag a corner or a side to resize, drag rotation handle or corners to turn. Arrow keys move it, plus and minus resize, [ and ] turn." : selLayer.clip.type === "element" ? "Drag to move, drag a corner to resize, drag a side to stretch, drag rotation handle or corners to turn. Arrow keys move it, plus and minus resize, [ and ] turn." : "Drag to move, drag a corner or a side to resize, drag rotation handle or corners to turn. Arrow keys move it, plus and minus resize, [ and ] turn."}`}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    setTmode("transform");
                    return;
                  }
                  nudge(e);
                }}
                className={`absolute rounded-[2px] ${hasCorners(selTransform?.corners) ? "" : `outline outline-1 outline-offset-0 focus-visible:outline-4 ${selLocked ? "outline-dashed outline-white/60" : "outline-link"}`}`}
                style={{
                  left: pct(selRect.x, PW),
                  top: pct(selRect.y, PH),
                  width: pct(selRect.w, PW),
                  height: pct(selRect.h, PH),
                  rotate: selRect.rot ? `${selRect.rot}deg` : undefined,
                  transform: selTransform && (selTransform.skewX || selTransform.skewY || selTransform.flipX || selTransform.flipY)
                    ? `${selTransform.skewX ? `skewX(${selTransform.skewX}deg) ` : ""}${selTransform.skewY ? `skewY(${selTransform.skewY}deg) ` : ""}${selTransform.flipX || selTransform.flipY ? `scale(${selTransform.flipX ? -1 : 1}, ${selTransform.flipY ? -1 : 1})` : ""}`.trim()
                    : undefined,
                  cursor: selLocked ? "not-allowed" : "move",
                }}
              >
                {/* quadrilateral outline when corners are pinned in perspective */}
                {hasCorners(selTransform?.corners) && (() => {
                  const corners = selTransform.corners;
                  const ctl = { x: (0 + (corners?.tl?.x ?? 0)) * 100, y: (0 + (corners?.tl?.y ?? 0)) * 100 };
                  const ctr = { x: (1 + (corners?.tr?.x ?? 0)) * 100, y: (0 + (corners?.tr?.y ?? 0)) * 100 };
                  const cbr = { x: (1 + (corners?.br?.x ?? 0)) * 100, y: (1 + (corners?.br?.y ?? 0)) * 100 };
                  const cbl = { x: (0 + (corners?.bl?.x ?? 0)) * 100, y: (1 + (corners?.bl?.y ?? 0)) * 100 };
                  return (
                    <svg className="absolute inset-0 size-full overflow-visible pointer-events-none z-10" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <polygon
                        points={`${ctl.x},${ctl.y} ${ctr.x},${ctr.y} ${cbr.x},${cbr.y} ${cbl.x},${cbl.y}`}
                        className={`${selLocked ? "stroke-white/60" : "stroke-link"} fill-none`}
                        strokeWidth="1"
                        strokeDasharray={selLocked ? "4 4" : undefined}
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                  );
                })()}
                {/* top rotation stem handle (Figma / Canva style) */}
                {!selLocked && tmode === "transform" && (
                  <div
                    data-testid="rotate-stem"
                    className="absolute -top-7 left-1/2 flex -translate-x-1/2 flex-col items-center pointer-events-auto"
                  >
                    <button
                      type="button"
                      data-testid="rotate-handle"
                      title="Drag to turn (snaps to 90°; Shift: 15° steps; Alt: free)"
                      aria-label="Rotate handle"
                      onPointerDown={onRotateDown}
                      className="group flex size-4 cursor-grab items-center justify-center rounded-full border-2 border-link bg-white shadow-sm transition-transform hover:scale-125 hover:bg-link active:cursor-grabbing"
                    >
                      <span className="size-1.5 rounded-full bg-link group-hover:bg-white" />
                    </button>
                    <span className="h-3 w-0.5 bg-link" />
                  </div>
                )}
                {/* turn from a corner: just around each corner square */}
                {!selLocked && !ctrlHeld && tmode === "transform" &&
                  (["left-0 top-0", "right-0 top-0", "left-0 bottom-0", "right-0 bottom-0"] as const).map((pos, i) => (
                    <span
                      key={pos}
                      data-testid="rotate-corner"
                      aria-hidden="true"
                      title="Drag to turn (snaps to 90°; Shift: 15° steps; Alt: free)"
                      onPointerDown={onRotateDown}
                      className={`absolute ${pos} size-7`}
                      style={{ translate: `calc(${i % 2 ? "50%" : "-50%"} ${i % 2 ? "+" : "-"} 6px) calc(${i > 1 ? "50%" : "-50%"} ${i > 1 ? "+" : "-"} 6px)`, cursor: rotateCursor(i, selRect.rot) }}
                    />
                  ))}
                {/* corner resize / perspective pin handles */}
                {!selLocked && (() => {
                  const corners = selTransform?.corners;
                  const cornerPos: Record<CornerKey, { x: number; y: number }> = {
                    tl: { x: (0 + (corners?.tl?.x ?? 0)) * 100, y: (0 + (corners?.tl?.y ?? 0)) * 100 },
                    tr: { x: (1 + (corners?.tr?.x ?? 0)) * 100, y: (0 + (corners?.tr?.y ?? 0)) * 100 },
                    bl: { x: (0 + (corners?.bl?.x ?? 0)) * 100, y: (1 + (corners?.bl?.y ?? 0)) * 100 },
                    br: { x: (1 + (corners?.br?.x ?? 0)) * 100, y: (1 + (corners?.br?.y ?? 0)) * 100 },
                  };
                  return ([
                    { k: "tl" as CornerKey, cur: "cursor-nwse-resize" },
                    { k: "tr" as CornerKey, cur: "cursor-nesw-resize" },
                    { k: "bl" as CornerKey, cur: "cursor-nesw-resize" },
                    { k: "br" as CornerKey, cur: "cursor-nwse-resize" },
                  ] as const).map(({ k, cur }) => {
                    const isPersp = ctrlHeld || tmode === "perspective";
                    return (
                      <span
                        key={k}
                        data-testid="resize-handle"
                        data-corner={k}
                        aria-hidden="true"
                        title={
                          ctrlHeld
                            ? `Drag corner ${k.toUpperCase()} to pin perspective (Ctrl active)`
                            : tmode === "perspective"
                              ? `Drag corner ${k.toUpperCase()} to pin perspective`
                              : "Drag to resize (Ctrl: Perspective, Shift: free shape, Alt: from center)"
                        }
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          if (e.button === 0 && selLayer && selRect) {
                            const usePersp = e.ctrlKey || e.metaKey || ctrlHeld || tmode === "perspective";
                            startDrag(e, selLayer.clip.id, usePersp ? "perspective" : "corner", selRect, undefined, k);
                          }
                        }}
                        className={`absolute size-3 rounded-sm border-2 transition-transform hover:scale-125 ${
                          isPersp
                            ? "border-white bg-primary cursor-crosshair ring-2 ring-primary/40 shadow-sm"
                            : `border-link bg-white ${cur}`
                        }`}
                        style={{ left: `${cornerPos[k].x}%`, top: `${cornerPos[k].y}%`, translate: "-50% -50%" }}
                      />
                    );
                  });
                })()}
                {/* a picture, video or text: resize it from a side, the opposite side stays (not on a side too thin for a handle) */}
                {!selLocked &&
                  tmode === "transform" &&
                  selLayer.clip.type !== "element" &&
                  (["l", "r", "t", "b"] as const)
                    .filter((ed) => (ed === "l" || ed === "r" ? selRect.h / PH >= 0.04 : selRect.w / PW >= 0.04))
                    .map((ed) => {
                      const isSkew = ctrlHeld;
                      const skewCur = ed === "t" || ed === "b" ? "cursor-ew-resize" : "cursor-ns-resize";
                      const defaultCur = ed === "l" || ed === "r" ? "cursor-ew-resize" : "cursor-ns-resize";
                      return (
                        <span
                          key={ed}
                          data-testid="side-handle"
                          data-edge={ed}
                          aria-hidden="true"
                          title={
                            ctrlHeld
                              ? `Drag edge ${ed.toUpperCase()} to skew (Ctrl active)`
                              : "Drag to resize (Ctrl: Skew, the opposite side stays)"
                          }
                          onPointerDown={onSideDown}
                          className={`absolute rounded-sm border-2 transition-all hover:scale-110 ${
                            isSkew
                              ? "border-primary bg-white ring-2 ring-primary/40 shadow-xs"
                              : "border-link bg-white"
                          } ${
                            ed === "l" || ed === "r"
                              ? `top-1/2 h-4 w-2 ${isSkew ? skewCur : defaultCur}`
                              : `left-1/2 h-2 w-4 ${isSkew ? skewCur : defaultCur}`
                          } ${ed === "l" ? "left-0" : ed === "r" ? "right-0" : ed === "t" ? "top-0" : "bottom-0"}`}
                          style={{ translate: `${ed === "r" ? "50%" : "-50%"} ${ed === "b" ? "50%" : "-50%"}` }}
                        />
                      );
                    })}
                {/* an element: stretch it from the middle of a side (not on a side too thin for a handle) */}
                {!selLocked &&
                  tmode === "transform" &&
                  selLayer.clip.type === "element" &&
                  (["l", "r", "t", "b"] as const)
                    .filter((ed) => (ed === "l" || ed === "r" ? selRect.h / PH >= 0.004 : selRect.w / PW >= 0.04 && selRect.h / PH >= 0.04))
                    .map((ed) => {
                      const isSkew = ctrlHeld;
                      const skewCur = ed === "t" || ed === "b" ? "cursor-ew-resize" : "cursor-ns-resize";
                      const defaultCur = ed === "l" || ed === "r" ? "cursor-ew-resize" : "cursor-ns-resize";
                      return (
                        <span
                          key={ed}
                          data-testid="stretch-handle"
                          data-edge={ed}
                          aria-hidden="true"
                          title={
                            ctrlHeld
                              ? `Drag edge ${ed.toUpperCase()} to skew (Ctrl active)`
                              : "Drag to stretch (Ctrl: Skew, Alt: from the middle)"
                          }
                          onPointerDown={onStretchDown}
                          className={`absolute rounded-sm border-2 transition-all hover:scale-110 ${
                            isSkew
                              ? "border-primary bg-white ring-2 ring-primary/40 shadow-xs"
                              : "border-link bg-white"
                          } ${
                            ed === "l" || ed === "r"
                              ? `top-1/2 h-4 w-2 ${isSkew ? skewCur : defaultCur}`
                              : `left-1/2 h-2 w-4 ${isSkew ? skewCur : defaultCur}`
                          } ${ed === "l" ? "left-0" : ed === "r" ? "right-0" : ed === "t" ? "top-0" : "bottom-0"}`}
                          style={{ translate: `${ed === "r" ? "50%" : "-50%"} ${ed === "b" ? "50%" : "-50%"}` }}
                        />
                      );
                    })}
                {/* Skew handles: top, bottom, left, right */}
                {!selLocked && tmode === "skew" &&
                  ([
                    { edge: "t", style: "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-2 cursor-ew-resize" },
                    { edge: "b", style: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-8 h-2 cursor-ew-resize" },
                    { edge: "l", style: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-8 cursor-ns-resize" },
                    { edge: "r", style: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-2 h-8 cursor-ns-resize" },
                  ] as const).map(({ edge, style }) => (
                    <span
                      key={edge}
                      data-testid="skew-handle"
                      data-edge={edge}
                      aria-hidden="true"
                      title={`Drag to skew (edge ${edge})`}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        if (e.button === 0 && selLayer && selRect) {
                          startDrag(e, selLayer.clip.id, "skew", selRect, edge);
                        }
                      }}
                      className={`absolute rounded border-2 border-primary bg-white shadow-sm transition-transform hover:scale-110 active:scale-95 ${style}`}
                    />
                  ))}
                {/* Pivot handle (not for text clips) */}
                {!selLocked && selLayer.clip.type !== "text" && selTransform && tmode === "transform" && (
                  <span
                    data-testid="pivot-handle"
                    aria-hidden="true"
                    title="Drag pivot point (snaps to center and edges; Alt: free)"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (e.button === 0 && selLayer && selRect) {
                        startDrag(e, selLayer.clip.id, "pivot", selRect);
                      }
                    }}
                    className="absolute size-4 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-primary bg-white shadow-sm flex items-center justify-center z-20 hover:scale-125 transition-transform"
                    style={{
                      left: `${(selTransform.pivot?.x ?? 0.5) * 100}%`,
                      top: `${(selTransform.pivot?.y ?? 0.5) * 100}%`,
                    }}
                  >
                    <span className="size-1 rounded-full bg-primary" />
                  </span>
                )}
                {/* Floating modifier hint when Ctrl is held */}
                {ctrlHeld && (
                  <div
                    data-testid="ctrl-modifier-hint"
                    className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 z-35 flex items-center gap-1.5 whitespace-nowrap rounded-full bg-black/85 backdrop-blur-md px-3 py-0.5 text-[11px] font-medium text-white shadow-xl border border-white/15 select-none animate-in fade-in duration-150"
                  >
                    <span className="size-1.5 rounded-full bg-sky-400" />
                    <span>Corners: <strong className="text-sky-300 font-semibold">Perspective</strong> · Sides: <strong className="text-amber-300 font-semibold">Skew</strong></span>
                  </div>
                )}
                {/* Corner radius handle */}
                {!selLocked && !hasCorners(selTransform?.corners) && tmode === "transform" && selTransform && (() => {
                  const clip = selLayer.clip;
                  const isPic = clip.type === "video" || clip.type === "image";
                  const canRadius = isPic
                    ? !clip.mask || clip.mask.shape === "rect" || clip.mask.shape === "rounded"
                    : clip.type === "element" && (clip.el.kind === "rect" || clip.el.kind === "badge" || clip.el.kind === "progress");
                  if (!canRadius) return null;
                  const clipRadius = clip.type === "element" ? (clip.el.radius ?? 0) : (isPic && "mask" in clip && clip.mask?.shape === "rounded") ? clip.mask.radius : 0;
                  const minSide = Math.min(selRect.w, selRect.h);
                  const r = Math.max(clipRadius, 0.12) * minSide;
                  return (
                    <span
                      data-testid="radius-handle"
                      aria-hidden="true"
                      title="Drag to round corners"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        if (e.button === 0 && selLayer && selRect) {
                          startDrag(e, selLayer.clip.id, "radius", selRect);
                        }
                      }}
                      className="absolute size-3 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-full border-2 border-white bg-primary shadow-sm z-20 hover:scale-125 transition-transform"
                      style={{ left: `${(r / Math.max(1e-9, selRect.w)) * 100}%`, top: `${(r / Math.max(1e-9, selRect.h)) * 100}%` }}
                    />
                  );
                })()}
              </div>
            )}
            {turning !== null && selRect && (
              <span data-testid="turn-angle" aria-live="polite" className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded bg-black/75 px-1.5 py-0.5 text-xs tabular-nums text-white" style={{ left: pct(selRect.x + selRect.w / 2, PW), top: pct(selRect.y + selRect.h / 2, PH) }}>
                {turning}°
              </span>
            )}
            {movingPos !== null && selRect && (
              <span
                data-testid="moving-coord-pill"
                aria-live="polite"
                className="pointer-events-none absolute z-20 -translate-x-1/2 rounded bg-black/85 px-2 py-0.5 text-[0.6875rem] font-medium tabular-nums text-white shadow border border-white/10"
                style={{ left: pct(selRect.x + selRect.w / 2, PW), top: `calc(${pct(selRect.y, PH)} - 24px)` }}
              >
                X: {movingPos.x}% · Y: {movingPos.y}%
              </span>
            )}
            {editable && p.logoSelected && logoBox && !p.cropId && !p.patchEdit && (
              <div
                data-testid="logo-box"
                role="group"
                tabIndex={0}
                aria-label="Your logo selected. Drag to move (it snaps to the corners), drag a corner or a side to resize. Arrow keys move it."
                onKeyDown={nudgeLogo}
                className="absolute rounded-[2px] outline outline-2 outline-link focus-visible:outline-4"
                style={{ left: pct(logoBox.x, PW), top: pct(logoBox.y, PH), width: pct(logoBox.w, PW), height: pct(logoBox.h, PH), cursor: "move" }}
              >
                {(["l", "r", "t", "b"] as const).map((ed) => (
                  <span
                    key={ed}
                    data-testid={`logo-${ed}`}
                    data-edge={ed}
                    aria-hidden="true"
                    title="Drag to resize (the opposite side stays)"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (e.button === 0) startLogo(e, ed);
                    }}
                    className={`absolute rounded-sm border-2 border-link bg-white ${ed === "l" || ed === "r" ? "top-1/2 h-4 w-2 cursor-ew-resize" : "left-1/2 h-2 w-4 cursor-ns-resize"} ${ed === "l" ? "left-0" : ed === "r" ? "right-0" : ed === "t" ? "top-0" : "bottom-0"}`}
                    style={{ translate: `${ed === "r" ? "50%" : "-50%"} ${ed === "b" ? "50%" : "-50%"}` }}
                  />
                ))}
                {(["lt", "rt", "lb", "rb"] as const).map((ed, i) => (
                  <span
                    key={ed}
                    data-testid={`logo-${ed}`}
                    aria-hidden="true"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (e.button === 0) startLogo(e, ed);
                    }}
                    className={`absolute ${ed.includes("l") ? "left-0" : "right-0"} ${ed.includes("t") ? "top-0" : "bottom-0"} size-3 rounded-sm border-2 border-link bg-white ${i === 0 || i === 3 ? "cursor-nwse-resize" : "cursor-nesw-resize"}`}
                    style={{ translate: `${i % 2 ? "50%" : "-50%"} ${i > 1 ? "50%" : "-50%"}` }}
                  />
                ))}
              </div>
            )}
            {dropGhost && (
              <div
                aria-hidden="true"
                data-testid="drop-ghost"
                className="pointer-events-none absolute flex flex-col items-center justify-center rounded-sm border-2 border-dashed border-primary bg-primary/20 shadow-[0_0_0_1px_rgba(0,0,0,0.4)] backdrop-blur-[1px] overflow-visible"
                style={{ left: pct(dropGhost.x, PW), top: pct(dropGhost.y, PH), width: pct(dropGhost.w, PW), height: pct(dropGhost.h, PH) }}
              >
                {/* Visual Thumbnail */}
                {elementDragged?.emoji ? (
                  <span className="text-4xl drop-shadow select-none animate-pulse">{elementDragged.emoji}</span>
                ) : elementDragged ? (
                  <div className="flex size-10 items-center justify-center rounded-lg border border-primary/60 bg-primary/40 shadow-inner">
                    <Icon name="elements" className="size-6 text-white" />
                  </div>
                ) : textDragged ? (
                  <div className="flex flex-col items-center justify-center px-3 text-center">
                    <span className="text-sm font-bold text-white tracking-wide drop-shadow-md">{textDragged.label || "Heading Text"}</span>
                  </div>
                ) : memeDragged ? (
                  <div className="relative flex size-full items-center justify-center overflow-hidden rounded p-1">
                    <img src={memeDragged.thumbUrl || `/api/library/memes/${memeDragged.id}/thumb`} alt="" className="size-full rounded object-cover shadow" />
                    <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.5 font-mono text-[9px] text-white">
                      {memeDragged.duration.toFixed(1)}s
                    </span>
                  </div>
                ) : dragged && dragged.kind === "image" ? (
                  <div className="h-full w-full overflow-hidden rounded p-1">
                    <img src={localThumb(dragged.id) ?? `/api/videos/${dragged.id}/thumb`} alt="" className="h-full w-full object-contain drop-shadow" />
                  </div>
                ) : null}

                {/* Floating pill badge with label */}
                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/85 px-2 py-0.5 text-[0.6875rem] font-medium text-white shadow border border-white/10">
                  {elementDragged?.emoji ? `${elementDragged.emoji} ` : ""}{textDragged?.label || elementDragged?.label || memeDragged?.title || dragged?.fileName || "Drop here"}
                </span>
              </div>
            )}
          </div>
        </div>
        <VideoControls
          playing={isPlaying}
          canPlay={!empty}
          time={time}
          duration={duration}
          fps={fps}
          muted={muted}
          loop={loop}
          hasAudio={hasAudio}
          onTogglePlay={toggle}
          onSeek={seek}
          onStep={step}
          onToggleMute={() =>
            setMuted((m) => {
              writePreviewMuted(!m);
              return !m;
            })
          }
          onToggleLoop={() => setLoop((l) => !l)}
          fullscreen={isFull}
          onFullscreen={() => {
            const el = frameRef.current;
            if (!el) return;
            if (document.fullscreenElement) void document.exitFullscreen();
            else void el.requestFullscreen?.().catch(() => undefined);
          }}
        />
        {/* one hidden <audio> per sound clip */}
        <div hidden aria-hidden="true">
          {aClips.map((c) => (
            <audio
              key={`${c.id}:${c.src}`}
              ref={(el) => {
                if (el) sounds.current.set(c.id, el);
                else sounds.current.delete(c.id);
              }}
              src={c.src}
              // only sounds near the playhead load (many clips would block each other's downloads)
              preload={time > c.start - 10 && time < c.start + c.len + 2 ? "auto" : "none"}
            />
          ))}
        </div>
      </div>
    </figure>
  );
}
