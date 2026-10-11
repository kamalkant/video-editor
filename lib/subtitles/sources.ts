import { clipLength, findClip, mainStarts, mainTrack, type AudioClip, type TextClip, type TimelineDoc, type VideoClip } from "../edit/doc";
import type { Caption } from "./segments";

/** A clip whose speech gets subtitles: which part of which file, and where it sits on the timeline. */
export type SubSource = { clipId: string; mediaId: string; in: number; out: number; start: number; type: "video" | "audio"; speed?: number; reversed?: boolean };

/**
 * What to subtitle. "main": every Video 1 clip with sound (the presenter);
 * "selected": just the selected video or sound clip. Muted and reversed clips are left out.
 */
export function subtitleSources(doc: TimelineDoc, hasAudio: (mediaId: string) => boolean, scope: "main" | "selected", selectedId: string | null): SubSource[] {
  const ok = (c: VideoClip | AudioClip) => hasAudio(c.mediaId) && !(c.type === "video" && (c.muted || c.reversed)) && c.volume > 0;
  const of = (c: VideoClip | AudioClip, start: number): SubSource => ({ clipId: c.id, mediaId: c.mediaId, in: c.in, out: c.out, start, type: c.type, speed: c.type === "video" ? c.speed : undefined, reversed: c.type === "video" ? c.reversed : undefined });
  if (scope === "selected") {
    const f = selectedId ? findClip(doc, selectedId) : null;
    if (!f || (f.clip.type !== "video" && f.clip.type !== "audio")) return [];
    const c = f.clip as VideoClip | AudioClip;
    if (!ok(c)) return [];
    const start = f.track.kind === "main" ? mainStarts(mainTrack(doc).clips)[mainTrack(doc).clips.findIndex((x) => x.id === c.id)] : (c as unknown as { start: number }).start;
    return [of(c, start)];
  }
  const main = mainTrack(doc);
  const starts = mainStarts(main.clips);
  if (main.muted) return [];
  return main.clips.flatMap((c, i) => (c.type === "video" && ok(c as VideoClip) ? [of(c as VideoClip, starts[i])] : []));
}

/** Seconds of speech that would be sent (for the cost shown on the button). */
export const sourceSeconds = (s: SubSource[]) => s.reduce((a, x) => a + (x.out - x.in), 0);

/** Subtitle tracks: overlay tracks named "Subtitles…", with their captions in time order. */
export function subtitleTracks(doc: TimelineDoc): { id: string; name: string; hidden: boolean; captions: (Caption & { id: string })[] }[] {
  return doc.tracks.flatMap((t) =>
    t.kind === "overlay" && (t.name ?? "").startsWith("Subtitles")
      ? [
          {
            id: t.id,
            name: t.name!,
            hidden: t.hidden,
            captions: (t.clips.filter((c) => c.type === "text") as (TextClip & { start: number })[]).map((c) => ({ id: c.id, start: c.start, duration: clipLength(c), text: c.text, ...(c.wordTimes ? { wordTimes: c.wordTimes } : {}) })).sort((a, b) => a.start - b.start),
          },
        ]
      : [],
  );
}
