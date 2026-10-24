import { aiError, jsonBody } from "@/lib/ai/http";
import { meteredAi } from "@/lib/ai/meter";
import { VEO_PRICE, type VeoResolution, type VeoSeconds, type VeoTier } from "@/lib/ai/pricing";
import { startVeo } from "@/lib/ai/veo";
import { apiError } from "@/lib/http/errors";
import { mediaDenied } from "@/lib/auth/media";
import { isId } from "@/lib/storage";

export const runtime = "nodejs";

/** ✦ Gemini Veo: start a video. Body: { prompt, aspect, seconds, tier, resolution, startImageId? }. Poll GET /api/ai/video/[id]. */
async function handle(request: Request): Promise<Response> {
  const b = await jsonBody(request);
  if (!b || typeof b.prompt !== "string" || !b.prompt.trim()) return apiError(400, "empty", "Describe the video first.");
  const tier = (typeof b.tier === "string" && b.tier in VEO_PRICE ? b.tier : null) as VeoTier | null;
  const resolution = (b.resolution === "1080p" ? "1080p" : b.resolution === "720p" ? "720p" : null) as VeoResolution | null;
  const seconds = ([4, 6, 8].includes(b.seconds as number) ? b.seconds : null) as VeoSeconds | null;
  if (!tier || !resolution || !seconds) return apiError(400, "bad_request", "Pick the quality, size and length.");
  // (a first frame: only your own picture)
  if (isId(b.startImageId)) {
    const denied = await mediaDenied(b.startImageId);
    if (denied) return denied;
  }
  try {
    const job = await startVeo({ prompt: b.prompt, aspect: b.aspect === "9:16" ? "9:16" : "16:9", seconds, tier, resolution, startImageId: isId(b.startImageId) ? b.startImageId : null });
    return Response.json(job, { status: 201 });
  } catch (err) {
    return aiError(err, "Couldn't start the video.");
  }
}

/** Signed-in users only; costs AI credits unless the user has their own key (lib/ai/meter). */
export async function POST(request: Request) {
  return meteredAi("video", "gemini", () => handle(request));
}
