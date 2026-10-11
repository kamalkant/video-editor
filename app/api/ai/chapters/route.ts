import { aiError, jsonBody } from "@/lib/ai/http";
import { meteredAi } from "@/lib/ai/meter";
import { makeChapters, type TranscriptLine } from "@/lib/ai/chapters";
import { getCurrentUser } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";

export const runtime = "nodejs";
export const maxDuration = 300;

/** ✦ Gemini: YouTube chapters. Body: { lines: [{ start, text }], duration }. Sends only the subtitle words and times. */
async function handle(request: Request): Promise<Response> {
  if (!(await getCurrentUser())) return apiError(401, "unauthorized", "Sign in to use AI features.");
  const b = await jsonBody(request);
  const duration = Number(b?.duration);
  const raw = Array.isArray(b?.lines) ? b.lines : null;
  if (!raw || raw.length > 5000 || !Number.isFinite(duration) || duration <= 0 || duration > 6 * 3600) {
    return apiError(400, "bad_request", "Send the subtitle lines and the video length.");
  }
  const lines: TranscriptLine[] = [];
  for (const l of raw) {
    const o = l && typeof l === "object" ? (l as Record<string, unknown>) : {};
    const start = Number(o.start);
    if (Number.isFinite(start) && typeof o.text === "string" && o.text.length <= 1000) lines.push({ start, text: o.text });
  }
  try {
    return Response.json({ chapters: await makeChapters(lines, duration) });
  } catch (err) {
    return aiError(err, "Couldn't make the chapters.");
  }
}

/** Signed-in users only; costs AI credits unless the user has their own key (lib/ai/meter). */
export async function POST(request: Request) {
  return meteredAi("chapters", "gemini", () => handle(request));
}
