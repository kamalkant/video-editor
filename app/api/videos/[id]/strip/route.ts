import { renderStrip } from "@/lib/ffmpeg/preview";
import { cachedVideoImage } from "@/lib/http/cachedImage";

export const runtime = "nodejs";

/** Filmstrip of the clip for the timeline. */
export async function GET(request: Request, ctx: RouteContext<"/api/videos/[id]/strip">) {
  const { id } = await ctx.params;
  return cachedVideoImage(id, "strip.jpg", "image/jpeg", (src, v) => renderStrip(src, v.info, request.signal));
}
