import "server-only";
import { YT_MIN_CHAPTER_SECONDS, type Chapter } from "../edit/chapters";
import { GeminiError, interactJson, isFake, pickModel } from "./gemini";

/** A transcript line on the timeline (the subtitles). */
export type TranscriptLine = { start: number; text: string };

const SCHEMA = {
  type: "object",
  properties: {
    chapters: {
      type: "array",
      items: {
        type: "object",
        properties: { start: { type: "number", description: "seconds from the start of the video" }, title: { type: "string" } },
        required: ["start", "title"],
      },
    },
  },
  required: ["chapters"],
};

/** Chapters in order, first at 0, each at least 10 s, at most 30, short titles (what Gemini sends can be loose). */
export function cleanChapters(raw: unknown, duration: number): Chapter[] {
  const list = (Array.isArray(raw) ? raw : [])
    .map((r) => (r && typeof r === "object" ? (r as Record<string, unknown>) : {}))
    .map((r) => ({ t: Number(r.start), title: typeof r.title === "string" ? r.title.replace(/\s+/g, " ").trim().slice(0, 80) : "" }))
    .filter((c) => Number.isFinite(c.t) && c.t >= 0 && c.t < duration && c.title)
    .sort((a, b) => a.t - b.t);
  const out: Chapter[] = [];
  for (const c of list) {
    const prev = out[out.length - 1];
    if (prev && c.t - prev.t < YT_MIN_CHAPTER_SECONDS) continue;
    out.push(c);
  }
  if (out.length) out[0] = { ...out[0], t: 0 };
  // the last chapter needs room too
  while (out.length > 1 && duration - out[out.length - 1].t < YT_MIN_CHAPTER_SECONDS) out.pop();
  return out.slice(0, 30);
}

/** ✦ Gemini: YouTube chapters from what is said (only the subtitle text and its times are sent). */
export async function makeChapters(lines: TranscriptLine[], duration: number): Promise<Chapter[]> {
  if (!lines.length) throw new GeminiError("Make subtitles first: chapters are found from what is said.", 400, "no_transcript");
  if (isFake()) {
    const n = Math.max(3, Math.min(6, Math.floor(duration / 30)));
    return cleanChapters(
      Array.from({ length: n }, (_, i) => ({ start: (duration * i) / n, title: i === 0 ? "Intro" : `Part ${i + 1}` })),
      duration,
    );
  }
  const transcript = lines.map((l) => `[${l.start.toFixed(1)}] ${l.text.replace(/\s+/g, " ")}`).join("\n");
  const model = await pickModel("text");
  const j = await interactJson<{ chapters?: unknown }>(
    model,
    [
      {
        type: "text",
        text: [
          `Split this ${Math.round(duration)}-second video into YouTube chapters, from its transcript below.`,
          `Between 3 and 12 chapters, each at least ${YT_MIN_CHAPTER_SECONDS} seconds long; the first starts at 0.`,
          "Each chapter starts where a new topic starts (use the times in brackets). Titles: 2 to 6 words, in the language of the transcript, no numbering, no emojis.",
          'Answer with JSON only: {"chapters": [{"start": 0, "title": "..."}]}',
          "",
          transcript,
        ].join("\n"),
      },
    ],
    SCHEMA,
    3 * 60_000,
  );
  return cleanChapters(j.chapters, duration);
}
