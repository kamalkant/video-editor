import { apiError, finiteNumber } from "@/lib/http/errors";
import { renderFrame } from "@/lib/ffmpeg/preview";
import { getVideo, sourcePath } from "@/lib/videos";

export const runtime = "nodejs";

/** The original (un-keyed) frame at time t, as PNG. */
export async function GET(request: Request, ctx: RouteContext<"/api/videos/[id]/frame">) {
  const { id } = await ctx.params;
  const video = await getVideo(id);
  if (!video) return apiError(404, "not_found", "This video is no longer here.");
  const t = finiteNumber(new URL(request.url).searchParams.get("t"), 0);
  try {
    const png = await renderFrame(sourcePath(id), video.info, t, request.signal);
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400, immutable" } });
  } catch {
    return apiError(500, "frame_failed", "Couldn't read that frame.");
  }
}
