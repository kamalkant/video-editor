import { aiError, jsonBody } from "@/lib/ai/http";
import { meteredAi } from "@/lib/ai/meter";
import { geminiSpeak } from "@/lib/ai/voice";
import { GEMINI_VOICES } from "@/lib/ai/voices";
import { apiError } from "@/lib/http/errors";

export const runtime = "nodejs";
export const maxDuration = 180;

/** POST /api/ai/audio - Generate voice/narration/audio from text prompt. Body: { prompt, voice?, style? } */
async function handle(request: Request): Promise<Response> {
  const b = await jsonBody(request);
  if (!b || typeof b.prompt !== "string" || !b.prompt.trim()) {
    return apiError(400, "empty", "Describe the audio or speech first.");
  }
  const voice = typeof b.voice === "string" && GEMINI_VOICES.some((v) => v.name === b.voice) ? b.voice : "Puck";
  const style = typeof b.style === "string" ? b.style : "";
  try {
    const meta = await geminiSpeak(b.prompt, voice, style);
    return Response.json(meta, { status: 201 });
  } catch (err) {
    return aiError(err, "Couldn't generate the audio.");
  }
}

/** Signed-in users only; costs AI credits unless the user has their own key (lib/ai/meter). */
export async function POST(request: Request) {
  return meteredAi("voice", "gemini", () => handle(request));
}
