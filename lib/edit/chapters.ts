import type { TimelineMarker } from "./doc";

/** One YouTube chapter: where it starts (timeline seconds) and its title. */
export type Chapter = { t: number; title: string };

/** YouTube's rules for chapters in a video description. */
export const YT_MIN_CHAPTERS = 3;
export const YT_MIN_CHAPTER_SECONDS = 10;

/** 0:00, 4:05, 1:02:03 (how YouTube writes chapter times). */
export function chapterTime(t: number): string {
  const s = Math.max(0, Math.floor(t + 1e-6));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** The project's markers as chapters, in order; YouTube needs the first one at 0:00, so an "Intro" is added if missing. */
export function chaptersFromMarkers(markers: TimelineMarker[] | undefined): Chapter[] {
  const list = [...(markers ?? [])]
    .sort((a, b) => a.t - b.t)
    .map((m, i) => ({ t: m.t, title: m.label.trim() || `Chapter ${i + 1}` }));
  if (!list.length) return [];
  if (list[0].t >= 1) list.unshift({ t: 0, title: "Intro" });
  else list[0] = { ...list[0], t: 0 };
  return list;
}

/**
 * Chapters as the lines to paste into a YouTube description ("0:00 Intro"), with what would
 * stop YouTube from showing them (too few, or one shorter than 10 seconds).
 */
export function youtubeChapters(chapters: Chapter[], duration: number): { text: string; problems: string[] } {
  const problems: string[] = [];
  if (chapters.length < YT_MIN_CHAPTERS) problems.push(`YouTube needs at least ${YT_MIN_CHAPTERS} chapters (add markers with M).`);
  chapters.forEach((c, i) => {
    const end = i < chapters.length - 1 ? chapters[i + 1].t : duration;
    if (end - c.t < YT_MIN_CHAPTER_SECONDS) problems.push(`“${c.title}” is shorter than ${YT_MIN_CHAPTER_SECONDS} seconds.`);
  });
  const text = chapters.map((c) => `${chapterTime(c.t)} ${c.title.replace(/\s+/g, " ").slice(0, 80)}`).join("\n");
  return { text, problems };
}
