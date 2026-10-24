import { limitsOf } from "@/lib/settings";
import { ZodError } from "zod";
import { maskForSpec } from "@/lib/ai/masks";
import { specFromBody } from "@/lib/edit/spec";
import { estimateSizes } from "@/lib/ffmpeg/estimate";
import { AbortedError } from "@/lib/ffmpeg/run";
import { apiError } from "@/lib/http/errors";
import { getVideo, sourcePath } from "@/lib/videos";
import { requireMedia } from "@/lib/auth/media";

export const runtime = "nodejs";

/** Estimated export sizes for the current settings (from a short real encode). */
export async function POST(request: Request, ctx: RouteContext<"/api/videos/[id]/estimate">) {
  const { id } = await ctx.params;
  // only your own file (and a fair share of FFmpeg work per person)
  const own = await requireMedia(id, { heavy: true });
  if (own instanceof Response) return own;
  const video = await getVideo(id);
  if (!video) return apiError(404, "not_found", "This video is no longer here.");
  let spec;
  try {
    spec = specFromBody(await request.json(), limitsOf(video.info));
  } catch (err) {
    return apiError(400, "bad_settings", err instanceof ZodError ? err.issues[0]?.message ?? "Invalid settings" : "Send JSON.");
  }
  try {
    const mask = await maskForSpec(video, spec);
    return Response.json(await estimateSizes(id, sourcePath(id), video.info, spec, request.signal, mask));
  } catch (err) {
    if (err instanceof AbortedError) return apiError(499, "canceled", "Canceled.");
    return apiError(500, "estimate_failed", "Couldn't estimate the size.");
  }
}
