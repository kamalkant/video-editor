import type { Backdrop, ClipTransition } from "../../edit/doc";

/**
 * A template written once for all three shapes (16:9, 9:16, 1:1). Positions are anchors and shares of a safe
 * area, not pixels; `build` (./build) lays them out for a ratio and returns a normal project.
 */
export type Ratio = "16:9" | "9:16" | "1:1";
export const RATIOS: Ratio[] = ["16:9", "9:16", "1:1"];

export type AnimKind = "none" | "fade" | "slide" | "rise" | "pop" | "zoom" | "bounce" | "blur" | "typewriter";

export type Anchor = {
  /** Where in the safe area: "left" | "center" | "right" (x) and "top" | "center" | "bottom" (y). */
  x: "left" | "center" | "right";
  y: "top" | "center" | "bottom";
  /** Further moves, in shares of the safe area (positive: right / down). */
  dx?: number;
  dy?: number;
};

/** Per-ratio changes to one layer (a layout that must differ: a stacked title in 9:16, say). */
export type LayerOverride = Partial<{ at: Anchor; size: number; hidden: boolean; words: string }>;

type LayerBase = {
  at: Anchor;
  /** Seconds into the scene (default 0) and how long (default: to the scene's end). */
  from?: number;
  length?: number;
  over?: Partial<Record<Ratio, LayerOverride>>;
};

export type TextLayer = LayerBase & {
  kind: "text";
  /** An id of lib/text/layout TEXT_STYLES ("title", "big-title"…) or a preset. */
  style: string;
  words: string;
  /** Text size, in pixels on a 1080-high 16:9 canvas (scaled for the other shapes). */
  size?: number;
  color?: string;
  anim?: { in: AnimKind; out: AnimKind };
};

export type ElementLayer = LayerBase & {
  kind: "element";
  /** An id of lib/elements/catalog (it keeps the preset's own size for the canvas). */
  preset: string;
  look?: Record<string, unknown>;
};

/** A slot for the person's own video or picture. Until it is filled it shows the scene's backdrop. */
export type MediaLayer = LayerBase & {
  kind: "media";
  role: string;
  accepts: "video" | "image" | "both";
  /** For a stock search (Pexels) at use time. */
  keywords?: string[];
  /** A picture-in-picture frame (an element preset, "rounded" by default) at `at`; absent: the slot is the whole scene. */
  frame?: string;
};

export type Layer = TextLayer | ElementLayer | MediaLayer;

export type Scene = {
  /** Seconds. */
  length: number;
  transitionIn?: ClipTransition;
  /** The scene's backdrop: a gradient, a studio set. */
  fill: Backdrop;
  /** The colour under it (default black). */
  base?: string;
  layers: Layer[];
};

export type TemplateSpec = {
  id: string;
  name: string;
  category: string;
  tags: string[];
  /** What to replace, for the card ("1 video, a title"). */
  summary: string;
  /** A music bed (public/templates/music/<id>.mp3), added with a fade out. */
  music?: { id: string; volume?: number };
  scenes: Scene[];
};
