import { GEMINI_VOICES, VOICE_STYLES } from "@/lib/ai/voices";
import { apiError } from "@/lib/http/errors";
import { listVoices, TtsError } from "@/lib/tts";

export const runtime = "nodejs";

/** The Mac's text-to-speech voices (?engine=gemini: Gemini's voices and style ideas). */
export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("engine") === "gemini") return Response.json({ voices: GEMINI_VOICES, styles: VOICE_STYLES });
  try {
    return Response.json({ voices: await listVoices() });
  } catch (err) {
    return apiError(503, "tts_unavailable", err instanceof TtsError ? err.message : "Text to speech isn't available on this computer.");
  }
}
