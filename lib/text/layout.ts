import { DEFAULT_TRANSFORM, type TextClip, type TextMark, type TextStyle } from "../edit/doc";
import { fontCssOf } from "./fonts";
import { lettersOf, segmentsOf } from "./marks";

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

export { BUILTIN_FONTS, FONTS, brandFamily, fontPx, fontStack, type BuiltinFont } from "./fonts";
/** The CSS font of a text style at px (bold and italic from the style unless given). */
export const fontCss = (style: Pick<TextStyle, "font" | "bold" | "italic">, px: number, bold = style.bold, italic = !!style.italic) => fontCssOf(style.font, px, bold, italic);

export type Measure = (text: string, font: string) => number;
/**
 * Part of a line drawn one way: the whole line when nothing in it is styled differently, else one piece per
 * look (letters with their own size, color, font… : lib/text/marks). x is on the canvas; w includes its
 * letter spacing.
 */
export type TextPiece = {
  text: string;
  x: number;
  w: number;
  font: string;
  size: number;
  color: string;
  /** the text's own lines (a gradient and an outline go on them; not on a lower third's second line or the BREAKING label) */
  main: boolean;
  /** a mark gave it its own color (no gradient on it) */
  marked: boolean;
  underline?: boolean;
  strike?: boolean;
  /** a marker-pen color behind it */
  highlight?: string;
  /** where it is in the clip's text, from…to (-1: not from the text, the BREAKING label) */
  from: number;
  to: number;
};
/** One line: its text, where it starts (x) and its baseline (y), its biggest letters (size), its width and pieces. */
export type TextLine = { text: string; x: number; y: number; font: string; color: string; size: number; w: number; pieces: TextPiece[] };
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

/** How a part of a text looks (the clip's style, with a mark's changes). */
type Look = { fontId: string; bold: boolean; italic: boolean; size: number; color: string; main: boolean; marked: boolean; underline?: boolean; strike?: boolean; highlight?: string };
type Frag = { text: string; from: number; to: number; look: Look; css: string };
const sameLook = (a: Look, b: Look) => a.fontId === b.fontId && a.bold === b.bold && a.italic === b.italic && a.size === b.size && a.color === b.color && a.main === b.main && a.marked === b.marked && !!a.underline === !!b.underline && !!a.strike === !!b.strike && a.highlight === b.highlight;

/** The text from…to, cut where its look changes (the base look and each mark), in capitals per part for Breaking. */
function fragsOf(text: string, marks: TextMark[] | undefined, from: number, to: number, base: Look, upper: boolean): Frag[] {
  const out: Frag[] = [];
  for (const s of segmentsOf(text, marks)) {
    const a = Math.max(from, s.from);
    const b = Math.min(to, s.to);
    if (b <= a) continue;
    const m = s.style;
    const look: Look = {
      fontId: m.font ?? base.fontId,
      bold: m.bold ?? base.bold,
      italic: m.italic ?? base.italic,
      size: base.size * (m.size ?? 1),
      color: m.color ?? base.color,
      main: base.main,
      marked: m.color !== undefined,
      underline: m.underline ?? base.underline,
      strike: m.strike ?? base.strike,
      highlight: m.highlight,
    };
    const part = text.slice(a, b);
    out.push({ text: upper ? part.toUpperCase() : part, from: a, to: b, look, css: fontCssOf(look.fontId, look.size, look.bold, look.italic) });
  }
  return out;
}

/** Lines of fragments no wider than maxW: words wrap (between them one space, in the look of the space typed there). */
function wrapFrags(frags: Frag[], maxW: number, width: (pieces: Frag[]) => number): Frag[][] {
  type Word = { frags: Frag[]; space: Frag | null };
  const paras: Word[][] = [[]];
  let word: Frag[] = [];
  const endWord = (space: Frag | null) => {
    if (word.length) paras[paras.length - 1].push({ frags: word, space });
    word = [];
  };
  for (const f of frags) {
    let i = 0;
    const chars = f.text;
    while (i < chars.length) {
      const ch = chars[i];
      if (ch === "\n") {
        endWord(null);
        paras.push([]);
        i++;
        continue;
      }
      if (/\s/.test(ch)) {
        // (only the first of several spaces counts, like the plain text)
        const space: Frag = { text: " ", from: f.from + i, to: f.from + i + 1, look: f.look, css: f.css };
        if (word.length) endWord(space);
        else {
          const ws = paras[paras.length - 1];
          if (ws.length && !ws[ws.length - 1].space) ws[ws.length - 1].space = space;
        }
        i++;
        continue;
      }
      let j = i;
      while (j < chars.length && chars[j] !== "\n" && !/\s/.test(chars[j])) j++;
      const piece: Frag = { text: chars.slice(i, j), from: f.from + i, to: f.from + j, look: f.look, css: f.css };
      const last = word[word.length - 1];
      if (last && sameLook(last.look, piece.look) && last.to === piece.from) word[word.length - 1] = { ...last, text: last.text + piece.text, to: piece.to };
      else word.push(piece);
      i = j;
    }
  }
  endWord(null);
  const lines: Frag[][] = [];
  for (const words of paras) {
    if (!words.length) {
      lines.push([]);
      continue;
    }
    let line: Frag[] = [...words[0].frags];
    for (let w = 1; w < words.length; w++) {
      const sp = words[w - 1].space ?? { ...words[w - 1].frags[words[w - 1].frags.length - 1], text: " " };
      const next = [...line, sp, ...words[w].frags];
      if (width(next) <= maxW) line = next;
      else {
        lines.push(line);
        line = [...words[w].frags];
      }
    }
    lines.push(line);
  }
  return lines.map(merge);
}

/** Neighbouring fragments with the same look join into one piece. */
function merge(frags: Frag[]): Frag[] {
  const out: Frag[] = [];
  for (const f of frags) {
    const last = out[out.length - 1];
    if (last && sameLook(last.look, f.look)) out[out.length - 1] = { ...last, text: last.text + f.text, to: Math.max(last.to, f.to) };
    else out.push(f);
  }
  return out;
}

/** Where every line and box of a text clip goes on a W × H canvas. */
export function layoutText(clip: Pick<TextClip, "text" | "style" | "transform"> & { marks?: TextMark[] }, W: number, H: number, measureRaw: Measure): TextLayout {
  const st = clip.style;
  const k = (H / 1080) * clip.transform.scale;
  const size = st.size * k;
  // letter spacing: each gap between letters gets a share of the size
  const sp = st.spacing ?? 0;
  const letters = (t: string) => (sp ? lettersOf(t).length : 0);
  const pieceW = (f: Pick<Frag, "text" | "css" | "look">) => measureRaw(f.text, f.css) + sp * f.look.size * letters(f.text);
  /** a line's width (merged pieces; no spacing after its last letter) */
  const lineW = (frags: Frag[]) => {
    const ps = merge(frags);
    if (!ps.length) return 0;
    return ps.reduce((n, f) => n + pieceW(f), 0) - (sp && ps[ps.length - 1].text ? sp * ps[ps.length - 1].look.size : 0);
  };
  const pad = size * 0.4;
  const dx = clip.transform.x * W;
  const dy = clip.transform.y * H;
  const lines: TextLine[] = [];
  const boxes: TextBox[] = [];
  const base = (over: Partial<Look>): Look => ({ fontId: st.font, bold: st.bold, italic: !!st.italic, size, color: st.color, main: true, marked: false, underline: st.underline, strike: st.strike, ...over });
  /** A line of pieces placed at x (its left) on baseline y. */
  const place = (frags: Frag[], x: number, y: number, look: Look): TextLine => {
    let at = x;
    const pieces: TextPiece[] = frags.map((f) => {
      const w = pieceW(f);
      const p: TextPiece = { text: f.text, x: at, w, font: f.css, size: f.look.size, color: f.look.color, main: f.look.main, marked: f.look.marked, from: f.from, to: f.to, ...(f.look.underline ? { underline: true } : {}), ...(f.look.strike ? { strike: true } : {}), ...(f.look.highlight ? { highlight: f.look.highlight } : {}) };
      at += w;
      return p;
    });
    const big = pieces.length ? Math.max(...pieces.map((p) => p.size)) : look.size;
    return { text: frags.map((f) => f.text).join(""), x, y, font: pieces[0]?.font ?? fontCssOf(look.fontId, look.size, look.bold, look.italic), color: look.color, size: big, w: lineW(frags), pieces };
  };
  /** The line heights (its biggest letters × 1.22). */
  const heightOf = (frags: Frag[], look: Look) => 1.22 * (frags.length ? Math.max(...frags.map((f) => f.look.size)) : look.size);

  if (st.preset === "lowerThird") {
    // first line: name (big, bold) on the main color bar; next lines: role (smaller) on the accent bar
    const nl = clip.text.indexOf("\n");
    const firstEnd = nl < 0 ? clip.text.length : nl;
    const nameLook = base({ bold: true });
    const roleLook = base({ bold: false, size: size * 0.62, color: "#111827", main: false });
    const maxW = W * 0.6;
    const l1 = wrapFrags(fragsOf(clip.text, clip.marks, 0, firstEnd, nameLook, false), maxW, lineW);
    const l2 = nl < 0 ? [] : wrapFrags(fragsOf(clip.text, clip.marks, nl + 1, clip.text.length, roleLook, false), maxW, lineW);
    const w1 = Math.max(...l1.map(lineW), 1);
    const w2 = l2.length ? Math.max(...l2.map(lineW)) : 0;
    const left = W * 0.06 + dx;
    const hs1 = l1.map((l) => heightOf(l, nameLook));
    const hs2 = l2.map((l) => heightOf(l, roleLook));
    const h1 = hs1.reduce((a, b) => a + b, 0) + pad;
    const h2 = l2.length ? hs2.reduce((a, b) => a + b, 0) + pad * 0.7 : 0;
    const top = H * 0.9 - h1 - h2 + dy;
    boxes.push({ x: left, y: top, w: w1 + pad * 2, h: h1, color: st.box === "none" ? "#1d4ed8" : st.box, radius: size * 0.12 });
    let acc = 0;
    l1.forEach((l, i) => {
      lines.push(place(l, left + pad, top + pad / 2 + acc + hs1[i] * 0.8, nameLook));
      acc += hs1[i];
    });
    if (l2.length) {
      boxes.push({ x: left, y: top + h1, w: w2 + pad * 1.6, h: h2, color: st.accent, radius: size * 0.1 });
      acc = 0;
      l2.forEach((l, i) => {
        lines.push(place(l, left + pad * 0.8, top + h1 + pad * 0.35 + acc + hs2[i] * 0.8, roleLook));
        acc += hs2[i];
      });
    }
  } else if (st.preset === "breaking") {
    // a full-width bar: a dark "BREAKING" label, then the headline
    const look = base({ bold: true });
    const label: Frag = { text: "BREAKING", from: -1, to: -1, look: { ...look, color: "#fbbf24", main: false, marked: false, underline: false, strike: false }, css: fontCssOf(look.fontId, size, true, look.italic) };
    const lw = lineW([label]) + pad * 2;
    const head = wrapFrags(fragsOf(clip.text, clip.marks, 0, clip.text.length, look, true), W - lw - pad * 3, lineW).slice(0, 1);
    const lhH = heightOf(head[0] ?? [], look);
    const barH = lhH + pad;
    const top = H * 0.86 - barH / 2 + dy;
    boxes.push({ x: 0, y: top, w: W, h: barH, color: st.box === "none" ? "#b91c1c" : st.box, radius: 0 });
    boxes.push({ x: 0, y: top, w: lw, h: barH, color: st.accent, radius: 0 });
    lines.push(place([label], pad, top + pad / 2 + lhH * 0.8, label.look));
    lines.push(place(head[0] ?? [], lw + pad + dx, top + pad / 2 + lhH * 0.8, look));
  } else {
    const look = base({});
    const maxW = W * (st.preset === "caption" ? 0.8 : 0.86);
    const ls = wrapFrags(fragsOf(clip.text, clip.marks, 0, clip.text.length, look, false), maxW, lineW);
    const widths = ls.map(lineW);
    const hs = ls.map((l) => heightOf(l, look));
    const bw = Math.max(...widths, 1);
    const bh = hs.reduce((a, b) => a + b, 0);
    const cx = W / 2 + dx;
    const cy = (st.preset === "caption" ? H * 0.86 : H / 2) + dy;
    const top = cy - bh / 2;
    const leftOf = (w: number) => (st.align === "left" ? cx - bw / 2 : st.align === "right" ? cx + bw / 2 - w : cx - w / 2);
    let acc = 0;
    if (st.box !== "none") {
      // caption: one box per line (like TV subtitles); others: one box around the block
      if (st.preset === "caption")
        widths.forEach((w, i) => {
          boxes.push({ x: leftOf(w) - pad * 0.6, y: top + acc + hs[i] * 0.05, w: w + pad * 1.2, h: hs[i] * 0.95, color: `${st.box}b3`, radius: size * 0.12 });
          acc += hs[i];
        });
      else boxes.push({ x: cx - bw / 2 - pad, y: top - pad / 2, w: bw + pad * 2, h: bh + pad, color: st.box, radius: size * 0.16 });
    }
    acc = 0;
    ls.forEach((l, i) => {
      lines.push(place(l, leftOf(widths[i]), top + acc + hs[i] * 0.8, look));
      acc += hs[i];
    });
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
    x1 = Math.min(x1, l.x);
    y1 = Math.min(y1, l.y - l.size);
    x2 = Math.max(x2, l.x + l.w);
    y2 = Math.max(y2, l.y + l.size * 0.3);
  }
  if (!Number.isFinite(x1)) x1 = y1 = x2 = y2 = 0;
  return { lines, boxes, bounds: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, shadow: st.shadow && st.box === "none" };
}

/**
 * Ready-made text styles (the Text panel): a layout (preset) with its look,
 * effects and animation. The first five are the presets themselves.
 */
export type TextStyleTemplate = { id: string; label: string; hint: string; preset: TextStyle["preset"]; text: string; seconds: number; style: Partial<TextStyle>; transform?: Partial<TextClip["transform"]>; anim?: TextClip["anim"]; marks?: TextMark[] };
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
  // Hindi styles (Google fonts with Devanagari; one word styled on its own, like the Text panel's marks)
  { id: "hindiTitle", label: "हिंदी शीर्षक", hint: "A Hindi headline, one word bigger and gold", preset: "title", text: "आज की बड़ी खबर", seconds: 4, style: { font: "gf:Rozha One", size: 120, bold: false, shadowStyle: "strong" }, marks: [{ from: 6, to: 10, color: "#fbbf24", size: 1.3 }], anim: { in: "pop", out: "fade" } },
  { id: "hindiNews", label: "ताज़ा ख़बर", hint: "A Hindi news bar", preset: "breaking", text: "दिल्ली में आज रात भारी बारिश की संभावना", seconds: 6, style: { font: "gf:Khand", size: 56 }, anim: { in: "slide", out: "fade" } },
  { id: "hindiQuote", label: "हिंदी उद्धरण", hint: "A Hindi quote, the last words highlighted", preset: "plain", text: "सपने वो नहीं जो सोते हुए देखें,\nसपने वो हैं जो सोने न दें।", seconds: 6, style: { font: "gf:Tiro Devanagari Hindi", size: 60, bold: false }, marks: [{ from: 47, to: 57, color: "#111827", highlight: "#fde047" }], anim: { in: "fade", out: "fade" } },
  { id: "hindiHandwritten", label: "हाथ से लिखा", hint: "Friendly Hindi handwriting", preset: "plain", text: "धन्यवाद! 🙏", seconds: 4, style: { font: "gf:Kalam", size: 96, bold: true, color: "#fef3c7" }, anim: { in: "bounce", out: "fade" } },
];

/** A new text clip in a ready-made style (TEXT_STYLES; or a preset's id). */
export function textClipOfStyle(id: string): Omit<TextClip, "id"> {
  const t = TEXT_STYLES.find((x) => x.id === id) ?? TEXT_STYLES[0];
  const base = textClipOf(t.preset);
  return { ...base, text: t.text, duration: t.seconds, style: { ...base.style, ...t.style }, transform: { ...base.transform, ...(t.transform ?? {}) }, anim: t.anim ?? base.anim, ...(t.marks ? { marks: t.marks.map((m) => ({ ...m })) } : {}) };
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
