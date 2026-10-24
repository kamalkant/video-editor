import type { TextMark } from "../edit/doc";

/**
 * Letters of a text styled their own way ("marks", like a word processor): select letters in the Text
 * panel and give them a size, color, font, bold, italic, a line under or through them, or a marker-pen
 * color. A mark is from…to in the text (positions of whole letters: a Hindi letter with its matra is one
 * letter), and holds only what it changes. Pure helpers, shared by the editor, the layout and the reducer.
 */

export type MarkStyle = Omit<TextMark, "from" | "to">;
export const MARK_KEYS = ["font", "size", "color", "bold", "italic", "underline", "strike", "highlight"] as const satisfies readonly (keyof MarkStyle)[];
export type MarkKey = (typeof MARK_KEYS)[number];

type Segmenter = { segment: (s: string) => Iterable<{ index: number }> };
let graphemes: Segmenter | null | undefined;
function segmenter(): Segmenter | null {
  if (graphemes === undefined) {
    const S = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => Segmenter }).Segmenter;
    graphemes = S ? new S(undefined, { granularity: "grapheme" }) : null;
  }
  return graphemes;
}

/** The letters of a text (grapheme clusters: what a reader sees as one letter, e.g. "क्षि" or an emoji). */
export function lettersOf(text: string): string[] {
  const seg = segmenter();
  if (!seg) return [...text];
  const out: string[] = [];
  let last = 0;
  for (const { index } of seg.segment(text)) {
    if (index > last) out.push(text.slice(last, index));
    last = index;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Where letters start and end in a text (0 … text.length). */
export function letterBounds(text: string): number[] {
  const out = [0];
  let at = 0;
  for (const l of lettersOf(text)) out.push((at += l.length));
  return out;
}

/** The letter boundary at or before (down) / at or after (up) pos. */
export function snapToLetter(text: string, pos: number, dir: "down" | "up"): number {
  const b = letterBounds(text);
  const p = Math.max(0, Math.min(text.length, pos));
  if (dir === "down") {
    for (let i = b.length - 1; i >= 0; i--) if (b[i] <= p) return b[i];
    return 0;
  }
  for (const x of b) if (x >= p) return x;
  return text.length;
}

export const styleOf = (m: TextMark | MarkStyle): MarkStyle => {
  const out: Record<string, unknown> = {};
  for (const k of MARK_KEYS) if ((m as Record<string, unknown>)[k] !== undefined) out[k] = (m as Record<string, unknown>)[k];
  return out as MarkStyle;
};
export const isEmptyStyle = (s: MarkStyle) => MARK_KEYS.every((k) => s[k] === undefined);
export const sameStyle = (a: MarkStyle, b: MarkStyle) => MARK_KEYS.every((k) => a[k] === b[k]);

/** The text cut where the look changes: [from, to) parts with the look of the mark over them ({} for none). */
export function segmentsOf(text: string, marks: TextMark[] | undefined): { from: number; to: number; style: MarkStyle }[] {
  const ms = normalizeMarks(text, marks) ?? [];
  const out: { from: number; to: number; style: MarkStyle }[] = [];
  let at = 0;
  for (const m of ms) {
    if (m.from > at) out.push({ from: at, to: m.from, style: {} });
    out.push({ from: m.from, to: m.to, style: styleOf(m) });
    at = m.to;
  }
  if (at < text.length || !out.length) out.push({ from: at, to: text.length, style: {} });
  return out;
}

/**
 * Marks cleaned up: inside the text and on whole letters, sorted, without overlaps (a later mark wins where
 * two cover the same letters), neighbours with the same look joined, empty ones dropped. undefined: none left.
 */
export function normalizeMarks(text: string, marks: TextMark[] | undefined): TextMark[] | undefined {
  if (!marks?.length || !text) return undefined;
  const bounds = letterBounds(text);
  const snap = (p: number, dir: "down" | "up") => {
    const q = Math.max(0, Math.min(text.length, Math.round(p)));
    if (dir === "down") {
      for (let i = bounds.length - 1; i >= 0; i--) if (bounds[i] <= q) return bounds[i];
      return 0;
    }
    for (const x of bounds) if (x >= q) return x;
    return text.length;
  };
  // paint the letters one mark after another (later marks win), then read the runs back
  const look: (MarkStyle | null)[] = new Array(bounds.length - 1).fill(null);
  for (const m of marks) {
    const a = snap(m.from, "down");
    const b = snap(m.to, "up");
    if (b <= a) continue;
    const st = styleOf(m);
    if (isEmptyStyle(st)) continue;
    for (let i = 0; i < look.length; i++) if (bounds[i] >= a && bounds[i + 1] <= b) look[i] = st;
  }
  const out: TextMark[] = [];
  for (let i = 0; i < look.length; i++) {
    const st = look[i];
    if (!st) continue;
    const prev = out[out.length - 1];
    if (prev && prev.to === bounds[i] && sameStyle(styleOf(prev), st)) prev.to = bounds[i + 1];
    else out.push({ from: bounds[i], to: bounds[i + 1], ...st });
  }
  return out.length ? out : undefined;
}

/**
 * Style the letters from…to: each key of the patch is set there (undefined: that key is taken away, so the
 * letters follow the whole text again). Returns the new marks (undefined: none).
 */
export function applyMark(text: string, marks: TextMark[] | undefined, from: number, to: number, patch: Partial<Record<MarkKey, unknown>>): TextMark[] | undefined {
  const a = snapToLetter(text, Math.min(from, to), "down");
  const b = snapToLetter(text, Math.max(from, to), "up");
  if (b <= a) return normalizeMarks(text, marks);
  const out: TextMark[] = [];
  for (const s of segmentsOf(text, marks)) {
    // a part that crosses an edge of the selection is cut there
    const cuts = [s.from, ...[a, b].filter((x) => x > s.from && x < s.to), s.to];
    for (let i = 0; i < cuts.length - 1; i++) {
      const [x, y] = [cuts[i], cuts[i + 1]];
      let st: Record<string, unknown> = { ...s.style };
      if (x >= a && y <= b) {
        st = { ...st };
        for (const [k, v] of Object.entries(patch)) {
          if (!(MARK_KEYS as readonly string[]).includes(k)) continue;
          if (v === undefined) delete st[k];
          else st[k] = v;
        }
      }
      if (!isEmptyStyle(st as MarkStyle)) out.push({ from: x, to: y, ...(st as MarkStyle) });
    }
  }
  return normalizeMarks(text, out);
}

/** Take every special look off the letters from…to. */
export const clearMarks = (text: string, marks: TextMark[] | undefined, from: number, to: number) => applyMark(text, marks, from, to, Object.fromEntries(MARK_KEYS.map((k) => [k, undefined])));

/**
 * The look every letter in from…to shares (what the toolbar shows): a key is there only when all of them
 * agree. An empty selection (a caret) shows the letter before it.
 */
export function styleAt(text: string, marks: TextMark[] | undefined, from: number, to: number): MarkStyle {
  let a = Math.min(from, to);
  let b = Math.max(from, to);
  if (a === b) {
    a = snapToLetter(text, a - 1, "down");
    b = Math.max(a, snapToLetter(text, b, "up"));
    if (a === b) return {};
  }
  const parts = segmentsOf(text, marks).filter((s) => s.to > a && s.from < b);
  if (!parts.length) return {};
  const out: Record<string, unknown> = { ...parts[0].style };
  for (const p of parts.slice(1)) for (const k of MARK_KEYS) if (out[k] !== p.style[k]) delete out[k];
  return out as MarkStyle;
}

/**
 * The marks after the words changed (typed in another box, a caption edited, words cut): letters before
 * and after the change keep their marks; a mark the change was inside grows or shrinks with it.
 */
export function remapMarks(oldText: string, newText: string, marks: TextMark[] | undefined): TextMark[] | undefined {
  if (!marks?.length) return undefined;
  if (oldText === newText) return normalizeMarks(newText, marks);
  let p = 0;
  const max = Math.min(oldText.length, newText.length);
  while (p < max && oldText[p] === newText[p]) p++;
  let q = 0;
  while (q < max - p && oldText[oldText.length - 1 - q] === newText[newText.length - 1 - q]) q++;
  let oldEnd = oldText.length - q;
  const delta = newText.length - oldText.length;
  // words only added or only taken away: the same change could be a little earlier ("one two three" → "one three"
  // takes away "wo t" or "two "); the one that starts a word is the one people made
  const changed = delta > 0 ? newText : delta < 0 ? oldText : null;
  if (changed && (delta > 0 ? oldEnd === p : newText.length - q === p) && p > 0 && !/\s/.test(changed[p - 1])) {
    const n = Math.abs(delta);
    for (let a = p; a > 0 && changed[a - 1] === changed[a - 1 + n]; a--) {
      if (a - 1 === 0 || /\s/.test(changed[a - 2])) {
        p = a - 1;
        oldEnd = delta < 0 ? p + n : p;
        break;
      }
    }
  }
  // (a position inside the changed part moves to its start: a mark that ended there now ends before the change)
  const map = (x: number) => (x <= p ? x : x >= oldEnd ? x + delta : p);
  return normalizeMarks(
    newText,
    marks.map((m) => ({ ...m, from: map(m.from), to: map(m.to) })).filter((m) => m.to > m.from),
  );
}
