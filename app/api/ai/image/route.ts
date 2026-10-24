import { aiError, jsonBody } from "@/lib/ai/http";
import { meteredAi } from "@/lib/ai/meter";
import { generateImage, MAX_PROMPT } from "@/lib/ai/image";
import { IMAGE_QUALITY, type ImageQuality } from "@/lib/ai/pricing";
import { isImageAspect } from "@/lib/ai/shapes";
import { apiError } from "@/lib/http/errors";
import { mediaDenied } from "@/lib/auth/media";
import { isId } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 300;

/** ✦ Gemini: a picture or a background from words. Body: { prompt, purpose, aspect, quality, fromId? }. Returns the new upload. */
async function handle(request: Request): Promise<Response> {
  const b = await jsonBody(request);
  if (!b || typeof b.prompt !== "string" || !b.prompt.trim()) return apiError(400, "empty", "Describe the picture first.");
  if (b.prompt.length > MAX_PROMPT) return apiError(400, "too_long", `Use at most ${MAX_PROMPT} characters.`);
  const quality = (typeof b.quality === "string" && b.quality in IMAGE_QUALITY ? b.quality : "standard") as ImageQuality;
  // (a picture to change: only your own)
  if (isId(b.fromId)) {
    const denied = await mediaDenied(b.fromId);
    if (denied) return denied;
  }
  try {
    const meta = await generateImage({
      prompt: b.prompt,
      purpose: b.purpose === "background" ? "background" : "picture",
      aspect: isImageAspect(b.aspect) ? b.aspect : "16:9",
      quality,
      fromId: isId(b.fromId) ? b.fromId : null,
    });
    return Response.json(meta, { status: 201 });
  } catch (err) {
    return aiError(err, "Couldn't make the picture.");
  }
}

/** Signed-in users only; costs AI credits unless the user has their own key (lib/ai/meter). */
export async function POST(request: Request) {
  return meteredAi("image", "gemini", () => handle(request));
}
