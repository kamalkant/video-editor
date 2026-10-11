import { isReversed, speedOf, type AudioClip, type VideoClip } from "../edit/doc";

/**
 * Subtitles: what was said (segments, in the clip's source seconds) → caption
 * clips on the timeline. Pure, so the panel, the tests and the export agree.
 */

/** One spoken word: when it starts (same seconds as its segment) and the word itself. */
export type SegmentWord = { start: number; text: string };
/**
 * One spoken phrase, in seconds from the start of the sound that was sent. `words`, when the
 * transcriber gave them, line up one-to-one with the words of `text` (else they are left out).
 */
export type Segment = { start: number; end: number; text: string; words?: SegmentWord[] };
/**
 * A caption on the timeline (timeline seconds). `wordTimes`: when each word of `text` is said,
 * in seconds from the caption's start (word-by-word captions follow them; without, evenly spread).
 */
export type Caption = { start: number; duration: number; text: string; wordTimes?: number[] };

/** The words of a caption, as the caption styles and the word timings count them. */
export const captionWords = (text: string): string[] => text.split(/\s+/).filter(Boolean);

export const MAX_LINE = 42;
export const MAX_LINES = 2;
export const MIN_CAPTION = 0.7;
export const MAX_CAPTION = 7;

/** Sorted, inside [0, length], no overlaps, no empty text (what Gemini sends back can be a little loose). */
export function cleanSegments(raw: unknown, length: number): Segment[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: Segment[] = [];
  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const text = typeof o.text === "string" ? o.text.replace(/\s+/g, " ").trim() : "";
    const start = toSeconds(o.start);
    const end = toSeconds(o.end);
    if (!text || start == null || end == null) continue;
    const s = Math.max(0, Math.min(length, start));
    const e = Math.max(0, Math.min(length, end));
    if (e - s < 0.05) continue;
    const words = cleanWords(o.words, s, e, text);
    out.push(words ? { start: s, end: e, text, words } : { start: s, end: e, text });
  }
  out.sort((a, b) => a.start - b.start);
  for (let i = 1; i < out.length; i++) if (out[i].start < out[i - 1].end) out[i - 1].end = Math.max(out[i - 1].start + 0.05, out[i].start);
  return out.filter((s) => s.end - s.start >= 0.05);
}

/**
 * Word timings from the transcriber, kept only if there is exactly one per word of the text
 * (so the highlight can never point at the wrong word); clamped inside the phrase, in order.
 */
function cleanWords(raw: unknown, start: number, end: number, text: string): SegmentWord[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: SegmentWord[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const w = typeof o.w === "string" ? o.w : typeof o.text === "string" ? o.text : "";
    const t = toSeconds(o.s ?? o.start);
    if (!w.trim() || t == null) continue;
    out.push({ start: Math.max(start, Math.min(end, t)), text: w.trim() });
  }
  if (out.length === 0 || out.length !== captionWords(text).length) return undefined;
  for (let i = 1; i < out.length; i++) if (out[i].start < out[i - 1].start) out[i].start = out[i - 1].start;
  return out;
}

/** 12.5, "12.5", "00:12.5", "0:00:12,500" → seconds. */
export function toSeconds(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const parts = v.trim().replace(",", ".").split(":");
  if (!parts.length || parts.some((p) => p === "" || Number.isNaN(Number(p)))) return null;
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

/** Words → lines of at most MAX_LINE characters. */
export function wrapLines(text: string, max = MAX_LINE): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= max) cur += ` ${w}`;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * A phrase as captions of at most two lines each. With word timings each caption starts when
 * its first word is said; without, the time is shared by length.
 */
export function splitPhrase(s: Segment): Segment[] {
  const lines = wrapLines(s.text);
  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i += MAX_LINES) chunks.push(lines.slice(i, i + MAX_LINES).join("\n"));
  if (chunks.length <= 1) return [{ ...s, text: chunks[0] ?? s.text }];
  if (s.words) {
    // words go to the chunk they are shown in
    let w = 0;
    const parts = chunks.map((c) => {
      const n = captionWords(c).length;
      const words = s.words!.slice(w, w + n);
      w += n;
      return { text: c, words };
    });
    return parts.map((p, i) => ({
      start: i === 0 ? s.start : (p.words[0]?.start ?? s.start),
      end: i === parts.length - 1 ? s.end : (parts[i + 1].words[0]?.start ?? s.end),
      text: p.text,
      words: p.words,
    }));
  }
  const total = chunks.reduce((a, c) => a + c.length, 0);
  let t = s.start;
  return chunks.map((c, i) => {
    const end = i === chunks.length - 1 ? s.end : t + ((s.end - s.start) * c.length) / total;
    const out = { start: t, end, text: c };
    t = end;
    return out;
  });
}

/**
 * The captions of one clip. `segments` are in seconds from the clip's `in`
 * (the sound that was sent); `clipStart` is where the clip starts on the
 * timeline. Speed is followed; a reversed clip gets none (its speech runs backwards).
 */
export function segmentsToCaptions(segments: Segment[], clip: Pick<VideoClip | AudioClip, "type" | "in" | "out"> & { speed?: number; reversed?: boolean }, clipStart: number): Caption[] {
  if (isReversed(clip)) return [];
  const sp = speedOf(clip);
  const span = clip.out - clip.in;
  const out: Caption[] = [];
  for (const seg of segments) {
    for (const p of splitPhrase(seg)) {
      const s = Math.max(0, Math.min(span, p.start));
      const e = Math.max(0, Math.min(span, p.end));
      if (e <= s) continue;
      const cap: Caption = { start: clipStart + s / sp, duration: Math.min(MAX_CAPTION, (e - s) / sp), text: p.text };
      // each word's moment, from the caption's start (timeline seconds: the clip's speed applies)
      if (p.words && p.words.length === captionWords(p.text).length)
        cap.wordTimes = p.words.map((w) => Math.round((Math.max(0, Math.min(span, w.start) - s) / sp) * 1000) / 1000);
      out.push(cap);
    }
  }
  return fitCaptions(out);
}

/** At least MIN_CAPTION long where there is room before the next one; never overlapping. */
export function fitCaptions(list: Caption[]): Caption[] {
  const c = [...list].sort((a, b) => a.start - b.start).map((x) => ({ ...x }));
  for (let i = 0; i < c.length; i++) {
    const next = c[i + 1]?.start ?? Infinity;
    if (c[i].duration < MIN_CAPTION) c[i].duration = Math.min(MIN_CAPTION, Math.max(c[i].duration, next - c[i].start));
    if (c[i].start + c[i].duration > next) c[i].duration = Math.max(0.1, next - c[i].start);
    c[i].duration = Math.round(c[i].duration * 1000) / 1000;
    c[i].start = Math.round(c[i].start * 1000) / 1000;
  }
  return c.filter((x) => x.duration >= 0.1);
}

/** The spoken languages the Subtitles panel offers ("auto" lets Gemini find it). */
export const SUB_LANGUAGES = [
  { id: "auto", label: "Find it for me" },
  { id: "en", label: "English" },
  { id: "hi", label: "Hindi (हिन्दी)" },
  { id: "hi-Latn", label: "Hinglish (Hindi in English letters)" },
  { id: "bn", label: "Bengali" },
  { id: "ta", label: "Tamil" },
  { id: "te", label: "Telugu" },
  { id: "mr", label: "Marathi" },
  { id: "gu", label: "Gujarati" },
  { id: "kn", label: "Kannada" },
  { id: "ml", label: "Malayalam" },
  { id: "pa", label: "Punjabi" },
  { id: "ur", label: "Urdu" },
  { id: "ar", label: "Arabic" },
  { id: "es", label: "Spanish" },
  { id: "fr", label: "French" },
  { id: "de", label: "German" },
  { id: "pt", label: "Portuguese" },
  { id: "ru", label: "Russian" },
  { id: "id", label: "Indonesian" },
  { id: "ja", label: "Japanese" },
  { id: "zh", label: "Chinese" },
] as const;
export type SubLanguage = (typeof SUB_LANGUAGES)[number]["id"];
export const isSubLanguage = (v: unknown): v is SubLanguage => SUB_LANGUAGES.some((l) => l.id === v);
export const languageLabel = (id: string) => SUB_LANGUAGES.find((l) => l.id === id)?.label.replace(/ \(.*\)$/, "") ?? id;
