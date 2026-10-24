import { renderStrip } from "@/lib/ffmpeg/preview";
import { cachedVideoImage } from "@/lib/http/cachedImage";
import { requireMedia } from "@/lib/auth/media";

export const runtime = "nodejs";

/** Filmstrip of the clip for the timeline. */
export async function GET(request: Request, ctx: RouteContext<"/api/videos/[id]/strip">) {
  const { id } = await ctx.params;
  // only your own file
  const own = await requireMedia(id);
  if (own instanceof Response) return own;
  return cachedVideoImage(id, "strip.jpg", "image/jpeg", (src, v) => renderStrip(src, v.info, request.signal));
}
