import { apiError } from "@/lib/http/errors";
import { fileResponse } from "@/lib/http/range";
import { getVideo, kindOf, sourcePath } from "@/lib/videos";
import { storagePath } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * What the preview plays: the playable copy of a video a browser can't play (ProRes / HEVC
 * .mov, AVI, MKV…, lib/ffmpeg/playable), else the upload itself (like /source). Range support.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/videos/[id]/play">) {
  const { id } = await ctx.params;
  const video = await getVideo(id);
  if (!video) return apiError(404, "not_found", "This video is no longer here.");
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
