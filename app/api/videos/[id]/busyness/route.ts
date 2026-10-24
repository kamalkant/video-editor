import { measureBusyness } from "@/lib/ffmpeg/busyness";
import { AbortedError } from "@/lib/ffmpeg/run";
import { apiError } from "@/lib/http/errors";
import { getVideo, sourcePath } from "@/lib/videos";
import { requireMedia } from "@/lib/auth/media";

export const runtime = "nodejs";

/**
 * How busy a video's picture is (for the export size estimate): a 2-second test
 * encode from `at` seconds, fitted into w × h at `fps`. ?at=12&w=1920&h=1080&fps=30
 */
export async function GET(request: Request, ctx: RouteContext<"/api/videos/[id]/busyness">) {
  const { id } = await ctx.params;
  // only your own file
  const own = await requireMedia(id);
  if (own instanceof Response) return own;
  const video = await getVideo(id);
  if (!video || (video.kind ?? "video") !== "video") return apiError(404, "not_found", "This video is no longer here.");
  const q = new URL(request.url).searchParams;
  const num = (k: string, lo: number, hi: number, d: number) => {
    const v = Number(q.get(k));
    return Number.isFinite(v) && q.get(k) !== null ? Math.min(hi, Math.max(lo, v)) : d;
  };
  const w = num("w", 64, 3840, 1920);
  const h = num("h", 64, 3840, 1080);
  const fps = num("fps", 1, 60, 30);
  const at = num("at", 0, video.info.duration, video.info.duration / 2);
  try {
    return Response.json(await measureBusyness(id, sourcePath(id), video.info.duration, at, w, h, fps, request.signal));
  } catch (err) {
    if (err instanceof AbortedError) return apiError(499, "canceled", "Canceled.");
    return apiError(500, "measure_failed", "Couldn't measure the video.");
  }
}
