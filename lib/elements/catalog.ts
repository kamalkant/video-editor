import { NO_ANIM, type Anim, type ElementClip, type ElementKind, type ElementLook } from "../edit/doc";
import { matchScore } from "../editor/commands";
import { EMOJI, emojiName, type EmojiItem } from "./emoji";
import { placeElement, type Place } from "./geometry";

/**
 * The ready-made elements of the Elements panel: shapes, lines and arrows,
 * stickers (drawn by the app: lib/elements/draw) and news graphics. Emoji come
 * from lib/elements/emoji. Each one becomes an element clip (lib/edit/doc)
 * that stays editable: colors, outline, words.
 */

export type ElementGroup = "shapes" | "lines" | "stickers" | "news" | "camera";
export const ELEMENT_GROUPS: { id: ElementGroup; label: string }[] = [
  { id: "camera", label: "Camera & Viewfinders" },
  { id: "news", label: "News graphics" },
  { id: "shapes", label: "Shapes" },
  { id: "lines", label: "Lines and arrows" },
  { id: "stickers", label: "Stickers" },
];

export type ElementPreset = {
  id: string;
  group: ElementGroup;
  label: string;
  keywords?: string[];
  el: Omit<ElementLook, "preset">;
  /** its size when added: a share of the canvas height (h) or width (w); both make a bar */
  size: { w?: number; h?: number };
  at?: Place;
  /** its length when added (seconds), or the whole video */
  seconds?: number | "whole";
  anim?: Anim;
};

const WHITE = "#ffffff";
const INK = "#111827";
const POP: Anim = { in: "pop", out: "fade" };
const FADE: Anim = { in: "fade", out: "fade" };
const look = (kind: ElementKind, aspect: number, x: Partial<ElementLook> = {}): Omit<ElementLook, "preset"> => ({ kind, aspect, fill: "#3b82f6", stroke: "none", strokeWidth: 0, ...x });
const sticker = (icon: string, fill: string, x: Partial<ElementLook> = {}) => look("icon", 1, { icon, fill, textColor: WHITE, shadow: true, ...x });

export const ELEMENTS: ElementPreset[] = [
  // shapes
  { id: "box", group: "shapes", label: "Box", keywords: ["rectangle", "square"], el: look("rect", 1.5), size: { h: 0.28 } },
  { id: "rounded", group: "shapes", label: "Rounded box", keywords: ["rectangle", "card"], el: look("rect", 1.5, { radius: 0.18 }), size: { h: 0.28 } },
  { id: "circle", group: "shapes", label: "Circle", keywords: ["dot", "round", "oval"], el: look("ellipse", 1, { fill: "#ef4444" }), size: { h: 0.28 } },
  { id: "triangle", group: "shapes", label: "Triangle", el: look("polygon", 1.15, { points: 3, fill: "#f59e0b" }), size: { h: 0.28 } },
  { id: "diamond", group: "shapes", label: "Diamond", keywords: ["rhombus"], el: look("polygon", 1, { points: 4, fill: "#8b5cf6" }), size: { h: 0.28 } },
  { id: "star", group: "shapes", label: "Star", el: look("star", 1.05, { points: 5, inner: 0.45, fill: "#facc15" }), size: { h: 0.28 } },
  { id: "frame", group: "shapes", label: "Frame", keywords: ["border", "outline", "box"], el: look("rect", 16 / 9, { fill: "none", stroke: WHITE, strokeWidth: 0.05, radius: 0.03 }), size: { h: 0.42 } },
  { id: "ring", group: "shapes", label: "Ring", keywords: ["circle", "outline", "mark"], el: look("ellipse", 1, { fill: "none", stroke: "#ef4444", strokeWidth: 0.08 }), size: { h: 0.3 } },
  { id: "highlight", group: "shapes", label: "Highlight box", keywords: ["focus", "mark", "yellow"], el: look("rect", 3, { fill: "#facc15", fillAlpha: 0.3, stroke: "#facc15", strokeWidth: 0.05, radius: 0.12 }), size: { h: 0.18 } },
  ...[1, 2, 3].map((n): ElementPreset => ({ id: `number-${n}`, group: "shapes", label: `Number ${n}`, keywords: ["step", "count", "badge", String(n)], el: look("ellipse", 1, { fill: "#2563eb", stroke: WHITE, strokeWidth: 0.07, text: String(n), textColor: WHITE, shadow: true }), size: { h: 0.14 }, anim: POP })),
  // lines and arrows (a line's color is its fill)
  { id: "line", group: "lines", label: "Line", keywords: ["stroke"], el: look("line", 30, { fill: WHITE }), size: { w: 0.4 } },
  { id: "dashed", group: "lines", label: "Dashed line", keywords: ["dotted", "stroke"], el: look("line", 30, { fill: WHITE, dash: true }), size: { w: 0.4 } },
  { id: "divider", group: "lines", label: "Divider", keywords: ["separator", "line"], el: look("line", 90, { fill: WHITE, variant: "fade" }), size: { w: 0.5 } },
  { id: "underline", group: "lines", label: "Underline", keywords: ["hand drawn", "marker", "scribble"], el: look("line", 9, { fill: "#facc15", variant: "hand", curve: 0.35 }), size: { w: 0.3 } },
  { id: "arrow", group: "lines", label: "Arrow", keywords: ["point", "direction"], el: look("arrow", 4, { fill: WHITE, heads: "end", shadow: true }), size: { w: 0.24 } },
  { id: "double-arrow", group: "lines", label: "Double arrow", keywords: ["both ways"], el: look("arrow", 5, { fill: WHITE, heads: "both", shadow: true }), size: { w: 0.28 } },
  { id: "curved-arrow", group: "lines", label: "Curved arrow", keywords: ["bend", "point"], el: look("arrow", 2.2, { fill: WHITE, heads: "end", curve: 0.6, shadow: true }), size: { w: 0.22 } },
  { id: "highlighter", group: "lines", label: "Highlighter", keywords: ["marker", "highlight", "yellow"], el: look("marker", 6, { fill: "#facc15", fillAlpha: 0.45 }), size: { w: 0.3 } },
  // stickers, drawn by the app (sharp at any size, free to use anywhere)
  { id: "heart", group: "stickers", label: "Heart", keywords: ["love", "like"], el: sticker("heart", "#ef4444", { stroke: WHITE, strokeWidth: 0.05 }), size: { h: 0.22 }, anim: POP },
  { id: "gold-star", group: "stickers", label: "Gold star", keywords: ["favourite", "best"], el: look("star", 1.05, { points: 5, inner: 0.48, fill: "#facc15", stroke: WHITE, strokeWidth: 0.05, shadow: true }), size: { h: 0.22 }, anim: POP },
  { id: "sparkle", group: "stickers", label: "Sparkle", keywords: ["shine", "magic", "new"], el: look("star", 1, { points: 4, inner: 0.22, fill: "#fde047", shadow: true }), size: { h: 0.2 }, anim: POP },
  { id: "wow", group: "stickers", label: "WOW! burst", keywords: ["amazing", "comic", "explosion"], el: look("star", 1.15, { points: 14, inner: 0.76, fill: "#facc15", stroke: WHITE, strokeWidth: 0.035, text: "WOW!", textColor: "#dc2626", shadow: true }), size: { h: 0.26 }, anim: POP },
  { id: "new", group: "stickers", label: "NEW burst", keywords: ["badge", "launch"], el: look("star", 1, { points: 16, inner: 0.8, fill: "#ef4444", text: "NEW", textColor: WHITE, shadow: true }), size: { h: 0.22 }, anim: POP },
  { id: "omg", group: "stickers", label: "OMG burst", keywords: ["wow", "comic", "shock"], el: look("star", 1.1, { points: 12, inner: 0.74, fill: "#ec4899", stroke: WHITE, strokeWidth: 0.035, text: "OMG", textColor: WHITE, shadow: true }), size: { h: 0.24 }, anim: POP },
  { id: "speech", group: "stickers", label: "Speech bubble", keywords: ["talk", "say", "comment", "hello"], el: look("bubble", 1.5, { variant: "speech", fill: WHITE, text: "Hello!", textColor: INK, shadow: true }), size: { h: 0.26 }, anim: POP },
  { id: "thought", group: "stickers", label: "Thought bubble", keywords: ["think", "idea", "cloud"], el: look("bubble", 1.45, { variant: "thought", fill: WHITE, text: "Hmm…", textColor: INK, shadow: true }), size: { h: 0.28 }, anim: POP },
  { id: "sale", group: "stickers", label: "SALE tag", keywords: ["price", "offer", "discount", "shop"], el: look("tag", 2.2, { fill: "#ef4444", text: "SALE", textColor: WHITE, shadow: true }), size: { h: 0.16 }, anim: POP },
  { id: "stamp", group: "stickers", label: "100% stamp", keywords: ["seal", "approved", "guarantee"], el: look("ellipse", 1, { fill: "none", stroke: "#dc2626", strokeWidth: 0.08, text: "100%", textColor: "#dc2626" }), size: { h: 0.22 }, anim: POP },
  { id: "ribbon", group: "stickers", label: "Ribbon", keywords: ["banner", "top pick", "award"], el: look("ribbon", 3.6, { fill: "#2563eb", text: "Top pick", textColor: WHITE, shadow: true }), size: { h: 0.13 }, anim: POP },
  { id: "check", group: "stickers", label: "Check", keywords: ["yes", "done", "tick", "correct"], el: sticker("check", "#22c55e"), size: { h: 0.2 }, anim: POP },
  { id: "cross", group: "stickers", label: "Cross", keywords: ["no", "wrong", "x"], el: sticker("cross", "#ef4444"), size: { h: 0.2 }, anim: POP },
  { id: "warning", group: "stickers", label: "Warning", keywords: ["alert", "caution", "attention"], el: sticker("warning", "#facc15", { textColor: INK }), size: { h: 0.2 }, anim: POP },
  { id: "info", group: "stickers", label: "Info", keywords: ["tip", "note"], el: sticker("info", "#3b82f6"), size: { h: 0.2 }, anim: POP },
  { id: "question", group: "stickers", label: "Question", keywords: ["ask", "help", "faq"], el: sticker("question", "#8b5cf6"), size: { h: 0.2 }, anim: POP },
  { id: "bolt", group: "stickers", label: "Lightning", keywords: ["bolt", "fast", "power", "flash"], el: sticker("bolt", "#facc15", { stroke: INK, strokeWidth: 0.04 }), size: { h: 0.22 }, anim: POP },
  { id: "crown", group: "stickers", label: "Crown", keywords: ["king", "queen", "best", "winner"], el: sticker("crown", "#f59e0b"), size: { h: 0.2 }, anim: POP },
  { id: "music", group: "stickers", label: "Music", keywords: ["note", "song", "audio"], el: sticker("music", "#ec4899"), size: { h: 0.2 }, anim: POP },
  { id: "pin", group: "stickers", label: "Pin", keywords: ["location", "place", "map"], el: sticker("pin", "#ef4444"), size: { h: 0.22 }, anim: POP },
  { id: "bell", group: "stickers", label: "Bell", keywords: ["notification", "subscribe", "alert"], el: sticker("bell", "#facc15", { textColor: "#b45309" }), size: { h: 0.2 }, anim: POP },
  { id: "like", group: "stickers", label: "Like button", keywords: ["heart", "love", "social"], el: look("badge", 2.6, { fill: "#2563eb", radius: 0.5, icon: "heart", text: "Like", textColor: WHITE, shadow: true }), size: { h: 0.09 }, anim: POP },
  { id: "cursor", group: "stickers", label: "Mouse pointer", keywords: ["cursor", "click", "tutorial", "arrow"], el: sticker("cursor", WHITE, { stroke: INK, strokeWidth: 0.06 }), size: { h: 0.12 }, anim: POP },
  { id: "click", group: "stickers", label: "Click", keywords: ["tap", "tutorial", "ripple"], el: sticker("click", "#facc15", { shadow: false }), size: { h: 0.16 }, anim: POP },
  { id: "smile", group: "stickers", label: "Smiley", keywords: ["happy", "face"], el: sticker("smile", "#facc15", { textColor: INK }), size: { h: 0.2 }, anim: POP },
  { id: "sun", group: "stickers", label: "Sun", keywords: ["sunny", "weather", "summer"], el: sticker("sun", "#fbbf24"), size: { h: 0.22 }, anim: POP },
  { id: "play", group: "stickers", label: "Play button", keywords: ["video", "watch"], el: sticker("play", "#ef4444"), size: { h: 0.16 }, anim: POP },
  // news graphics
  { id: "live", group: "news", label: "LIVE", keywords: ["badge", "broadcast", "stream", "on air"], el: look("badge", 2.4, { fill: "#dc2626", radius: 0.14, dot: true, text: "LIVE", textColor: WHITE }), size: { h: 0.065 }, at: "top-left", anim: FADE },
  { id: "live-pulse", group: "news", label: "Pulsing LIVE", keywords: ["beacon", "radar", "pulse", "live", "broadcast", "motion", "stream"], el: look("pulse", 2.8, { fill: "#ef4444", text: "LIVE", textColor: WHITE, bold: true }), size: { h: 0.065 }, at: "top-left", anim: FADE },
  { id: "breaking", group: "news", label: "BREAKING", keywords: ["news", "badge", "urgent"], el: look("badge", 3.8, { fill: "#dc2626", radius: 0, skew: -0.2, text: "BREAKING", textColor: WHITE }), size: { h: 0.07 }, at: "lower-left", anim: FADE },
  { id: "breaking-lower-third", group: "news", label: "Breaking banner", keywords: ["lower third", "headline", "breaking", "news", "banner", "broadcast"], el: look("lowerThird", 4.8, { fill: "#dc2626", subFill: "#0b1220", label: "BREAKING NEWS", labelColor: WHITE, text: "MAJOR ANNOUNCEMENT REPORTED TODAY", subText: "Officials address reporters in live national address", textColor: WHITE, subTextColor: "#94a3b8" }), size: { w: 0.88, h: 0.12 }, at: "lower-left", anim: { in: "rise", out: "fade" } },
  { id: "location-bug", group: "news", label: "Location bug", keywords: ["location", "time", "clock", "live", "bug", "timestamp", "city"], el: look("locationBug", 3.4, { fill: "#0b1220", fillAlpha: 0.92, stroke: "#334155", strokeWidth: 0.02, radius: 0.25, dot: true, text: "NEW DELHI", subText: "LIVE 10:45 AM", textColor: WHITE, subTextColor: "#ef4444" }), size: { h: 0.055 }, at: "top-right", anim: FADE },
  { id: "audio-wave", group: "news", label: "Audio wave", keywords: ["sound", "audio", "equalizer", "voice", "wave", "motion", "phone"], el: look("audioWave", 3.2, { fill: "#06b6d4", text: "LIVE AUDIO FEED", textColor: "#94a3b8" }), size: { h: 0.09 }, at: "lower-left", anim: FADE },
  { id: "market-ticker", group: "news", label: "Market ticker", keywords: ["finance", "market", "stocks", "ticker", "crypto", "business"], el: look("ticker", 24, { fill: "#0b1220", fillAlpha: 0.92, text: "▲ DOW +1.24%   ▲ S&P 500 +0.87%   ▼ NASDAQ -0.32%   ▲ BTC $68,420 +3.4%   ▲ CRUDE $82.10   ▼ GOLD -0.15%", textColor: WHITE, label: "MARKETS", labelColor: "#22c55e", speed: 2.4 }), size: { w: 1, h: 0.075 }, at: "bottom", seconds: 12, anim: { in: "rise", out: "fade" } },
  { id: "developing", group: "news", label: "DEVELOPING", keywords: ["news", "badge", "developing", "story", "urgent"], el: look("badge", 3.6, { fill: "#d97706", radius: 0, skew: -0.15, text: "DEVELOPING STORY", textColor: WHITE, bold: true }), size: { h: 0.07 }, at: "lower-left", anim: FADE },
  { id: "fact-check", group: "news", label: "FACT CHECK", keywords: ["fact check", "verified", "true", "news", "badge"], el: look("badge", 3.2, { fill: "#16a34a", radius: 0.15, text: "FACT CHECK: VERIFIED", textColor: WHITE, bold: true }), size: { h: 0.065 }, at: "lower-left", anim: FADE },
  { id: "special-report", group: "news", label: "SPECIAL REPORT", keywords: ["special", "report", "news", "badge"], el: look("badge", 3.5, { fill: "#7c3aed", radius: 0, skew: -0.12, text: "SPECIAL REPORT", textColor: WHITE, bold: true }), size: { h: 0.07 }, at: "lower-left", anim: FADE },
  { id: "exclusive", group: "news", label: "EXCLUSIVE", keywords: ["news", "badge", "special"], el: look("badge", 4, { fill: INK, radius: 0.12, text: "EXCLUSIVE", textColor: "#facc15" }), size: { h: 0.065 }, at: "lower-left", anim: FADE },
  { id: "rec", group: "news", label: "REC", keywords: ["record", "recording", "camera", "red dot"], el: look("badge", 2.1, { fill: "none", dot: true, labelColor: "#ef4444", text: "REC", textColor: WHITE, shadow: true }), size: { h: 0.065 }, at: "top-right", anim: FADE },
  { id: "progress", group: "news", label: "Progress bar", keywords: ["timer", "time", "loading", "bar"], el: look("progress", 150, { fill: "#ef4444", track: WHITE, trackAlpha: 0.3 }), size: { w: 1, h: 0.012 }, at: "bottom", seconds: "whole" },
  { id: "ticker", group: "news", label: "News ticker", keywords: ["crawl", "scroll", "headline", "breaking"], el: look("ticker", 24, { fill: "#0b1220", fillAlpha: 0.88, text: "Your headline here · The next story here", textColor: WHITE, label: "BREAKING", labelColor: "#dc2626", speed: 2.2 }), size: { w: 1, h: 0.075 }, at: "bottom", seconds: 10, anim: { in: "rise", out: "fade" } },
  // camera & viewfinders
  {
    id: "camera-viewfinder",
    group: "camera",
    label: "Camera viewfinder",
    keywords: ["camera", "viewfinder", "hud", "rec", "recording", "crosshair", "battery", "focus", "4k"],
    el: look("viewfinder", 16 / 9, {
      fill: "none",
      stroke: WHITE,
      strokeWidth: 0.02,
      batteryLevel: 85,
      aperture: "f 1.8",
      resolutionTag: "4K HD",
      timecodeOffset: 38.4,
    }),
    size: { w: 0.94, h: 0.94 },
    seconds: "whole",
    anim: FADE,
  },
  {
    id: "focus-target",
    group: "camera",
    label: "Focus target",
    keywords: ["autofocus", "focus", "crosshair", "target", "camera", "bracket", "pulse"],
    el: look("focusTarget", 1, {
      stroke: WHITE,
      strokeWidth: 0.025,
      fill: "#ef4444",
    }),
    size: { h: 0.22 },
    anim: POP,
  },
  {
    id: "camera-battery",
    group: "camera",
    label: "Battery HUD",
    keywords: ["battery", "power", "charge", "hud", "indicator", "level"],
    el: look("battery", 2.2, {
      batteryLevel: 85,
      fill: "#22c55e",
      stroke: WHITE,
      strokeWidth: 0.04,
    }),
    size: { h: 0.05 },
    at: "top-right",
    anim: FADE,
  },
  {
    id: "cctv-hud",
    group: "camera",
    label: "CCTV camera",
    keywords: ["cctv", "security", "surveillance", "cam", "hud", "viewfinder"],
    el: look("viewfinder", 16 / 9, {
      fill: "none",
      stroke: "#22c55e",
      strokeWidth: 0.02,
      text: "CAM 02",
      aperture: "REC [●]",
      resolutionTag: "1080P",
      batteryLevel: 100,
      timecodeOffset: 0,
    }),
    size: { w: 0.94, h: 0.94 },
    seconds: "whole",
    anim: FADE,
  },
  {
    id: "camcorder-vhs",
    group: "camera",
    label: "VHS Camcorder",
    keywords: ["vhs", "camcorder", "retro", "tape", "play", "hud", "vintage"],
    el: look("viewfinder", 16 / 9, {
      fill: "none",
      stroke: "#facc15",
      strokeWidth: 0.02,
      text: "PLAY ▶",
      aperture: "SP",
      resolutionTag: "AUTO",
      batteryLevel: 65,
      timecodeOffset: 12.0,
    }),
    size: { w: 0.94, h: 0.94 },
    seconds: "whole",
    anim: FADE,
  },
];

const BY_ID = new Map(ELEMENTS.map((p) => [p.id, p]));
export const elementPreset = (id: string) => BY_ID.get(id);

/** The length a new element gets: its own, or the whole video (at least 1 s; 10 s on an empty timeline). */
export function presetSeconds(p: Pick<ElementPreset, "seconds">, videoLength: number): number {
  if (p.seconds === "whole") return videoLength > 0.5 ? Math.round(videoLength * 1000) / 1000 : 10;
  return p.seconds ?? 5;
}

/** A new element clip from a ready-made one, sized and placed for this canvas. */
export function elementClipOf(p: ElementPreset, canvas: { width: number; height: number }, videoLength = 0): Omit<ElementClip, "id"> {
  const { aspect, transform } = placeElement(p.el.aspect, p.size, p.at ?? "center", canvas.width, canvas.height);
  return { type: "element", el: { ...p.el, aspect, preset: p.id }, duration: presetSeconds(p, videoLength), transform, anim: p.anim ?? NO_ANIM, fadeIn: 0, fadeOut: 0 };
}

/** A new emoji element: a fifth of the canvas high, in the middle; it pops in. */
export function emojiClipOf(emoji: string, canvas: { width: number; height: number }): Omit<ElementClip, "id"> {
  const { aspect, transform } = placeElement(1, { h: 0.2 }, "center", canvas.width, canvas.height);
  return { type: "element", el: { kind: "emoji", aspect, emoji, fill: "none", stroke: "none", strokeWidth: 0, preset: "emoji" }, duration: 5, transform, anim: POP, fadeIn: 0, fadeOut: 0 };
}

const KIND_NAME: Record<ElementKind, string> = {
  rect: "Box",
  ellipse: "Circle",
  polygon: "Shape",
  star: "Star",
  line: "Line",
  arrow: "Arrow",
  marker: "Highlighter",
  bubble: "Bubble",
  tag: "Tag",
  ribbon: "Ribbon",
  badge: "Badge",
  icon: "Sticker",
  emoji: "Emoji",
  progress: "Progress bar",
  ticker: "News ticker",
  pulse: "Live beacon",
  lowerThird: "Lower third",
  locationBug: "Location bug",
  audioWave: "Audio wave",
  viewfinder: "Camera viewfinder",
  focusTarget: "Focus target",
  battery: "Battery HUD",
};

/** An element's name (the timeline, the inspector): its words when you changed them, else what it is. */
export function elementName(c: Pick<ElementClip, "el">): string {
  const el = c.el;
  if (el.kind === "emoji") return `${el.emoji ?? ""} ${emojiName(el.emoji) ?? "Emoji"}`.trim();
  const p = el.preset ? elementPreset(el.preset) : undefined;
  if (el.kind === "ticker") return el.text ? `Ticker: ${el.text}` : "News ticker";
  if (el.kind === "lowerThird") return el.text ? `Lower Third: ${el.text}` : "Lower third";
  if (el.text && el.text !== p?.el.text) return el.text;
  return p?.label ?? KIND_NAME[el.kind];
}

/** What the Elements panel shows for a search: ready-made elements and emoji, best first (everything when empty). */
export function searchElements(query: string): { presets: ElementPreset[]; emoji: EmojiItem[] } {
  const q = query.trim();
  if (!q) return { presets: ELEMENTS, emoji: EMOJI };
  const rank = <T>(list: T[], score: (x: T) => number) =>
    list
      .map((x, i) => ({ x, i, s: score(x) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map((r) => r.x);
  return {
    presets: rank(ELEMENTS, (p) => matchScore({ label: p.label, keywords: [...(p.keywords ?? []), ELEMENT_GROUPS.find((g) => g.id === p.group)!.label] }, q)),
    emoji: rank(EMOJI, (x) => matchScore({ label: x.name, keywords: [...(x.keywords ?? "").split(" "), x.group] }, q)),
  };
}
