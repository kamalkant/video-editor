import "server-only";
import { createHash } from "node:crypto";
import { runFfmpeg, SAFE_INPUT } from "../ffmpeg/run";
import { readJson, storagePath, writeJson } from "../storage";
import { cleanSegments, languageLabel, type Segment, type SubLanguage } from "../subtitles/segments";
import { getVideo, sourcePath } from "../videos";
import { fakeSegments, fakeTranslate } from "./fake";
import { GeminiError, interactJson, isFake, pickModel } from "./gemini";

/** The longest sound sent at once (a small MP3 stays under Gemini's 20 MB inline limit). */
export const MAX_SUB_SECONDS = 75 * 60;

export type SubtitleResult = { language: string; segments: Segment[]; cached: boolean };

const SEGMENTS_SCHEMA = {
  type: "object",
  properties: {
    language: { type: "string", description: "BCP-47 code of the spoken language, e.g. en, hi" },
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          start: { type: "number", description: "seconds from the start of the audio" },
          end: { type: "number" },
          text: { type: "string" },
          words: {
            type: "array",
            description: "every word of text, in order, with the second it starts",
            items: { type: "object", properties: { w: { type: "string" }, s: { type: "number" } }, required: ["w", "s"] },
          },
        },
        required: ["start", "end", "text"],
      },
    },
  },
  required: ["segments"],
};

function prompt(language: SubLanguage): string {
  const lang =
    language === "auto"
      ? "Keep the language that is spoken."
      : language === "hi-Latn"
        ? "The speech is Hindi: write it in English (Latin) letters, as Hinglish."
        : `The speech is in ${languageLabel(language)}${language === "hi" ? "; write it in Devanagari" : ""}.`;
  return [
    "Transcribe the speech in this audio as subtitles.",
    lang,
    "Split it into short phrases of at most about 12 words, at natural pauses.",
    "For each phrase give start and end in seconds from the start of the audio (numbers with decimals, e.g. 12.35), as exact as you can.",
    "Write exactly what is said, with normal punctuation. Leave out music and noises. If nobody speaks, return no segments.",
    "For every phrase also list each of its words in order, exactly as written in text, with the second it starts (s).",
    'Answer with JSON only: {"language": "<code>", "segments": [{"start": 0.0, "end": 0.0, "text": "...", "words": [{"w": "...", "s": 0.0}]}]}',
  ].join(" ");
}

/** Subtitles for [inSec, outSec] of an upload's sound (cached per range and language). */
export async function makeSubtitles(mediaId: string, inSec: number, outSec: number, language: SubLanguage, offline = false): Promise<SubtitleResult> {
  const v = await getVideo(mediaId);
  if (!v) throw new GeminiError("This file is no longer here.", 404, "not_found");
  if (!v.info.hasAudio) throw new GeminiError("This clip has no sound, so there is nothing to subtitle.", 400, "no_sound");
  const start = Math.max(0, inSec);
  const len = Math.min(outSec, v.info.duration || outSec) - start;
  if (!(len > 0.3)) throw new GeminiError("This clip is too short for subtitles.", 400, "too_short");
  if (len > MAX_SUB_SECONDS) throw new GeminiError(`Subtitles work on up to ${MAX_SUB_SECONDS / 60} minutes at a time. Split the clip first.`, 400, "too_long");

  const hash = createHash("sha1").update(JSON.stringify([start.toFixed(2), len.toFixed(2), language, offline, isFake()])).digest("hex").slice(0, 16);
  const file = storagePath("videos", mediaId, `subs-${hash}.json`);
  const hit = await readJson<{ language: string; segments: Segment[] }>(file);
  if (hit) return { ...hit, cached: true };

  let result: { language: string; segments: Segment[] };
  if (offline || isFake()) result = { language: language === "auto" ? "en" : language, segments: fakeSegments(len) };
  else {
    // only the sound of this range goes to Google, small (mono, 16 kHz, 32 kbps)
    const mp3 = (await runFfmpeg([...SAFE_INPUT, "-ss", start.toFixed(3), "-t", len.toFixed(3), "-i", sourcePath(mediaId), "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", "-f", "mp3", "pipe:1"], { collectStdout: true, timeoutMs: 5 * 60_000 })).stdout;
    const model = await pickModel("text");
    const j = await interactJson<{ language?: string; segments?: unknown }>(
      model,
      [
        { type: "text", text: prompt(language) },
        { type: "audio", mime_type: "audio/mp3", data: mp3.toString("base64") },
      ],
      SEGMENTS_SCHEMA,
      10 * 60_000,
    );
    result = { language: typeof j.language === "string" ? j.language.slice(0, 16) : language, segments: cleanSegments(j.segments, len) };
  }
  await writeJson(file, result);
  return { ...result, cached: false };
}

const TRANSLATE_SCHEMA = { type: "object", properties: { lines: { type: "array", items: { type: "string" } } }, required: ["lines"] };
const CHUNK = 120;

/** Subtitle lines in another language: exactly as many lines back, in the same order. */
export async function translateLines(lines: string[], to: SubLanguage): Promise<string[]> {
  if (to === "auto") throw new GeminiError("Pick the language to translate to.", 400, "bad_language");
  if (isFake()) return fakeTranslate(lines, to);
  const model = await pickModel("text");
  const target = to === "hi-Latn" ? "Hindi written in English (Latin) letters (Hinglish)" : languageLabel(to) + (to === "hi" ? " (Devanagari)" : "");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += CHUNK) {
    const part = lines.slice(i, i + CHUNK);
    let got: string[] | null = null;
    for (let attempt = 0; attempt < 2 && !got; attempt++) {
      const j = await interactJson<{ lines?: unknown }>(
        model,
        [{ type: "text", text: `Translate these ${part.length} video subtitle lines into ${target}. Keep each line short and natural for subtitles, keep line breaks inside a line, and keep names as they are. Return exactly ${part.length} lines in the same order. Answer with JSON only: {"lines": ["..."]}\n\n${JSON.stringify(part)}` }],
        TRANSLATE_SCHEMA,
      );
      const l = Array.isArray(j.lines) ? j.lines.map((x) => String(x ?? "").trim()) : null;
      if (l && l.length === part.length) got = l;
    }
    if (!got) throw new GeminiError("The translation came back with the wrong number of lines. Try again.");
    out.push(...got);
  }
  return out;
}
