import { z } from "zod";
import { MIN_SEGMENT_FRAMES, segmentsOf } from "./timeline";
import { BLEND_MODES } from "../render/blend";
import { DEFAULT_OUTPUT, editSpecSchema, opInstanceSchema, outputSchema, sanitizeOutput, sanitizeSpec, type EditSpec, type OpInstance, type OutputSettings } from "./spec";
import { clipTrackingSchema, type ClipTracking, type TrackingPoint, type TrackingKeyframe } from "../tracking/types";
import { normalizeMarks } from "../text/marks";

/**
 * The project timeline (EditSpec v2): a canvas and tracks of clips.
 *
 *   overlay tracks  (V2, V3…)  videos, pictures, text, elements placed freely in time (`start`)
 *   main track      (V1)       videos, pictures and blank scenes back to back ("magnetic": no gaps)
 *   audio tracks    (A1, A2…)  music, voiceover, effects placed freely in time
 *
 * Video clips carry their own effects (`ops`: background removal), so each
 * clip can be keyed differently. Times are seconds: `in`/`out` are in the
 * clip's own media, `start` is on the timeline. The old single-video spec
 * (EditSpec v1) converts with docFromSpec.
 */

const localId = z.string().regex(/^[\w-]{1,40}$/);
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const secs = z.number().finite().min(0);

export const CANVAS_PRESETS = [
  { id: "16:9", label: "16:9 · YouTube, website", width: 1920, height: 1080 },
  { id: "16:9-720", label: "16:9 · 1280 × 720", width: 1280, height: 720 },
  { id: "9:16", label: "9:16 · Reels, Shorts, Stories", width: 1080, height: 1920 },
  { id: "1:1", label: "1:1 · Instagram post", width: 1080, height: 1080 },
  { id: "4:5", label: "4:5 · Instagram portrait", width: 1080, height: 1350 },
  { id: "4:3", label: "4:3 · Classic TV, slides", width: 1440, height: 1080 },
  { id: "3:4", label: "3:4 · Tall photo", width: 1080, height: 1440 },
  { id: "21:9", label: "21:9 · Cinema wide", width: 2560, height: 1080 },
] as const;

export const backdropSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("gradient"), from: hex, to: hex, angle: z.number().finite().min(-360).max(360) }),
  z.object({ kind: z.literal("set"), id: z.string().max(40) }),
  z.object({ kind: z.literal("media"), mediaId: uuid }),
]);
export type Backdrop = z.infer<typeof backdropSchema>;

export const canvasSchema = z.object({
  width: z.number().int().min(64).max(3840),
  height: z.number().int().min(64).max(3840),
  fps: z.number().finite().min(1).max(60),
  /** "transparent" for website overlays (transparent export); a color for normal videos. */
  background: z.union([z.literal("transparent"), hex]),
  /** What's behind everything (Replace Background): a gradient, a built-in studio set, or a picture / video (lib/backdrops). */
  backdrop: backdropSchema.optional(),
  /** Canvas fit mode: "fit" (all visible) or "fill" (fill height/cover). */
  fit: z.enum(["fit", "fill"]).optional(),
});
export type Canvas = z.infer<typeof canvasSchema>;

const sharePoint = z.object({ x: z.number().finite().min(-1).max(1), y: z.number().finite().min(-1).max(1) });
export const transformSchema = z.object({
  /** fit: the whole picture is visible; fill: it covers the canvas (edges may be cut). */
  fit: z.enum(["fit", "fill"]),
  /** Offset of the center, in canvas widths/heights (0 = centered). */
  x: z.number().finite().min(-2).max(2),
  y: z.number().finite().min(-2).max(2),
  scale: z.number().finite().min(0.05).max(5),
  /** Cut off each edge, as a share of the picture (lib/player/look). */
  crop: z.object({ l: z.number().finite().min(0).max(0.45), t: z.number().finite().min(0).max(0.45), r: z.number().finite().min(0).max(0.45), b: z.number().finite().min(0).max(0.45) }).optional(),
  /** Degrees, clockwise, around the picture's middle. */
  rotation: z.number().finite().min(-360).max(360).optional(),
  flipX: z.boolean().optional(),
  flipY: z.boolean().optional(),
  /** Horizontal skew / slant in degrees (-60 to 60). */
  skewX: z.number().finite().min(-60).max(60).optional(),
  /** Vertical skew in degrees (-60 to 60). */
  skewY: z.number().finite().min(-60).max(60).optional(),
  /** Free width / height: multipliers on top of `scale` (the box is baseW·scale·scaleX × baseH·scale·scaleY). */
  scaleX: z.number().finite().min(0.05).max(20).optional(),
  scaleY: z.number().finite().min(0.05).max(20).optional(),
  /** Perspective: each corner's move, in shares of the box's own width / height (lib/player/quad). */
  corners: z.object({ tl: sharePoint, tr: sharePoint, br: sharePoint, bl: sharePoint }).optional(),
  /** The point it turns, sizes and skews around (shares of the box; the middle when absent). */
  pivot: z.object({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) }).optional(),
});
export type Transform = z.infer<typeof transformSchema>;
export const DEFAULT_TRANSFORM: Transform = { fit: "fit", x: 0, y: 0, scale: 1 };

const fades = { fadeIn: z.number().finite().min(0).max(10), fadeOut: z.number().finite().min(0).max(10) };
/** A name the user gave a track ("Logo", "Music"…); otherwise "Overlay 1", "Video 1", "Audio 1". */
const trackName = z.string().max(40).optional();

/** Color correction and looks of a picture clip (one color matrix: lib/player/look). */
export const colorSchema = z.object({
  /** Gain: 0 = unchanged, −0.5 darker … +0.5 brighter. */
  brightness: z.number().finite().min(-1).max(1),
  /** 1 = unchanged. */
  contrast: z.number().finite().min(0).max(3),
  /** 1 = unchanged, 0 = black & white. */
  saturation: z.number().finite().min(0).max(3),
  /** −1 cool (blue) … +1 warm (orange). */
  temperature: z.number().finite().min(-1).max(1),
  /** A named look (filter), see LOOKS. */
  look: z.string().max(24).optional(),
  /** Darker corners, 0–1. */
  vignette: z.number().finite().min(0).max(1).optional(),
  /** Sharpening, 0–1 ("Enhance quality"; shows in the export). */
  sharpen: z.number().finite().min(0).max(1).optional(),
  /** Glow intensity, 0-1 */
  glow: z.number().finite().min(0).max(1).optional(),
  /** Film grain intensity, 0-1 */
  grain: z.number().finite().min(0).max(1).optional(),
  /** Blur strength, 0-1 */
  blur: z.number().finite().min(0).max(1).optional(),
  /** Pixelate strength, 0-1 */
  pixelate: z.number().finite().min(0).max(1).optional(),
});
export type ColorAdjust = z.infer<typeof colorSchema>;

/** A shape the picture is cut to (round camera bubble, rounded corners) and an optional border. */
export const maskShapeSchema = z.enum(["rect", "rounded", "circle", "diamond", "star", "custom"]);
export type MaskShape = z.infer<typeof maskShapeSchema>;

export const maskSchema = z.object({
  shape: maskShapeSchema,
  /** Corner radius for "rounded", as a share of the shorter side (0–0.5). */
  radius: z.number().finite().min(0).max(0.5),
  /** Soft edge, in output pixels. */
  feather: z.number().finite().min(0).max(60),
  border: z.object({ color: hex, width: z.number().finite().min(0).max(40) }).optional(),
  /** Custom polygon mask points (normalized 0..1 relative to clip bounds). */
  points: z.array(z.object({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) })).min(3).max(24).optional(),
});
export type ClipMask = z.infer<typeof maskSchema>;
/**
 * A box over part of the picture (a watermark or logo, a face, a number plate):
 * remove it (filled in from around it), blur it, or cover it with a color or a
 * picture. Position and size are shares of the source frame (lib/player/patches).
 */
export const patchSchema = z.object({
  id: z.string().max(20),
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  w: z.number().finite().min(0.005).max(1),
  h: z.number().finite().min(0.005).max(1),
  mode: z.enum(["remove", "blur", "cover"]),
  /** Blur strength (source pixels). */
  strength: z.number().finite().min(1).max(60).optional(),
  /** Cover: a color… */
  color: hex.optional(),
  /** …or a picture from My Assets. */
  mediaId: uuid.optional(),
});
export type Patch = z.infer<typeof patchSchema>;

/** A transition into a Video 1 clip from the one before it (the two overlap: lib/player/transitions). */
export const transitionSchema = z.object({
  // (the same list as lib/player/transitions TRANSITION_TYPES)
  type: z.enum(["crossfade", "dipBlack", "dipWhite", "slideLeft", "slideRight", "slideUp", "slideDown", "pushLeft", "pushRight", "wipeLeft", "wipeRight", "wipeUp", "wipeDown", "zoomIn", "zoomOut", "circleOpen", "circleClose", "spin"]),
  duration: z.number().finite().min(0.1).max(3),
});
export type ClipTransition = z.infer<typeof transitionSchema>;
const looks = { color: colorSchema.optional(), mask: maskSchema.optional(), patches: z.array(patchSchema).max(8).optional(), transitionIn: transitionSchema.optional() };

/**
 * Keyframes (like CapCut): each one is how the clip looks at a moment — its
 * place, size, angle and opacity — and between two keyframes it glides from
 * one to the other (lib/edit/keyframes; the export: lib/player/motion).
 * `t`: seconds from the clip's start (timeline time). A key may sit just
 * outside the clip after a trim: it still shapes the motion into the clip.
 */
export const MAX_KEYFRAMES = 40;
export const keyframeSchema = z.object({
  t: z.number().finite().min(-86400).max(86400),
  x: z.number().finite().min(-2).max(2),
  y: z.number().finite().min(-2).max(2),
  scale: z.number().finite().min(0.05).max(5),
  rotation: z.number().finite().min(-360).max(360),
  opacity: z.number().finite().min(0).max(1),
  /** Free width / height and skew at this moment (absent in older keys: the clip's own values). */
  scaleX: z.number().finite().min(0.05).max(20).optional(),
  scaleY: z.number().finite().min(0.05).max(20).optional(),
  skewX: z.number().finite().min(-60).max(60).optional(),
  skewY: z.number().finite().min(-60).max(60).optional(),
  /** How it moves to the next keyframe: smooth (eases in and out, the default) or linear (steady). */
  ease: z.enum(["smooth", "linear"]).optional(),
});
export type Keyframe = z.infer<typeof keyframeSchema>;
/** Opacity (1 = solid) and keyframes: video, picture, text and element clips. */
const motion = {
  opacity: z.number().finite().min(0).max(1).optional(),
  keyframes: z.array(keyframeSchema).max(MAX_KEYFRAMES).optional(),
  /** How it mixes with what's behind it (overlay tracks; lib/render/blend). */
  blend: z.enum(BLEND_MODES).optional(),
};

export const clipGenerationSchema = z.object({
  jobId: z.string().optional(),
  mediaType: z.enum(["video", "image", "audio"]),
  prompt: z.string(),
  progress: z.number().min(0).max(100).default(0),
  status: z.enum(["queued", "generating", "ready", "failed"]).default("generating"),
  error: z.string().optional(),
  aspect: z.string().optional(),
  provider: z.string().default("gemini"),
  startedAt: z.number().default(() => Date.now()),
  referenceImageId: z.string().optional(),
});
export type ClipGeneration = z.infer<typeof clipGenerationSchema>;

export const volumeKeyframeSchema = z.object({
  t: secs,
  volume: z.number().finite().min(0).max(2),
});
export type VolumeKeyframe = z.infer<typeof volumeKeyframeSchema>;

export const videoClipSchema = z.object({
  id: localId,
  type: z.literal("video"),
  mediaId: uuid,
  in: secs,
  out: z.number().finite().positive(),
  /** Background removal etc. for this clip. */
  ops: z.array(opInstanceSchema).max(20),
  transform: transformSchema,
  volume: z.number().finite().min(0).max(2),
  /** "Remove background noise" on the clip's sound (lib/audio/denoise). */
  denoise: z.enum(["light", "strong", "studio"]).optional(),
  /** Play a stabilized copy (camera shake removed; lib/media/derived). */
  stabilize: z.boolean().optional(),
  /** Playback speed (0.25–4; 1 = normal). The sound keeps its pitch. */
  speed: z.number().finite().min(0.25).max(4).optional(),
  /** Play backwards (a reversed copy of [in, out]: lib/media/reverse). */
  reversed: z.boolean().optional(),
  /** Loop playback seamlessly across clip duration. */
  loop: z.boolean().optional(),
  /** EBU R128 loudness levelling (-16 LUFS). */
  loudness: z.boolean().optional(),
  muted: z.boolean(),
  ...fades,
  ...looks,
  ...motion,
  /** Editor memory for this clip's Background Removal card. */
  ui: z.object({ method: z.enum(["color", "black", "ai"]), keySource: z.enum(["detected", "picked", "typed", "default"]) }).optional(),
  generation: clipGenerationSchema.optional(),
  tracking: clipTrackingSchema.optional(),
  volumeAutomation: z.array(volumeKeyframeSchema).max(500).optional(),
  /** If audio was detached onto an audio track, the ID of that audio clip */
  detachedAudioId: localId.optional(),
});
/** Entrance / exit animation of pictures and text (the preview and the export use lib/player/anim.ts). */
// (typewriter: text only)
const animKind = z.enum(["none", "fade", "slide", "rise", "pop", "zoom", "bounce", "blur", "typewriter"]);
export const animSchema = z.object({ in: animKind, out: animKind });
export type Anim = z.infer<typeof animSchema>;
export const NO_ANIM: Anim = { in: "none", out: "none" };

export const imageClipSchema = z.object({
  id: localId,
  type: z.literal("image"),
  mediaId: uuid,
  duration: z.number().finite().min(0.1).max(3600),
  transform: transformSchema,
  anim: animSchema.optional(),
  ...fades,
  ...looks,
  ...motion,
  generation: clipGenerationSchema.optional(),
});
/** A built-in font, a Google font ("gf:<Family>", lib/text/fonts), or one of your Brand Kit fonts ("brand:<id>"). */
export const fontSchema = z.union([z.enum(["sans", "serif", "rounded", "mono", "condensed"]), z.string().regex(/^brand:[a-f0-9]{12}$/), z.string().regex(/^gf:[A-Za-z0-9 ]{1,64}$/)]);
export const textStyleSchema = z.object({
  preset: z.enum(["title", "lowerThird", "breaking", "caption", "plain"]),
  font: fontSchema,
  size: z.number().finite().min(8).max(400),
  color: hex,
  /** Box behind the text, or none. */
  box: z.union([z.literal("none"), hex]),
  align: z.enum(["left", "center", "right"]),
  bold: z.boolean(),
  /** Second color: the lower third's small line, the breaking-news label. */
  accent: hex,
  /** Soft shadow behind text without a box (readable on busy video). */
  shadow: z.boolean(),
  /** Effects: an outline around the letters (width: a share of the text size). */
  outline: z.object({ color: hex, width: z.number().finite().min(0.01).max(0.3) }).optional(),
  /** A second color: the letters go from `color` at the top to this at the bottom. */
  gradient: hex.optional(),
  /** Room between the letters, a share of the text size (0 = normal). */
  spacing: z.number().finite().min(-0.1).max(1).optional(),
  /** The box's shape: rounded corners (the default), a pill, or square. */
  shape: z.enum(["rounded", "pill", "square"]).optional(),
  /** The shadow (when it's on): soft (the default), strong, or a glow in the second color. */
  shadowStyle: z.enum(["soft", "strong", "glow"]).optional(),
  /** Word-by-word highlight style for captions (Reels & Shorts). */
  highlightStyle: z.enum(["none", "karaoke", "bounce", "glow", "box", "pop"]).optional(),
  /** Highlight accent color for active spoken words. */
  highlightColor: hex.optional(),
  /** Slanted letters, a line under them, a line through them (the whole text; marks can change parts). */
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  strike: z.boolean().optional(),
});
/**
 * Part of a text drawn its own way (select letters in the Text panel): from…to are positions in `text`
 * (on whole letters), and only what it changes is set. `size` is times the text's size.
 */
export const textMarkSchema = z
  .object({
    from: z.number().int().min(0).max(1000),
    to: z.number().int().min(1).max(1000),
    font: fontSchema.optional(),
    size: z.number().finite().min(0.25).max(4).optional(),
    color: hex.optional(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    strike: z.boolean().optional(),
    /** a marker-pen color behind these letters */
    highlight: hex.optional(),
  })
  .refine((m) => m.to > m.from, "A styled part needs at least one letter.");
export type TextMark = z.infer<typeof textMarkSchema>;
export const textClipSchema = z.object({
  id: localId,
  type: z.literal("text"),
  text: z.string().max(1000),
  style: textStyleSchema,
  duration: z.number().finite().min(0.1).max(3600),
  /** Subtitles: when each word is said, seconds from the clip's start (word-by-word styles follow them). */
  wordTimes: z.array(z.number().finite().min(0).max(3600)).max(60).optional(),
  /** Letters styled their own way (lib/text/marks): sorted, not overlapping. */
  marks: z.array(textMarkSchema).max(200).optional(),
  transform: transformSchema,
  anim: animSchema,
  ...fades,
  ...motion,
  transitionIn: transitionSchema.optional(),
});
/**
 * Elements (the Elements panel): shapes, lines and arrows, stickers, emoji and
 * news graphics. The browser draws them from these settings (lib/elements/draw)
 * for the preview and the export alike. They're sized and placed like a
 * picture whose width ÷ height is `aspect` (lib/elements/geometry).
 */
export const ELEMENT_KINDS = ["rect", "ellipse", "polygon", "star", "line", "arrow", "marker", "bubble", "tag", "ribbon", "badge", "icon", "emoji", "progress", "ticker", "pulse", "lowerThird", "locationBug", "audioWave", "viewfinder", "focusTarget", "battery"] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];
const paint = z.union([z.literal("none"), hex]);
export const elementLookSchema = z.object({
  kind: z.enum(ELEMENT_KINDS),
  /** The ready-made item it came from (lib/elements/catalog): its name. */
  preset: z.string().max(40).optional(),
  /** Width ÷ height of its box. */
  aspect: z.number().finite().min(0.02).max(200),
  fill: paint,
  /** 1 = solid (a highlighter is see-through). */
  fillAlpha: z.number().finite().min(0).max(1).optional(),
  stroke: paint,
  /** The outline: a share of the box's shorter side. */
  strokeWidth: z.number().finite().min(0).max(0.5),
  /** Rounded corners: a share of the shorter side (0.5 = round ends). */
  radius: z.number().finite().min(0).max(0.5).optional(),
  /** A soft shadow under it (easier to see on busy video). */
  shadow: z.boolean().optional(),
  /** Corners of a polygon, points of a star. */
  points: z.number().int().min(3).max(24).optional(),
  /** How deep a star's points go: its inner corners, a share of its size. */
  inner: z.number().finite().min(0.1).max(0.95).optional(),
  /** Arrow heads. */
  heads: z.enum(["none", "end", "both"]).optional(),
  dash: z.boolean().optional(),
  /** How much a curved arrow or an underline bends (−1 … 1). */
  curve: z.number().finite().min(-1).max(1).optional(),
  /** A kind's own style: a speech or thought bubble; a plain, fading or hand-drawn line. */
  variant: z.enum(["speech", "thought", "plain", "fade", "hand"]).optional(),
  /** Which drawn sticker (kind "icon", lib/elements/draw). */
  icon: z.string().max(24).optional(),
  /** Words on it: badges, bubbles, bursts, tags, ribbons, numbers, the ticker. */
  text: z.string().max(200).optional(),
  textColor: hex.optional(),
  font: fontSchema.optional(),
  bold: z.boolean().optional(),
  /** Secondary words for lower thirds or location bugs. */
  subText: z.string().max(200).optional(),
  subTextColor: hex.optional(),
  subFill: paint.optional(),
  /** Battery level percentage (0 to 100). */
  batteryLevel: z.number().min(0).max(100).optional(),
  /** Lens aperture text (e.g. "f 1.8"). */
  aperture: z.string().max(20).optional(),
  /** Resolution / quality label (e.g. "4K HD"). */
  resolutionTag: z.string().max(20).optional(),
  /** Custom timecode start offset in seconds. */
  timecodeOffset: z.number().optional(),
  /** A badge's round dot ("● LIVE") and slant ("BREAKING"). */
  dot: z.boolean().optional(),
  skew: z.number().finite().min(-0.4).max(0.4).optional(),
  /** One emoji (kind "emoji"). */
  emoji: z.string().max(32).optional(),
  /** Progress bar: the part still to come. */
  track: hex.optional(),
  trackAlpha: z.number().finite().min(0).max(1).optional(),
  /** News ticker: the box on its left ("BREAKING"), and how fast the words move (box heights a second). */
  label: z.string().max(24).optional(),
  labelColor: hex.optional(),
  speed: z.number().finite().min(0.2).max(10).optional(),
});
export const elementClipSchema = z.object({
  id: localId,
  type: z.literal("element"),
  el: elementLookSchema,
  duration: z.number().finite().min(0.1).max(3600),
  transform: transformSchema,
  anim: animSchema,
  ...fades,
  ...motion,
  transitionIn: transitionSchema.optional(),
});
export const audioClipSchema = z.object({
  id: localId,
  type: z.literal("audio"),
  mediaId: uuid,
  in: secs,
  out: z.number().finite().positive(),
  volume: z.number().finite().min(0).max(2),
  /** "Remove background noise" on the clip's sound (lib/audio/denoise). */
  denoise: z.enum(["light", "strong", "studio"]).optional(),
  /** Quieter while someone speaks (auto ducking). */
  duck: z.boolean(),
  /** EBU R128 loudness levelling (-16 LUFS). */
  loudness: z.boolean().optional(),
  ...fades,
  generation: clipGenerationSchema.optional(),
  volumeAutomation: z.array(volumeKeyframeSchema).max(500).optional(),
  /** If this audio clip was detached from a video clip, the ID of that video clip */
  detachedFromClipId: localId.optional(),
});

/**
 * A blank scene on Video 1 (like Google Vids): a plain color, a whole frame,
 * with no upload. Text and elements go on top of it (a title card, a pause,
 * an end screen).
 */
export const BLANK_SECONDS = 3;
export const BLANK_FILL = "#000000";
export const THEME_BLANK_DARK = "#000000";
export const THEME_BLANK_LIGHT = "#ffffff";

/** Returns true if the fill is a theme-default black/white or unset */
export function isDefaultBlankFill(fill?: string): boolean {
  if (!fill) return true;
  const f = fill.toLowerCase();
  return f === "#000000" || f === "#ffffff" || f === "#000" || f === "#fff";
}

/** Resolves the effective blank clip fill color based on current theme mode */
export function resolveBlankFill(fill: string | undefined, isLight: boolean): string {
  if (isDefaultBlankFill(fill)) {
    return isLight ? THEME_BLANK_LIGHT : THEME_BLANK_DARK;
  }
  return fill!;
}
export const blankClipSchema = z.object({
  id: localId,
  type: z.literal("blank"),
  /** Its color. (Not `color`: on videos and pictures that's the color correction.) */
  fill: hex,
  /** Optional backdrop definition (gradient, set, media) for background layer clips on timeline */
  backdrop: backdropSchema.optional(),
  duration: z.number().finite().min(0.1).max(3600),
  ...fades,
  transform: transformSchema.optional(),
  opacity: z.number().finite().min(0).max(1).optional(),
  /** A transition into it from the clip before. */
  transitionIn: transitionSchema.optional(),
  generation: clipGenerationSchema.optional(),
});

const placed = { start: secs };
const mainPlaced = { start: secs.optional() };
const mainClipSchema = z.discriminatedUnion("type", [videoClipSchema.extend(mainPlaced), imageClipSchema.extend(mainPlaced), blankClipSchema.extend(mainPlaced)]);
const overlayClipSchema = z.discriminatedUnion("type", [videoClipSchema.extend(placed), imageClipSchema.extend(placed), textClipSchema.extend(placed), elementClipSchema.extend(placed), blankClipSchema.extend(placed)]);
const audioPlacedSchema = audioClipSchema.extend(placed);

export const trackSchema = z.discriminatedUnion("kind", [
  z.object({ id: localId, kind: z.literal("main"), name: trackName, locked: z.boolean(), muted: z.boolean(), hidden: z.boolean().optional(), clips: z.array(mainClipSchema).max(300) }),
  z.object({ id: localId, kind: z.literal("overlay"), name: trackName, locked: z.boolean(), hidden: z.boolean(), muted: z.boolean().optional(), clips: z.array(overlayClipSchema).max(300) }),
  z.object({ id: localId, kind: z.literal("audio"), name: trackName, locked: z.boolean(), muted: z.boolean(), clips: z.array(audioPlacedSchema).max(300) }),
]);

/** Your logo on top of the whole video (Brand Kit): a picture in a corner. Size and margin are shares of the canvas width. */
export const watermarkSchema = z.object({
  mediaId: uuid,
  corner: z.enum(["tl", "tr", "bl", "br"]),
  size: z.number().finite().min(0.02).max(0.5),
  opacity: z.number().finite().min(0.05).max(1),
  margin: z.number().finite().min(0).max(0.2),
  /** Dragged on the preview: the logo's middle, as shares of the canvas (else it sits in its corner). */
  x: z.number().finite().min(0).max(1).optional(),
  y: z.number().finite().min(0).max(1).optional(),
  /** A box behind the logo (e.g. a brand color); `pad`: its room around the logo, a share of the logo's width. */
  plate: z.object({ color: hex, pad: z.number().finite().min(0).max(0.5) }).optional(),
  /** Rounded corners (of the box, or of the logo itself): a share of its shorter side, 0.5 = fully round. */
  radius: z.number().finite().min(0).max(0.5).optional(),
  /** How it comes in and goes out (lib/player/logo). */
  anim: z.object({ in: z.enum(["none", "fade", "pop", "slide"]), out: z.enum(["none", "fade", "pop", "slide"]) }).optional(),
  /** Only from … to (seconds on the timeline); else the whole video. */
  from: z.number().finite().min(0).max(86400).optional(),
  to: z.number().finite().min(0).max(86400).optional(),
});
export type Watermark = z.infer<typeof watermarkSchema>;
/** How the logo looks and where it goes (everything but which picture): remembered in the Brand Kit. */
export const watermarkLookSchema = watermarkSchema.omit({ mediaId: true });
export type WatermarkLook = z.infer<typeof watermarkLookSchema>;
/** The biggest logo (share of the canvas width), like the Brand Kit slider. */
export const LOGO_MAX_SIZE = 0.4;

/** Room around the logo inside its box (0 without a box), in pixels of a W-wide canvas. */
export const watermarkPad = (w: Pick<Watermark, "size" | "plate">, W: number) => (w.plate ? Math.round(Math.max(2, Math.round(W * Math.min(w.size, LOGO_MAX_SIZE))) * w.plate.pad) : 0);

/**
 * Where the logo goes on a W×H canvas, for a picture of iw×ih (the preview and
 * the export use this): the whole badge (the box around it, when it has one).
 */
export function watermarkRect(w: Watermark, W: number, H: number, iw: number, ih: number) {
  const pad = watermarkPad(w, W);
  const width = Math.max(2, Math.round(W * Math.min(w.size, LOGO_MAX_SIZE))) + pad * 2;
  const height = Math.max(2, Math.round((Math.max(2, Math.round(W * Math.min(w.size, LOGO_MAX_SIZE))) * ih) / Math.max(1, iw))) + pad * 2;
  if (w.x != null && w.y != null) {
    // placed by hand: its middle there, kept inside the canvas
    const x = Math.round(Math.min(Math.max(0, W - width), Math.max(0, w.x * W - width / 2)));
    const y = Math.round(Math.min(Math.max(0, H - height), Math.max(0, w.y * H - height / 2)));
    return { x, y, w: width, h: height };
  }
  const m = Math.round(W * w.margin);
  const x = w.corner === "tl" || w.corner === "bl" ? m : W - m - width;
  const y = w.corner === "tl" || w.corner === "tr" ? m : H - m - height;
  return { x, y, w: width, h: height };
}

export const markerColorSchema = z.enum(["blue", "red", "green", "amber", "purple"]);
export type MarkerColor = z.infer<typeof markerColorSchema>;

export const markerSchema = z.object({
  id: localId,
  t: secs,
  label: z.string().max(80),
  color: markerColorSchema.optional().default("blue"),
});
export type TimelineMarker = z.infer<typeof markerSchema>;

export const smartMixSchema = z.object({
  enabled: z.boolean(),
  priority: z.enum(["voiceover", "video", "both"]).default("both"),
  duckAmount: z.number().min(0).max(1).default(0.7),
  fadeDuration: z.number().min(0.05).max(2).default(0.3),
  normalVolume: z.number().min(0).max(2).default(1.0),
  videoTrackId: z.string().optional(),
  voiceoverTrackId: z.string().optional(),
  lastAnalyzedAt: z.number().optional(),
});
export type SmartMixConfig = z.infer<typeof smartMixSchema>;

export const docSchema = z
  .object({
    version: z.literal(2),
    canvas: canvasSchema,
    tracks: z.array(trackSchema).min(1).max(24),
    output: outputSchema,
    watermark: watermarkSchema.optional(),
    markers: z.array(markerSchema).max(100).optional(),
    smartMix: smartMixSchema.optional(),
  })
  .refine((d) => d.tracks.filter((t) => t.kind === "main").length === 1, "A timeline has exactly one main track.");

export type TimelineDoc = z.infer<typeof docSchema>;
export type Track = TimelineDoc["tracks"][number];
export type MainTrack = Extract<Track, { kind: "main" }>;
export type OverlayTrack = Extract<Track, { kind: "overlay" }>;
export type AudioTrack = Extract<Track, { kind: "audio" }>;
export type VideoClip = z.infer<typeof videoClipSchema>;
export type ImageClip = z.infer<typeof imageClipSchema>;
export type BlankClip = z.infer<typeof blankClipSchema>;
export type TextClip = z.infer<typeof textClipSchema>;
export type TextStyle = z.infer<typeof textStyleSchema>;
export type ElementClip = z.infer<typeof elementClipSchema>;
export type ElementLook = z.infer<typeof elementLookSchema>;
export type AudioClip = z.infer<typeof audioClipSchema>;
export type MainClip = MainTrack["clips"][number];
export type OverlayClip = OverlayTrack["clips"][number];
export type AudioPlaced = AudioTrack["clips"][number];
export type AnyClip = MainClip | OverlayClip | AudioPlaced;
export type { ClipTracking, TrackingPoint, TrackingKeyframe };

/** What the timeline needs to know about an upload (from its meta). */
export type MediaLite = {
  id: string;
  kind: "video" | "image" | "audio";
  fileName: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  hasAudio: boolean;
  suggestedKey: string | null;
  keyKind: "green" | "blue" | "black" | null;
  keyVia?: "border" | "frame";
  soundDetected?: boolean;
};

/** An upload's meta (lib/videos.ts) → what the timeline needs. */
export function mediaLiteOf(v: {
  id: string;
  kind?: "video" | "image" | "audio";
  fileName: string;
  info: { width: number; height: number; fps: number; duration: number; hasAudio: boolean; soundDetected?: boolean };
  suggestedKey: string | null;
  keyKind: "green" | "blue" | "black" | null;
  keyVia?: "border" | "frame";
}): MediaLite {
  return {
    id: v.id,
    kind: v.kind ?? "video",
    fileName: v.fileName,
    width: v.info.width,
    height: v.info.height,
    fps: v.info.fps,
    duration: v.info.duration,
    hasAudio: v.info.hasAudio,
    suggestedKey: v.suggestedKey,
    keyKind: v.keyKind,
    keyVia: v.keyVia,
    soundDetected: v.info.soundDetected,
  };
}

/** Shortest clip that can be made by trimming or splitting (in frames). */
export const MIN_CLIP_FRAMES = MIN_SEGMENT_FRAMES;

export const IMAGE_DEFAULT_SECONDS = 5;
export const TEXT_DEFAULT_SECONDS = 4;

// ---------- reading the timeline ----------

export function mainTrack(doc: TimelineDoc): MainTrack {
  return doc.tracks.find((t): t is MainTrack => t.kind === "main")!;
}

/** Length of a clip on the timeline. */
export function clipLength(c: AnyClip | VideoClip | ImageClip | BlankClip | TextClip | ElementClip | AudioClip): number {
  return c.type === "video" || c.type === "audio" ? (c.out - c.in) / speedOf(c) : c.duration;
}

/** Source seconds per timeline second (video clips can be faster or slower). */
export const speedOf = (c: { type: string; speed?: number }): number => (c.type === "video" ? (c.speed ?? 1) : 1);
export const isReversed = (c: { type: string; reversed?: boolean }): boolean => c.type === "video" && !!c.reversed;

/** The source time shown `off` timeline seconds into a video / sound clip (a reversed clip reads backwards from its end). */
export function srcAt(c: VideoClip | AudioClip, off: number): number {
  const s = off * speedOf(c);
  return isReversed(c) ? c.out - s : c.in + s;
}

/** Timeline start of each main-track clip (back to back). */
/**
 * How much clip i overlaps the clip before it (its transition in), never more
 * than half of either clip.
 */
export function overlapAt(clips: (AnyClip | MainClip | OverlayClip)[], i: number): number {
  if (i <= 0 || i >= clips.length) return 0;
  const t = (clips[i] as { transitionIn?: ClipTransition }).transitionIn;
  return t ? Math.max(0, Math.min(t.duration, clipLength(clips[i - 1] as AnyClip) / 2, clipLength(clips[i] as AnyClip) / 2)) : 0;
}

/** Timeline start of each main-track clip: back to back, overlapping where there's a transition. */
export function mainStarts(clips: MainClip[]): number[] {
  const out: number[] = [];
  let t = (clips[0] as any)?.start ?? 0;
  clips.forEach((c, i) => {
    if (i > 0 && (c as any).start !== undefined && (c as any).start > t) {
      t = (c as any).start;
    }
    t -= overlapAt(clips, i);
    out.push(t);
    t += clipLength(c);
  });
  return out;
}

export function mainDuration(doc: TimelineDoc): number {
  const clips = mainTrack(doc).clips;
  if (!clips.length) return 0;
  const starts = mainStarts(clips);
  return starts[starts.length - 1] + clipLength(clips[clips.length - 1]);
}

/** Clips on every track. */
export const clipCount = (doc: TimelineDoc) => doc.tracks.reduce((a, t) => a + t.clips.length, 0);

/** The whole timeline: the main track, or a later overlay/audio clip. */
export function docDuration(doc: TimelineDoc): number {
  let d = mainDuration(doc);
  for (const t of doc.tracks) if (t.kind !== "main") for (const c of t.clips) d = Math.max(d, c.start + clipLength(c));
  return d;
}

/** The main-track clip at timeline time t (the last one at the very end). */
export function mainClipAt(doc: TimelineDoc, t: number): { clip: MainClip; index: number; start: number } | null {
  const clips = mainTrack(doc).clips;
  const starts = mainStarts(clips);
  for (let i = 0; i < clips.length; i++) if (t < starts[i] + clipLength(clips[i]) - 1e-6) return { clip: clips[i], index: i, start: starts[i] };
  const i = clips.length - 1;
  return i >= 0 ? { clip: clips[i], index: i, start: starts[i] } : null;
}

export function findClip(doc: TimelineDoc, clipId: string): { track: Track; clip: AnyClip; index: number } | null {
  for (const track of doc.tracks) {
    const index = (track.clips as AnyClip[]).findIndex((c) => c.id === clipId);
    if (index >= 0) return { track, clip: (track.clips as AnyClip[])[index], index };
  }
  return null;
}

/** Timeline start of any clip. */
export function clipStart(doc: TimelineDoc, clipId: string): number {
  const f = findClip(doc, clipId);
  if (!f) return 0;
  if (f.track.kind === "main") return mainStarts(f.track.clips)[f.index];
  return (f.clip as OverlayClip | AudioPlaced).start;
}

/** The upload shown as a project's thumbnail: the first clip's (main track first). */
export function coverMediaIdOrNull(doc: TimelineDoc): string | null {
  // (a blank scene has no picture: the first clip that has one)
  const first = mainTrack(doc).clips.find((c) => "mediaId" in c);
  if (first && "mediaId" in first) return first.mediaId;
  for (const t of doc.tracks) for (const c of t.clips as AnyClip[]) if ((c.type === "video" || c.type === "image") && "mediaId" in c) return c.mediaId;
  return null;
}

/** Every media id the timeline uses (for "used in project" and cleanup). */
export function mediaIdsOf(doc: TimelineDoc): string[] {
  const ids = new Set<string>();
  for (const t of doc.tracks)
    for (const c of t.clips as AnyClip[]) {
      if ("mediaId" in c) ids.add(c.mediaId);
      // a picture that covers a watermark
      if ("patches" in c) for (const p of c.patches ?? []) if (p.mediaId) ids.add(p.mediaId);
      if ("generation" in c && c.generation?.referenceImageId) ids.add(c.generation.referenceImageId);
    }
  if (doc.canvas.backdrop?.kind === "media") ids.add(doc.canvas.backdrop.mediaId);
  if (doc.watermark) ids.add(doc.watermark.mediaId);
  return [...ids];
}

/** The render spec of one video clip (for its preview, color pick, AI mask, crop): its effects + the export settings. */
export function clipSpec(doc: TimelineDoc, clip: VideoClip): EditSpec {
  return { version: 1, ops: clip.ops, output: doc.output };
}

/**
 * The single-video spec this timeline is equal to, if it is that simple:
 * only main-track parts of ONE video, in order, with the same effects and no
 * overlays or extra sound. Such timelines export exactly as before.
 */
export function asSingleVideo(doc: TimelineDoc): { mediaId: string; spec: EditSpec } | null {
  const main = mainTrack(doc).clips;
  if (!main.length || doc.watermark || doc.tracks.some((t) => t.kind !== "main" && t.clips.length)) return null;
  if (!main.every((c): c is VideoClip => c.type === "video")) return null;
  const v = main as VideoClip[];
  const first = v[0];
  const sameOps = JSON.stringify(first.ops);
  if (!v.every((c) => c.mediaId === first.mediaId && JSON.stringify(c.ops) === sameOps && c.volume === 1 && !c.muted && !c.denoise && !c.stabilize && !c.reversed && !c.loop && (c.speed ?? 1) === 1 && c.fadeIn === 0 && c.fadeOut === 0)) return null;
  if (!v.every((c) => c.transform.fit === "fit" && c.transform.scale === 1 && c.transform.x === 0 && c.transform.y === 0 && !c.transform.crop && !c.transform.rotation && !c.transform.flipX && !c.transform.flipY && !c.color && !c.mask && !c.patches?.length)) return null;
  // (stretched, skewed or pinned pictures too)
  if (!v.every((c) => !c.transform.skewX && !c.transform.skewY && (c.transform.scaleX ?? 1) === 1 && (c.transform.scaleY ?? 1) === 1 && !c.transform.corners && !c.transform.pivot)) return null;
  // (moving or see-through clips, transitions between the parts and blend modes need the full timeline export)
  if (v.some((c) => c.keyframes?.length || (c.opacity ?? 1) < 1 || c.transitionIn || (c.blend && c.blend !== "normal"))) return null;
  for (let i = 1; i < v.length; i++) if (v[i].in < v[i - 1].out - 1e-6) return null;
  return { mediaId: first.mediaId, spec: { version: 1, ops: first.ops, output: doc.output, timeline: { clips: v.map((c) => ({ id: c.id, in: c.in, out: c.out })) } } };
}

/**
 * Where a new text or element goes at time t: on a blank scene, from its start
 * for BLANK_SECONDS (like a slide; it can be made longer after); else at t (at
 * the very end of the timeline: at the start instead).
 */
export function drawnSlot(doc: TimelineDoc, t: number): { at: number; seconds?: number } {
  const main = mainTrack(doc);
  const starts = mainStarts(main.clips);
  for (const [i, c] of main.clips.entries()) if (c.type === "blank" && t >= starts[i] - 1e-6 && t < starts[i] + clipLength(c) - 1e-6) return { at: starts[i], seconds: BLANK_SECONDS };
  const end = docDuration(doc);
  return { at: end > 0 && t >= end - 0.05 ? 0 : t };
}

/** Text clips that show in the video (on overlay tracks that aren't hidden). */
export function textClipsOf(doc: TimelineDoc): TextClip[] {
  const out: TextClip[] = [];
  for (const t of doc.tracks) if (t.kind === "overlay" && !t.hidden) for (const c of t.clips) if (c.type === "text") out.push(c);
  return out;
}

/** Elements that show in the video (on overlay tracks that aren't hidden). */
export function elementClipsOf(doc: TimelineDoc): ElementClip[] {
  const out: ElementClip[] = [];
  for (const t of doc.tracks) if (t.kind === "overlay" && !t.hidden) for (const c of t.clips) if (c.type === "element") out.push(c);
  return out;
}

export type Layer = { clip: AnyClip; start: number; trackIndex: number };

/** The clips visible at time t, bottom to top: main track, then overlay tracks from the lowest up. */
export function layersAt(doc: TimelineDoc, t: number): Layer[] {
  const out: Layer[] = [];
  const main = mainTrack(doc);
  const starts = mainStarts(main.clips);
  // (a hidden Video 1 shows nothing, like the server export)
  if (!main.hidden) main.clips.forEach((c, i) => {
    const s = starts[i];
    const len = clipLength(c);
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

// ---------- making clips ----------

export function newId(doc: TimelineDoc, prefix = "c"): string {
  const used = new Set<string>();
  for (const t of doc.tracks) {
    used.add(t.id);
    for (const c of t.clips as AnyClip[]) used.add(c.id);
  }
  if (doc.markers) for (const m of doc.markers) used.add(m.id);
  let n = used.size + 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** The canvas a first video suggests: its size (even), its frame rate, transparent (website overlay). */
export function canvasFor(m: Pick<MediaLite, "width" | "height" | "fps"> | null): Canvas {
  if (!m || !m.width) return { width: 1920, height: 1080, fps: 30, background: "#000000" };
  const even = (v: number) => Math.max(64, Math.min(3840, Math.round(v / 2) * 2));
  return { width: even(m.width), height: even(m.height), fps: Math.min(60, Math.max(1, Math.round(m.fps || 30))), background: "transparent" };
}

export function emptyDoc(output: OutputSettings = DEFAULT_OUTPUT, canvas: Canvas = canvasFor(null)): TimelineDoc {
  return {
    version: 2,
    canvas,
    tracks: [
      { id: "v2", kind: "overlay", locked: false, hidden: false, clips: [] },
      { id: "v1", kind: "main", locked: false, muted: false, hidden: false, clips: [] },
      { id: "a1", kind: "audio", locked: false, muted: false, clips: [] },
    ],
    output,
  };
}

export function videoClipOf(id: string, m: MediaLite, ops: OpInstance[], inT = 0, outT = m.duration): VideoClip {
  return { id, type: "video", mediaId: m.id, in: inT, out: outT, ops, transform: { ...DEFAULT_TRANSFORM }, volume: 1, muted: false, fadeIn: 0, fadeOut: 0 };
}

/** A new blank scene: black, 3 seconds. */
export function blankClipOf(id: string, fill: string = BLANK_FILL, duration = BLANK_SECONDS, backdrop?: Backdrop): BlankClip {
  return { id, type: "blank", fill, duration, fadeIn: 0, fadeOut: 0, ...(backdrop ? { backdrop } : {}) };
}

/** A new generating placeholder scene on Video 1 with progress state */
export function generatingBlankClipOf(
  id: string,
  opts: {
    prompt: string;
    mediaType?: "video" | "image";
    duration?: number;
    aspect?: string;
    provider?: string;
    referenceImageId?: string;
    fill?: string;
  },
): BlankClip {
  const mediaType = opts.mediaType ?? "video";
  const duration = opts.duration ?? (mediaType === "video" ? 6 : 3);
  return {
    id,
    type: "blank",
    fill: opts.fill ?? "#1e1b4b",
    duration,
    fadeIn: 0,
    fadeOut: 0,
    generation: {
      mediaType,
      prompt: opts.prompt,
      progress: 0,
      status: "generating",
      aspect: opts.aspect ?? "16:9",
      provider: opts.provider ?? "gemini",
      startedAt: Date.now(),
      referenceImageId: opts.referenceImageId,
    },
  };
}

/** A new generating placeholder clip on Audio track */
export function generatingAudioClipOf(
  id: string,
  start: number,
  opts: {
    prompt: string;
    duration?: number;
    provider?: string;
  },
): AudioPlaced {
  const duration = opts.duration ?? 5;
  return {
    id,
    type: "audio",
    mediaId: "00000000-0000-4000-8000-000000000000",
    in: 0,
    out: duration,
    volume: 1,
    duck: false,
    fadeIn: 0,
    fadeOut: 0,
    start,
    generation: {
      mediaType: "audio",
      prompt: opts.prompt,
      progress: 0,
      status: "generating",
      provider: opts.provider ?? "gemini",
      startedAt: Date.now(),
    },
  };
}

export function imageClipOf(id: string, m: MediaLite, duration = IMAGE_DEFAULT_SECONDS): ImageClip {
  return { id, type: "image", mediaId: m.id, duration, transform: { ...DEFAULT_TRANSFORM }, fadeIn: 0, fadeOut: 0 };
}

export function audioClipOf(id: string, m: MediaLite, start: number): AudioPlaced {
  return { id, type: "audio", mediaId: m.id, in: 0, out: m.duration, volume: 1, duck: false, fadeIn: 0, fadeOut: 0, start };
}

// ---------- the old single-video spec ----------

/** EditSpec v1 (one video, optional kept parts) → a timeline with those parts on the main track. */
export function docFromSpec(spec: EditSpec, media: MediaLite | null): TimelineDoc {
  const doc = emptyDoc(spec.output, canvasFor(media));
  if (!media) return doc;
  const parts = segmentsOf(spec.timeline, media.duration);
  const main = mainTrack(doc);
  main.clips = parts.map((p) => videoClipOf(p.id, media, spec.ops, p.in, p.out));
  return doc;
}

/** Accept a v2 timeline, or the old v1 spec (with the media it was made for). */
export function parseDoc(input: unknown, media: (id: string) => MediaLite | null, legacyMedia?: MediaLite | null): TimelineDoc {
  const o = (input ?? {}) as { version?: unknown };
  if (o.version === 2) return sanitizeDoc(docSchema.parse(input), media);
  return sanitizeDoc(docFromSpec(editSpecSchema.parse(input), legacyMedia ?? null), media);
}

// ---------- cleaning untrusted timelines ----------

const snapTo = (t: number, fps: number) => (fps > 0 ? Math.round(t * fps) / fps : Math.round(t * 1000) / 1000);

/**
 * Clamp every clip to its media (trims inside the file, at frame edges, at
 * least 2 frames), clean each video clip's effects, and drop clips whose
 * media is unknown to this computer.
 */
/** Keyframes after loading: sorted, never two on one frame. */
function cleanKeyframes<T extends { keyframes?: Keyframe[] }>(c: T, fps: number): T {
  const k = c.keyframes;
  if (!k?.length) return c;
  const out: Keyframe[] = [];
  for (const x of [...k].sort((a, b) => a.t - b.t)) if (!out.length || x.t - out[out.length - 1].t >= 0.5 / Math.max(1, fps)) out.push(x);
  return out.length === k.length && out.every((x, i) => x === k[i]) ? c : { ...c, keyframes: out };
}

export function sanitizeDoc(doc: TimelineDoc, media: (id: string) => MediaLite | null): TimelineDoc {
  const fps = doc.canvas.fps;
  const cleanRange = (c: { in: number; out: number }, m: MediaLite) => {
    const f = m.fps || fps;
    const min = MIN_SEGMENT_FRAMES / f;
    const a = Math.min(Math.max(0, snapTo(c.in, f)), Math.max(0, m.duration - min));
    const outRaw = snapTo(c.out, f) > m.duration - 0.5 / f ? m.duration : snapTo(c.out, f);
    const b = Math.max(a + min, Math.min(m.duration, outRaw));
    return { in: a, out: b };
  };
  const cleanVideo = <T extends VideoClip>(c: T): T | null => {
    const m = media(c.mediaId);
    if (!m || m.kind !== "video") return null;
    const spec = sanitizeSpec({ version: 1, ops: c.ops, output: doc.output }, { width: m.width, fps: m.fps, duration: m.duration });
    return cleanKeyframes({ ...c, ...cleanRange(c, m), ops: spec.ops }, fps);
  };
  const tracks = doc.tracks.map((t): Track => {
    if (t.kind === "main") {
      // (a blank scene has no upload: it always stays; generating clips stay)
      const clips = t.clips
        .map((c) => {
          if (c.type === "blank") return c;
          if ((c as any).generation) return c;
          return c.type === "video" ? cleanVideo(c) : media(c.mediaId)?.kind === "image" ? cleanKeyframes(c, fps) : null;
        })
        .filter((c): c is MainClip => !!c);
      return { ...t, clips };
    }
    if (t.kind === "overlay") {
      const clips = t.clips
        .map((c) => {
          if ((c as any).generation) return c;
          if (c.type === "text") {
            // (styled letters: inside the words, sorted, not overlapping)
            const marks = normalizeMarks(c.text, c.marks);
            const { marks: _m, ...rest } = c;
            void _m;
            return cleanKeyframes(marks ? { ...rest, marks } : rest, fps);
          }
          if (c.type === "blank") return c;
          return c.type === "video" ? cleanVideo(c) : c.type === "image" ? (media(c.mediaId)?.kind === "image" ? cleanKeyframes(c, fps) : null) : cleanKeyframes(c, fps);
        })
        .filter((c): c is OverlayClip => !!c);
      return { ...t, clips };
    }
    const clips = t.clips
      .map((c) => {
        if ((c as any).generation) return c;
        const m = media(c.mediaId);
        if (!m || !m.hasAudio) return null;
        return { ...c, ...cleanRange(c, { ...m, fps: 1000 }) };
      })
      .filter((c): c is AudioPlaced => !!c);
    return { ...t, clips };
  });
  // a backdrop picture / video that's gone is dropped
  const b = doc.canvas.backdrop;
  const canvas = b?.kind === "media" && !(media(b.mediaId) && media(b.mediaId)!.kind !== "audio") ? { ...doc.canvas, backdrop: undefined } : doc.canvas;
  // and a logo picture that's gone
  const watermark = doc.watermark && media(doc.watermark.mediaId)?.kind === "image" ? doc.watermark : undefined;
  return { ...doc, canvas, tracks, output: sanitizeOutput(doc.output), watermark };
}
