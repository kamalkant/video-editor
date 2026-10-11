import { aiError, jsonBody } from "@/lib/ai/http";
import { meteredAi } from "@/lib/ai/meter";
import { extractHighlights, type HighlightGoal } from "@/lib/ai/highlights";
import { apiError } from "@/lib/http/errors";
import { isId } from "@/lib/storage";
import { isSubLanguage } from "@/lib/subtitles/segments";

export const runtime = "nodejs";
export const maxDuration = 600;

/** ✦ Gemini: highlight extraction and transcript analysis for a video clip. */
async function handle(request: Request): Promise<Response> {
  const b = await jsonBody(request);
  if (!b || !isId(b.mediaId)) return apiError(400, "bad_request", "Send the video clip.");

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const inSec = num(b.in);
  const outSec = num(b.out);

  const validGoals: HighlightGoal[] = ["viral-shorts", "recap", "key-moments", "custom"];
  const goal: HighlightGoal = validGoals.includes(b.goal as HighlightGoal) ? (b.goal as HighlightGoal) : "viral-shorts";
  const targetCount = typeof b.targetCount === "number" ? Math.max(1, Math.min(12, b.targetCount)) : undefined;
  const language = isSubLanguage(b.language) ? b.language : "auto";

  try {
    const result = await extractHighlights(b.mediaId, {
      inSec,
      outSec,
      goal,
      targetCount,
      language,
    });
    return Response.json(result);
  } catch (err) {
    return aiError(err, "Couldn't extract highlights from this video.");
  }
}

/** Signed-in users only; costs AI credits unless the user has their own key (lib/ai/meter). */
export async function POST(request: Request) {
  return meteredAi("highlights", "gemini", () => handle(request));
}
