import { apiError } from "@/lib/http/errors";
import { fileResponse } from "@/lib/http/range";
import { getVideo, kindOf, sourcePath, whenPlayable } from "@/lib/videos";
import { storagePath } from "@/lib/storage";
import { requireMedia } from "@/lib/auth/media";

export const runtime = "nodejs";

/**
 * What the preview plays: the playable copy of a video a browser can't play (ProRes / HEVC
 * .mov, AVI, MKV…, lib/ffmpeg/playable), else the upload itself (like /source). Range support.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/videos/[id]/play">) {
  const { id } = await ctx.params;
  // only your own file
  const own = await requireMedia(id);
  if (own instanceof Response) return own;
  let video = await getVideo(id);
  if (!video) return apiError(404, "not_found", "This video is no longer here.");
  if (video.playablePending) {
    // the copy is being made (an upload doesn't wait for it): wait a little for it; past that the original
    // meanwhile, by redirect (never the original's bytes under this URL, which then becomes the copy)
    const made = await Promise.race([whenPlayable(video), new Promise<null>((r) => setTimeout(() => r(null), 20_000))]);
    if (!made || made.playablePending) return new Response(null, { status: 307, headers: { Location: `/api/videos/${id}/source`, "Cache-Control": "no-store" } });
    video = made; // (without a copy after all, the original is what plays)
  }
  if (video.playable) {
    const mime = video.playable.endsWith(".webm") ? "video/webm" : "video/mp4";
    return fileResponse(storagePath("videos", id, video.playable), mime, request.headers.get("range"), { cache: "private, max-age=86400" });
  }
  // (as the upload: the same types /source sends)
  // (a relative Location: behind the host's proxy request.url can be the internal address)
  if (kindOf(video) !== "video") return new Response(null, { status: 307, headers: { Location: `/api/videos/${id}/source` } });
  const mime = video.info.container === "webm" ? "video/webm" : "video/mp4";
  return fileResponse(sourcePath(id), mime, request.headers.get("range"), { cache: "private, max-age=86400" });
}
