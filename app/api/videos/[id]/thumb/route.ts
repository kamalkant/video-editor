import { renderThumb } from "@/lib/ffmpeg/preview";
import { cachedVideoImage } from "@/lib/http/cachedImage";

export const runtime = "nodejs";

/** Small JPEG of the video for the media and project lists. */
export async function GET(request: Request, ctx: RouteContext<"/api/videos/[id]/thumb">) {
  const { id } = await ctx.params;
  return cachedVideoImage(id, "thumb.jpg", "image/jpeg", (src, v) => renderThumb(src, v.info, request.signal));
}
