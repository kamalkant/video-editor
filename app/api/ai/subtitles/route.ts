import { aiError, jsonBody } from "@/lib/ai/http";
import { FREE_HEADER, meteredAi } from "@/lib/ai/meter";
import { makeSubtitles } from "@/lib/ai/subtitles";
import { apiError } from "@/lib/http/errors";
import { isId } from "@/lib/storage";
import { isSubLanguage } from "@/lib/subtitles/segments";

export const runtime = "nodejs";
export const maxDuration = 600;

/** ✦ Gemini: subtitles for part of an upload's sound. Body: { mediaId, in, out, language }. Sends only that sound. */
async function handle(request: Request): Promise<Response> {
  const b = await jsonBody(request);
  if (!b || !isId(b.mediaId)) return apiError(400, "bad_request", "Send the clip.");
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const inSec = num(b.in) ?? 0;
  const outSec = num(b.out);
  if (outSec == null || outSec <= inSec) return apiError(400, "bad_request", "Send the part of the clip.");
  const language = isSubLanguage(b.language) ? b.language : "auto";
  try {
    const result = await makeSubtitles(b.mediaId, inSec, outSec, language, !!b.offline);
    // made earlier (cached) or offline: Gemini wasn't used, so no credits
    return Response.json(result, result.cached || b.offline ? { headers: { [FREE_HEADER]: "1" } } : undefined);
  } catch (err) {
    return aiError(err, "Couldn't make the subtitles.");
  }
}

/** Signed-in users only; 1 AI credit per started minute of sound, unless the user has their own key (lib/ai/meter). */
export async function POST(request: Request) {
  const b = (await request.clone().json().catch(() => null)) as { in?: unknown; out?: unknown } | null;
  const minutes = b && typeof b.in === "number" && typeof b.out === "number" && b.out > b.in ? (b.out - b.in) / 60 : 1;
  return meteredAi("subtitles", "gemini", () => handle(request), minutes);
}
