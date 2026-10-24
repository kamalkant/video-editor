import { clipLength, isReversed, mainDuration, mainStarts, mainTrack, speedOf, type TimelineDoc } from "./doc";
import { removeRangesInClip } from "./docEdit";
import type { Range } from "./timeline";
import { remapMarks } from "../text/marks";

/** A word in a caption clip: its index among the caption's words (lines included). */
export type CaptionWordRef = { clipId: string; index: number };

/**
 * Take words out of caption texts (the words cut by transcript editing, so the subtitles
 * no longer show them). Line breaks stay; a caption left without words goes; matching
 * word timings drop the same entries.
 */
export function removeCaptionWords(doc: TimelineDoc, words: CaptionWordRef[]): TimelineDoc {
  if (!words.length) return doc;
  const byClip = new Map<string, Set<number>>();
  for (const w of words) {
    if (!byClip.has(w.clipId)) byClip.set(w.clipId, new Set());
    byClip.get(w.clipId)!.add(w.index);
  }
  return {
    ...doc,
    tracks: doc.tracks.map((t) => {
      if (t.kind !== "overlay" || t.locked) return t;
      let changed = false;
      const clips = t.clips.flatMap((c) => {
        const drop = c.type === "text" ? byClip.get(c.id) : undefined;
        if (!drop || c.type !== "text") return [c];
        changed = true;
        let i = 0;
        const lines = c.text
          .split("\n")
          .map((line) =>
            line
              .split(" ")
              .filter((w) => !w || !drop.has(i++))
              .join(" ")
              .replace(/ {2,}/g, " ")
              .trim(),
          )
          .filter((line) => line.length > 0);
        if (!lines.length) return [];
        const count = c.text.split(/\s+/).filter(Boolean).length;
        const times = c.wordTimes && c.wordTimes.length === count ? c.wordTimes.filter((_, k) => !drop.has(k)) : undefined;
        const { wordTimes: _w, marks: _m, ...rest } = c;
        void _w;
        void _m;
        const text = lines.join("\n");
        // (styled letters stay on the words that are left)
        const marks = remapMarks(c.text, text, c.marks);
        return [{ ...rest, text, ...(times ? { wordTimes: times } : {}), ...(marks ? { marks } : {}) }];
      });
      return changed ? ({ ...t, clips } as typeof t) : t;
    }),
  };
}

/** Shorter than this (seconds) is nothing to cut. */
const MIN_CUT = 0.02;
const EPS = 1e-6;

/** Sorted, merged ranges (touching or overlapping ones become one). */
export function mergeRanges(ranges: Range[]): Range[] {
  const sorted = ranges
    .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start)
    .map((r) => ({ start: Math.max(0, r.start), end: r.end }))
    .sort((a, b) => a.start - b.start);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end + 0.01) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/**
 * Cut timeline ranges out of the video, e.g. words picked in the transcript or filler words.
 * Each range is cut from every main-track clip under it, in that clip's own source seconds
 * (its trim and speed applied), and the other tracks ripple with it: subtitles and graphics
 * after a cut move back, ones inside it go, ones across it get shorter. Reversed clips and
 * locked tracks are left alone.
 */
export function cutTimelineRanges(doc: TimelineDoc, ranges: Range[]): TimelineDoc {
  let d = doc;
  // from the last cut to the first: the earlier timeline positions stay valid
  for (const cut of mergeRanges(ranges).reverse()) d = cutOne(d, cut);
  return d;
}

function cutOne(doc: TimelineDoc, cut: Range): TimelineDoc {
  const main = mainTrack(doc);
  if (main.locked) return doc;
  const starts = mainStarts(main.clips);
  let d = doc;
  // main clips from last to first, so the clips before keep their places
  for (let i = main.clips.length - 1; i >= 0; i--) {
    const c = main.clips[i];
    if (c.type !== "video" || isReversed(c)) continue;
    const s0 = starts[i];
    const a = Math.max(cut.start, s0);
    const b = Math.min(cut.end, s0 + clipLength(c));
    if (b - a < MIN_CUT) continue;
    const sp = speedOf(c);
    const before = mainDuration(d);
    const next = removeRangesInClip(d, c.id, [{ start: c.in + (a - s0) * sp, end: c.in + (b - s0) * sp }]);
    if (next === d) continue;
    // what really went (a leftover too short to keep goes with it)
    const removed = before - mainDuration(next);
    d = removed > EPS ? rippleOthers(next, a, a + removed) : next;
  }
  return d;
}

/** The other tracks follow a cut of [a, b) on the main track. */
function rippleOthers(doc: TimelineDoc, a: number, b: number): TimelineDoc {
  const len = b - a;
  return {
    ...doc,
    tracks: doc.tracks.map((t) => {
      if (t.kind === "main" || t.locked) return t;
      const clips = (t.clips as Array<Record<string, any>>).flatMap((c) => {
        const s = c.start as number;
        const e = s + clipLength(c as never);
        if (e <= a + EPS) return [c];
        if (s >= b - EPS) return [{ ...c, start: Math.max(0, s - len) }];
        if (s >= a - EPS && e <= b + EPS) return [];
        const media = c.type === "video" || c.type === "audio";
        const sp = media ? speedOf(c as never) : 1;
        if (s < a && e > b) {
          // across the cut: it gets shorter by the cut (music keeps playing, just ends earlier)
          return [media ? { ...c, out: c.out - len * sp } : withoutWordTimes({ ...c, duration: Math.max(0.1, c.duration - len) })];
        }
        if (s < a) {
          // runs into the cut: it now ends where the cut starts
          return [media ? { ...c, out: c.in + (a - s) * sp } : withoutWordTimes({ ...c, duration: Math.max(0.1, a - s) })];
        }
        // starts inside the cut: it now starts where the cut was, missing the part that went
        return [media ? { ...c, start: a, in: c.in + (b - s) * sp } : withoutWordTimes({ ...c, start: a, duration: Math.max(0.1, e - b) })];
      });
      return { ...t, clips } as typeof t;
    }),
  };
}

/** A shortened caption's word timings no longer fit: it falls back to even spacing. */
function withoutWordTimes<T extends Record<string, unknown>>(c: T): T {
  if (!("wordTimes" in c)) return c;
  const { wordTimes: _w, ...rest } = c;
  void _w;
  return rest as T;
}
