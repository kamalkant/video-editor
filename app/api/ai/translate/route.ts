import { aiError, jsonBody } from "@/lib/ai/http";
import { meteredAi } from "@/lib/ai/meter";
import { translateLines } from "@/lib/ai/subtitles";
import { apiError } from "@/lib/http/errors";
import { isSubLanguage } from "@/lib/subtitles/segments";

export const runtime = "nodejs";
export const maxDuration = 300;

/** ✦ Gemini: subtitle lines in another language. Body: { lines: string[], to }. Sends only the words. */
async function handle(request: Request): Promise<Response> {
  const b = await jsonBody(request);
  const lines = Array.isArray(b?.lines) ? b.lines : null;
  if (!lines || !lines.length || lines.length > 2000 || lines.some((l) => typeof l !== "string" || l.length > 1000)) return apiError(400, "bad_request", "Send the subtitle lines.");
  if (!isSubLanguage(b?.to) || b.to === "auto") return apiError(400, "bad_language", "Pick the language to translate to.");
  try {
    return Response.json({ lines: await translateLines(lines as string[], b.to) });
  } catch (err) {
    return aiError(err, "Couldn't translate the subtitles.");
  }
}

/** Signed-in users only; costs AI credits unless the user has their own key (lib/ai/meter). */
export async function POST(request: Request) {
  return meteredAi("translate", "gemini", () => handle(request));
}
