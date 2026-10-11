import { aiError } from "@/lib/ai/http";
import { meteredAi } from "@/lib/ai/meter";
import { getCurrentUser } from "@/lib/auth/session";
import { geminiSpeak } from "@/lib/ai/voice";
import { apiError } from "@/lib/http/errors";
import { speak, TtsError } from "@/lib/tts";

export const runtime = "nodejs";

/**
 * Read text out. Body: { text, voice, rate } (a Mac voice, free and offline) or
 * { engine: "gemini", text, voice, style } (✦ Gemini: sends the text to Google).
 * Returns the new sound upload (My Assets).
 */
async function handle(request: Request): Promise<Response> {
  let body: { text?: unknown; voice?: unknown; rate?: unknown; engine?: unknown; style?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "bad_request", "Send JSON.");
  }
  if (typeof body.text !== "string" || typeof body.voice !== "string") return apiError(400, "bad_request", "Send the text and a voice.");
  if (body.engine === "gemini") {
    try {
      return Response.json(await geminiSpeak(body.text, body.voice, typeof body.style === "string" ? body.style : ""), { status: 201 });
    } catch (err) {
      return aiError(err, "Couldn't make the voice.");
    }
  }
  try {
    const meta = await speak(body.text, body.voice, typeof body.rate === "number" ? body.rate : 180);
    return Response.json(meta, { status: 201 });
  } catch (err) {
    if (err instanceof TtsError) return apiError(400, "tts_failed", err.message);
    return apiError(500, "server_error", "Couldn't make the voice.");
  }
}

/** Signed-in users only. ✦ Gemini voices cost AI credits (unless the user has their own key); Mac voices are free. */
export async function POST(request: Request) {
  const b = (await request.clone().json().catch(() => null)) as { engine?: unknown } | null;
  if (b?.engine === "gemini") return meteredAi("voice", "gemini", () => handle(request));
  if (!(await getCurrentUser())) return apiError(401, "unauthorized", "Sign in to make voiceovers.");
  return handle(request);
}
