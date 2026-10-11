import { DEFAULT_TRANSFORM, type TextClip, type TextStyle } from "../edit/doc";

/**
 * Text layout, shared by the preview and the export (text is drawn in the
 * browser: this FFmpeg has no text support). Pure: measuring is passed in,
 * so it can be tested. Sizes are in "pixels on a 1080-high canvas" and scale
 * with the canvas; x/y offsets move the whole block (fractions of the canvas).
 */

export const TEXT_PRESETS: Record<TextStyle["preset"], { label: string; hint: string; text: string; style: TextStyle; seconds: number }> = {
  title: {
    label: "Title",
    hint: "Big centered title",
    text: "Your title here",
    seconds: 4,
    style: { preset: "title", font: "sans", size: 110, color: "#ffffff", box: "none", align: "center", bold: true, accent: "#60a5fa", shadow: true },
  },
  lowerThird: {
    label: "Lower third",
    hint: "Name and role at the bottom left (presenters, interviews)",
    text: "Kamal Kant\nNews presenter",
    seconds: 5,
    style: { preset: "lowerThird", font: "sans", size: 58, color: "#ffffff", box: "#1d4ed8", align: "left", bold: true, accent: "#fbbf24", shadow: false },
  },
  breaking: {
    label: "Breaking news",
    hint: "A full-width news bar at the bottom",
    text: "Heavy rain expected in Delhi tonight",
    seconds: 6,
    style: { preset: "breaking", font: "sans", size: 52, color: "#ffffff", box: "#b91c1c", align: "left", bold: true, accent: "#111827", shadow: false },
  },
  caption: {
    label: "Caption",
    hint: "Subtitle-style line at the bottom",
    text: "Welcome to our channel",
    seconds: 3,
    style: { preset: "caption", font: "sans", size: 52, color: "#ffffff", box: "#000000", align: "center", bold: false, accent: "#ffffff", shadow: false },
  },
  plain: {
    label: "Plain text",
    hint: "Just text, anywhere",
    text: "Text",
    seconds: 4,
    style: { preset: "plain", font: "sans", size: 72, color: "#ffffff", box: "none", align: "center", bold: false, accent: "#ffffff", shadow: true },
  },
};

export type BuiltinFont = "sans" | "serif" | "rounded" | "mono" | "condensed";
export const FONTS: Record<BuiltinFont, { label: string; stack: string }> = {
  sans: { label: "Sans (clean)", stack: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
  serif: { label: "Serif (classic)", stack: 'Georgia, "Times New Roman", Times, serif' },
  rounded: { label: "Rounded (friendly)", stack: 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", ui-sans-serif, system-ui, sans-serif' },
  mono: { label: "Mono (code)", stack: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' },
  condensed: { label: "Condensed (news)", stack: '"Arial Narrow", "Helvetica Neue", Arial, sans-serif' },
};

/** The CSS family name of a Brand Kit font (loaded into the page with FontFace; lib/editor/useBrand). */
export const brandFamily = (id: string) => `VDO Brand ${id}`;
/** The font stack of a text style: a Brand Kit font falls back to Sans until it has loaded. */
export const fontStack = (font: TextStyle["font"]) => (font.startsWith("brand:") ? `"${brandFamily(font.slice(6))}", ${FONTS.sans.stack}` : (FONTS[font as BuiltinFont] ?? FONTS.sans).stack);
export const fontCss = (style: TextStyle, px: number, bold = style.bold) => `${bold ? 700 : 400} ${Math.max(1, Math.round(px))}px ${fontStack(style.font)}`;
/** The pixel size in a CSS font string made by fontCss. */
export const fontPx = (font: string) => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);

export type Measure = (text: string, font: string) => number;
export type TextLine = { text: string; x: number; y: number; font: string; color: string; size: number };
export type TextBox = { x: number; y: number; w: number; h: number; color: string; radius: number };
export type TextLayout = { lines: TextLine[]; boxes: TextBox[]; bounds: { x: number; y: number; w: number; h: number }; shadow: boolean };

/** Split into lines no wider than maxW (words wrap; a single very long word stays whole). */
export function wrap(text: string, font: string, maxW: number, measure: Measure): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push("");
      continue;
    }
    let line = words[0];
    for (const w of words.slice(1)) {
      const next = `${line} ${w}`;
      if (measure(next, font) <= maxW) line = next;
      else {
        out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

/**
 * The point a text grows from when its size changes over time (keyframes):
 * the middle for titles, the bottom-left corner of a lower third, the left end
 * of a Breaking bar, the middle of a caption line. (The same anchors as below.)
 */
export function textAnchor(preset: TextStyle["preset"], W: number, H: number): { x: number; y: number } {
  if (preset === "lowerThird") return { x: W * 0.06, y: H * 0.9 };
  if (preset === "breaking") return { x: 0, y: H * 0.86 };
  if (preset === "caption") return { x: W / 2, y: H * 0.86 };
  return { x: W / 2, y: H / 2 };
}

/** Where every line and box of a text clip goes on a W × H canvas. */
export function layoutText(clip: Pick<TextClip, "text" | "style" | "transform">, W: number, H: number, measureRaw: Measure): TextLayout {
  const st = clip.style;
  const k = (H / 1080) * clip.transform.scale;
  const size = st.size * k;
  // letter spacing: each gap between letters gets a share of the size (the font's px size is in the CSS font)
  const sp = st.spacing ?? 0;
  const measure: Measure = sp ? (t, f) => measureRaw(t, f) + sp * fontPx(f) * Math.max(0, [...t].length - 1) : measureRaw;
  const lh = size * 1.22;
  const pad = size * 0.4;
  const dx = clip.transform.x * W;
  const dy = clip.transform.y * H;
  const text = st.preset === "breaking" ? clip.text.toUpperCase() : clip.text;
  const lines: TextLine[] = [];
  const boxes: TextBox[] = [];

  if (st.preset === "lowerThird") {
    // first line: name (big, bold) on the main color bar; next lines: role (smaller) on the accent bar
    const [first, ...rest] = text.split("\n");
    const f1 = fontCss(st, size, true);
    const f2 = fontCss(st, size * 0.62, false);
    const maxW = W * 0.6;
    const l1 = wrap(first ?? "", f1, maxW, measure);
    const l2 = rest.length ? wrap(rest.join("\n"), f2, maxW, measure) : [];
    const w1 = Math.max(...l1.map((l) => measure(l, f1)), 1);
    const w2 = l2.length ? Math.max(...l2.map((l) => measure(l, f2))) : 0;
    const left = W * 0.06 + dx;
    const h1 = l1.length * lh + pad;
    const h2 = l2.length ? l2.length * lh * 0.62 + pad * 0.7 : 0;
    const top = H * 0.9 - h1 - h2 + dy;
    boxes.push({ x: left, y: top, w: w1 + pad * 2, h: h1, color: st.box === "none" ? "#1d4ed8" : st.box, radius: size * 0.12 });
    l1.forEach((t, i) => lines.push({ text: t, x: left + pad, y: top + pad / 2 + lh * (i + 0.8), font: f1, color: st.color, size }));
    if (l2.length) {
      boxes.push({ x: left, y: top + h1, w: w2 + pad * 1.6, h: h2, color: st.accent, radius: size * 0.1 });
      l2.forEach((t, i) => lines.push({ text: t, x: left + pad * 0.8, y: top + h1 + pad * 0.35 + lh * 0.62 * (i + 0.8), font: f2, color: "#111827", size: size * 0.62 }));
    }
  } else if (st.preset === "breaking") {
    // a full-width bar: a dark "BREAKING" label, then the headline
    const f = fontCss(st, size, true);
    const label = "BREAKING";
    const lw = measure(label, f) + pad * 2;
    const barH = lh + pad;
    const top = H * 0.86 - barH / 2 + dy;
    const l = wrap(text, f, W - lw - pad * 3, measure).slice(0, 1);
    boxes.push({ x: 0, y: top, w: W, h: barH, color: st.box === "none" ? "#b91c1c" : st.box, radius: 0 });
    boxes.push({ x: 0, y: top, w: lw, h: barH, color: st.accent, radius: 0 });
    lines.push({ text: label, x: pad, y: top + pad / 2 + lh * 0.8, font: f, color: "#fbbf24", size });
    lines.push({ text: l[0] ?? "", x: lw + pad + dx, y: top + pad / 2 + lh * 0.8, font: f, color: st.color, size });
  } else {
    const f = fontCss(st, size);
    const maxW = W * (st.preset === "caption" ? 0.8 : 0.86);
    const ls = wrap(text, f, maxW, measure);
    const widths = ls.map((l) => measure(l, f));
    const bw = Math.max(...widths, 1);
    const bh = ls.length * lh;
    const cx = W / 2 + dx;
    const cy = (st.preset === "caption" ? H * 0.86 : H / 2) + dy;
    const top = cy - bh / 2;
    const leftOf = (w: number) => (st.align === "left" ? cx - bw / 2 : st.align === "right" ? cx + bw / 2 - w : cx - w / 2);
    if (st.box !== "none") {
      // caption: one box per line (like TV subtitles); others: one box around the block
      if (st.preset === "caption") widths.forEach((w, i) => boxes.push({ x: leftOf(w) - pad * 0.6, y: top + lh * i + lh * 0.05, w: w + pad * 1.2, h: lh * 0.95, color: `${st.box}b3`, radius: size * 0.12 }));
      else boxes.push({ x: cx - bw / 2 - pad, y: top - pad / 2, w: bw + pad * 2, h: bh + pad, color: st.box, radius: size * 0.16 });
    }
    ls.forEach((t, i) => lines.push({ text: t, x: leftOf(widths[i]), y: top + lh * (i + 0.8), font: f, color: st.color, size }));
  }

  // the box shape: a pill (round ends) or square corners
  if (st.shape === "pill") for (const b of boxes) b.radius = Math.min(b.h, b.w) / 2;
  else if (st.shape === "square") for (const b of boxes) b.radius = 0;
  // bounds: everything drawn (for the selection box on the preview)
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const b of boxes) {
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w);
    y2 = Math.max(y2, b.y + b.h);
  }
  for (const l of lines) {
    const w = measure(l.text, l.font);
    x1 = Math.min(x1, l.x);
    y1 = Math.min(y1, l.y - l.size);
    x2 = Math.max(x2, l.x + w);
    y2 = Math.max(y2, l.y + l.size * 0.3);
  }
  if (!Number.isFinite(x1)) x1 = y1 = x2 = y2 = 0;
  return { lines, boxes, bounds: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, shadow: st.shadow && st.box === "none" };
}

/**
 * Ready-made text styles (the Text panel): a layout (preset) with its look,
 * effects and animation. The first five are the presets themselves.
 */
export type TextStyleTemplate = { id: string; label: string; hint: string; preset: TextStyle["preset"]; text: string; seconds: number; style: Partial<TextStyle>; transform?: Partial<TextClip["transform"]>; anim?: TextClip["anim"] };
export const TEXT_STYLES: TextStyleTemplate[] = [
  ...(["title", "lowerThird", "breaking", "caption", "plain"] as const).map((id) => ({ id, label: TEXT_PRESETS[id].label, hint: TEXT_PRESETS[id].hint, preset: id, text: TEXT_PRESETS[id].text, seconds: TEXT_PRESETS[id].seconds, style: {} })),
  { id: "bigTitle", label: "Big title", hint: "A huge bold title with a gold fade", preset: "title", text: "BIG NEWS", seconds: 4, style: { size: 170, gradient: "#fbbf24", shadowStyle: "strong" }, anim: { in: "zoom", out: "fade" } },
  { id: "outlineTitle", label: "Outline title", hint: "White letters with a black outline: readable on any video", preset: "title", text: "Your title", seconds: 4, style: { size: 130, shadow: false, outline: { color: "#000000", width: 0.06 } }, anim: { in: "pop", out: "fade" } },
  { id: "neon", label: "Neon", hint: "Glowing pink letters", preset: "title", text: "OPEN NOW", seconds: 4, style: { size: 120, font: "rounded", color: "#fdf4ff", accent: "#e879f9", shadowStyle: "glow" }, anim: { in: "blur", out: "fade" } },
  { id: "quote", label: "Quote", hint: "A quote and who said it", preset: "plain", text: "“Make it simple,\nbut significant.”\n— Don Draper", seconds: 6, style: { font: "serif", size: 64, bold: false }, anim: { in: "typewriter", out: "fade" } },
  { id: "callout", label: "Callout", hint: "A short label in a yellow pill", preset: "plain", text: "Look here!", seconds: 3, style: { size: 56, bold: true, color: "#111827", box: "#fde047", shape: "pill", shadow: false }, transform: { y: -0.3 }, anim: { in: "bounce", out: "fade" } },
  { id: "subscribe", label: "Subscribe button", hint: "A red SUBSCRIBE button (a call to action)", preset: "plain", text: "SUBSCRIBE", seconds: 4, style: { size: 60, bold: true, box: "#dc2626", shape: "pill", spacing: 0.08, shadow: false }, transform: { y: 0.3 }, anim: { in: "pop", out: "pop" } },
  { id: "handle", label: "Social handle", hint: "@yourname in a dark pill, bottom right", preset: "plain", text: "@yourchannel", seconds: 5, style: { size: 46, bold: true, box: "#111827", shape: "pill", shadow: false }, transform: { x: 0.3, y: 0.38 }, anim: { in: "slide", out: "fade" } },
  { id: "chapter", label: "Chapter", hint: "Wide spaced capitals for a new part", preset: "title", text: "CHAPTER ONE", seconds: 3, style: { size: 64, spacing: 0.4 }, anim: { in: "fade", out: "fade" } },
  { id: "credits", label: "End credits", hint: "Thanks and names at the end", preset: "title", text: "Thanks for watching\nMade by Your Name", seconds: 6, style: { size: 56, bold: false, spacing: 0.05 }, anim: { in: "rise", out: "fade" } },
];

/** A new text clip in a ready-made style (TEXT_STYLES; or a preset's id). */
export function textClipOfStyle(id: string): Omit<TextClip, "id"> {
  const t = TEXT_STYLES.find((x) => x.id === id) ?? TEXT_STYLES[0];
  const base = textClipOf(t.preset);
  return { ...base, text: t.text, duration: t.seconds, style: { ...base.style, ...t.style }, transform: { ...base.transform, ...(t.transform ?? {}) }, anim: t.anim ?? base.anim };
}

/** A new text clip of a preset (without id and start: the timeline places it). */
export function textClipOf(preset: TextStyle["preset"]): Omit<TextClip, "id"> {
  const p = TEXT_PRESETS[preset];
  return {
    type: "text",
    text: p.text,
    style: { ...p.style },
    duration: p.seconds,
    transform: { ...DEFAULT_TRANSFORM },
    anim: preset === "lowerThird" || preset === "breaking" ? { in: "slide", out: "fade" } : preset === "title" ? { in: "rise", out: "fade" } : { in: "fade", out: "fade" },
    fadeIn: 0,
    fadeOut: 0,
  };
}
