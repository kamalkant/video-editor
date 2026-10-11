import { detectSilences } from "@/lib/ffmpeg/silence";
import { AbortedError } from "@/lib/ffmpeg/run";
import { apiError } from "@/lib/http/errors";
import { getVideo, sourcePath } from "@/lib/videos";

export const runtime = "nodejs";

/** The quiet parts of the clip's sound: { noise: dB, minSilence: s } → { silences: [{ start, end }] } (source seconds). */
export async function POST(request: Request, ctx: RouteContext<"/api/videos/[id]/silences">) {
  const { id } = await ctx.params;
  const video = await getVideo(id);
  if (!video) return apiError(404, "not_found", "This video is no longer here.");
  if (!video.info.hasAudio) return Response.json({ silences: [], hasAudio: false });
  let body: { noise?: unknown; minSilence?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "bad_request", "Send JSON.");
  }
  const noise = typeof body.noise === "number" && Number.isFinite(body.noise) ? Math.round(Math.min(-10, Math.max(-70, body.noise))) : -35;
  const minSilence = typeof body.minSilence === "number" && Number.isFinite(body.minSilence) ? Math.round(Math.min(5, Math.max(0.2, body.minSilence)) * 10) / 10 : 0.6;
  try {
    const silences = await detectSilences(id, sourcePath(id), video.info.duration, { noise, minSilence }, request.signal);
    return Response.json({ silences, hasAudio: true });
  } catch (err) {
    if (err instanceof AbortedError) return apiError(499, "canceled", "Canceled.");
    return apiError(500, "silence_failed", "Couldn't check the sound for pauses.");
  }
}
