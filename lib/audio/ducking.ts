import { mainStarts, mainTrack, type TimelineDoc, type VideoClip } from "../edit/doc";
import type { Range } from "../edit/timeline";

/**
 * "Quieter while someone speaks" (ducking): where someone speaks on Video 1,
 * in timeline seconds. The same numbers drive the export (a volume
 * expression) and the preview (the music's volume), so both sound alike.
 */

/** How speech is found: pauses quieter than NOISE dB and longer than MIN_SILENCE seconds are not speech. */
export const DUCK_DETECT = { noise: -35, minSilence: 0.4 } as const;
/** Music volume while someone speaks. */
export const DUCK_LEVEL = 0.3;

/** The Video 1 clips whose sound counts as speech. */
export function speakingClips(doc: TimelineDoc, hasAudio: (mediaId: string) => boolean): VideoClip[] {
  const main = mainTrack(doc);
  if (main.muted) return [];
  return main.clips.filter((c): c is VideoClip => c.type === "video" && !c.muted && hasAudio(c.mediaId));
}

/** Speech ranges on the timeline: each speaking clip minus its pauses (pauses in source seconds, per upload). */
export function speechRanges(doc: TimelineDoc, silences: Record<string, Range[] | undefined>, hasAudio: (mediaId: string) => boolean): Range[] {
  const main = mainTrack(doc);
  const starts = mainStarts(main.clips);
  const speaking = new Set(speakingClips(doc, hasAudio).map((c) => c.id));
  const out: Range[] = [];
  main.clips.forEach((clip, i) => {
    if (!speaking.has(clip.id)) return;
    const c = clip as VideoClip;
    const quiet = silences[c.mediaId] ?? [];
    let from = c.in;
    for (const q of [...quiet, { start: c.out, end: c.out }].sort((a, b) => a.start - b.start)) {
      const a = Math.max(from, c.in);
      const b = Math.min(q.start, c.out);
      if (b > a + 0.05) out.push({ start: starts[i] + (a - c.in), end: starts[i] + (b - c.in) });
      from = Math.max(from, q.end);
    }
  });
  return out;
}

/** Is timeline time t inside speech? */
export const inSpeech = (ranges: Range[], t: number) => ranges.some((r) => t >= r.start && t <= r.end);
