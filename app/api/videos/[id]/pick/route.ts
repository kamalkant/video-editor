import { apiError, finiteNumber } from "@/lib/http/errors";
import { pickColor } from "@/lib/ffmpeg/key";
import { PREVIEW_MAX_WIDTH } from "@/lib/ffmpeg/preview";
import { getVideo, sourcePath } from "@/lib/videos";
import { requireMedia } from "@/lib/auth/media";

export const runtime = "nodejs";

/**
 * Exact color under the eyedropper: median of a 5×5 patch in the decoded frame.
 * x/y are in preview-image pixels (the preview may be scaled down for 4K sources).
 */
export async function GET(request: Request, ctx: RouteContext<"/api/videos/[id]/pick">) {
  const { id } = await ctx.params;
  // only your own file
  const own = await requireMedia(id);
  if (own instanceof Response) return own;
  const video = await getVideo(id);
  if (!video) return apiError(404, "not_found", "This video is no longer here.");
  const q = new URL(request.url).searchParams;
  const scale = video.info.width > PREVIEW_MAX_WIDTH ? video.info.width / PREVIEW_MAX_WIDTH : 1;
  const x = Math.min(video.info.width - 1, Math.max(0, finiteNumber(q.get("x"), 0) * scale));
  const y = Math.min(video.info.height - 1, Math.max(0, finiteNumber(q.get("y"), 0) * scale));
  const t = Math.min(video.info.duration, Math.max(0, finiteNumber(q.get("t"), 0)));
  try {
    return Response.json(await pickColor(sourcePath(id), video.info, x, y, t, video.suggestedKey));
  } catch {
    return apiError(500, "pick_failed", "Couldn't read the color there.");
  }
}
