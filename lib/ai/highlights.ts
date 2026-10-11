import "server-only";
import { createHash } from "node:crypto";
import { readJson, storagePath, writeJson } from "../storage";
import { type Segment, type SubLanguage } from "../subtitles/segments";
import { getVideo } from "../videos";
import { fakeHighlights, fakeSegments } from "./fake";
import { GeminiError, interactJson, isFake, pickModel } from "./gemini";
import { makeSubtitles } from "./subtitles";

export type HighlightCategory = "hook" | "insight" | "story" | "climax" | "reaction" | "qa";
export type HighlightGoal = "viral-shorts" | "recap" | "key-moments" | "custom";
export type HighlightAspect = "original" | "vertical" | "square";

export type HighlightItem = {
  id: string;
  title: string;
  start: number;
  end: number;
  duration: number;
  viralityScore: number;
  category: HighlightCategory;
  summary: string;
  quote: string;
  energyLevel: "high" | "medium" | "moderate";
};

export type HighlightsResult = {
  highlights: HighlightItem[];
  segments: Segment[];
  duration: number;
  cached: boolean;
};

const HIGHLIGHTS_SCHEMA = {
  type: "object",
  properties: {
    highlights: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short, punchy, engaging title (3 to 8 words)" },
          start: { type: "number", description: "Start time in seconds from video start" },
          end: { type: "number", description: "End time in seconds from video start" },
          viralityScore: { type: "number", description: "Viral hook potential score from 1 to 100" },
          category: {
            type: "string",
            enum: ["hook", "insight", "story", "climax", "reaction", "qa"],
            description: "Highlight category",
          },
          summary: { type: "string", description: "1-2 sentence explanation of why this moment is compelling" },
          quote: { type: "string", description: "The opening speech quote or punchline" },
          energyLevel: { type: "string", enum: ["high", "medium", "moderate"] },
        },
        required: ["title", "start", "end", "viralityScore", "category", "summary", "quote"],
      },
    },
  },
  required: ["highlights"],
};

function buildPrompt(goal: HighlightGoal, targetCount: number, duration: number, segments: Segment[]): string {
  const goalDesc =
    goal === "viral-shorts"
      ? "Extract the top viral shorts / reels moments (each roughly 15 to 60 seconds long). Prioritize strong first-second hooks, surprising statements, emotional intensity, or humorous moments that work standalone on TikTok, YouTube Shorts, or Instagram Reels."
      : goal === "recap"
        ? "Extract the key moments that form a coherent summary recap of the entire video (each roughly 20 to 90 seconds). Ensure chronological progression covering the beginning premise, core insights, and conclusion."
        : "Extract the most insightful, memorable, and high-value moments from the video.";

  const formattedTranscript = segments
    .slice(0, 400)
    .map((s) => `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s] ${s.text}`)
    .join("\n");

  return [
    `You are an expert video editor, content producer, and viral social media strategist.`,
    `Analyze this video transcript (total video duration: ${duration.toFixed(1)}s).`,
    goalDesc,
    `Extract approximately ${targetCount} top highlight moments.`,
    `RULES:`,
    `1. 'start' and 'end' must be in seconds and MUST match natural sentence boundaries from the transcript. Do NOT cut in the middle of a spoken sentence.`,
    `2. 'start' must be strictly less than 'end', and 'end' must not exceed ${duration.toFixed(1)}s.`,
    `3. 'viralityScore' must be between 60 and 99 reflecting how engaging and shareable the moment is.`,
    `4. 'title' should be catchy and click-worthy without clickbait falsehood.`,
    `5. 'quote' must be the exact words spoken at the beginning of the clip.`,
    `Transcript:\n${formattedTranscript}`,
    `Return JSON only matching the schema.`,
  ].join("\n\n");
}

export type ExtractHighlightsOptions = {
  inSec?: number;
  outSec?: number;
  goal?: HighlightGoal;
  targetCount?: number;
  language?: SubLanguage;
};

/** Extracts top highlights and speech transcript from a video clip. */
export async function extractHighlights(
  mediaId: string,
  options: ExtractHighlightsOptions = {},
): Promise<HighlightsResult> {
  const v = await getVideo(mediaId);
  if (!v) throw new GeminiError("This file is no longer here.", 404, "not_found");
  if (!v.info.hasAudio) throw new GeminiError("This clip has no sound, so highlights cannot be extracted from speech.", 400, "no_sound");

  const start = Math.max(0, options.inSec ?? 0);
  const videoDuration = v.info.duration || 60;
  const len = Math.min(options.outSec ?? videoDuration, videoDuration) - start;
  if (!(len > 1.0)) throw new GeminiError("This clip is too short for highlight extraction.", 400, "too_short");

  const goal = options.goal ?? "viral-shorts";
  const targetCount = Math.max(2, Math.min(10, options.targetCount ?? (goal === "recap" ? 4 : 5)));
  const language = options.language ?? "auto";

  const hash = createHash("sha1")
    .update(JSON.stringify([mediaId, start.toFixed(2), len.toFixed(2), goal, targetCount, language, isFake()]))
    .digest("hex")
    .slice(0, 16);

  const cacheFile = storagePath("videos", mediaId, `highlights-${hash}.json`);
  const hit = await readJson<{ highlights: HighlightItem[]; segments: Segment[]; duration: number }>(cacheFile);
  if (hit) return { ...hit, cached: true };

  // If in fake / offline mode
  if (isFake()) {
    const fakeItems = fakeHighlights(len).map((h, i) => ({
      ...h,
      id: `hl-${i + 1}-${Date.now().toString(36)}`,
      start: Math.round((start + h.start) * 10) / 10,
      end: Math.round((start + h.end) * 10) / 10,
    }));
    const fakeSegs = fakeSegments(len).map((s) => ({
      ...s,
      start: Math.round((start + s.start) * 10) / 10,
      end: Math.round((start + s.end) * 10) / 10,
    }));
    const res: HighlightsResult = {
      highlights: fakeItems,
      segments: fakeSegs,
      duration: len,
      cached: false,
    };
    await writeJson(cacheFile, res);
    return res;
  }

  // 1. Get speech transcript
  const subResult = await makeSubtitles(mediaId, start, start + len, language);
  const segments = subResult.segments;

  if (!segments.length) {
    const emptyResult: HighlightsResult = {
      highlights: [],
      segments: [],
      duration: len,
      cached: false,
    };
    await writeJson(cacheFile, emptyResult);
    return emptyResult;
  }

  // 2. Prompt Gemini for semantic scoring & highlight bounds
  const model = await pickModel("text");
  const promptText = buildPrompt(goal, targetCount, len, segments);

  let rawHighlights: HighlightItem[] = [];
  try {
    const res = await interactJson<{ highlights: Array<Omit<HighlightItem, "id" | "duration">> }>(
      model,
      [{ type: "text", text: promptText }],
      HIGHLIGHTS_SCHEMA,
      5 * 60_000,
    );

    if (Array.isArray(res.highlights)) {
      rawHighlights = res.highlights
        .map((h, index): HighlightItem | null => {
          const rawStart = Number(h.start);
          const rawEnd = Number(h.end);
          if (isNaN(rawStart) || isNaN(rawEnd) || rawEnd <= rawStart) return null;

          const clipStart = Math.max(start, Math.min(start + len, start + rawStart));
          const clipEnd = Math.max(clipStart + 1, Math.min(start + len, start + rawEnd));
          const duration = Math.round((clipEnd - clipStart) * 10) / 10;

          return {
            id: `hl-${index + 1}-${Math.random().toString(36).slice(2, 7)}`,
            title: String(h.title || `Highlight ${index + 1}`).slice(0, 100),
            start: Math.round(clipStart * 10) / 10,
            end: Math.round(clipEnd * 10) / 10,
            duration,
            viralityScore: Math.max(1, Math.min(100, Math.round(Number(h.viralityScore) || 80))),
            category: (["hook", "insight", "story", "climax", "reaction", "qa"].includes(h.category)
              ? h.category
              : "insight") as HighlightCategory,
            summary: String(h.summary || "").slice(0, 300),
            quote: String(h.quote || "").slice(0, 200),
            energyLevel: (["high", "medium", "moderate"].includes(h.energyLevel ?? "")
              ? h.energyLevel
              : "high") as HighlightItem["energyLevel"],
          };
        })
        .filter((h): h is HighlightItem => h !== null);
    }
  } catch (err) {
    // If structured extraction fails, fallback to heuristic chunking from transcript
    rawHighlights = segments.slice(0, targetCount).map((s, i) => ({
      id: `hl-${i + 1}`,
      title: `Moment ${i + 1}: ${s.text.slice(0, 30)}...`,
      start: s.start,
      end: s.end,
      duration: Math.round((s.end - s.start) * 10) / 10,
      viralityScore: 80,
      category: "insight",
      summary: s.text,
      quote: s.text,
      energyLevel: "medium",
    }));
  }

  // Sort by virality score descending
  rawHighlights.sort((a, b) => b.viralityScore - a.viralityScore);

  const finalResult: HighlightsResult = {
    highlights: rawHighlights,
    segments,
    duration: len,
    cached: false,
  };

  await writeJson(cacheFile, finalResult);
  return finalResult;
}
