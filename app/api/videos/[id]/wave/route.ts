import { renderWave } from "@/lib/ffmpeg/preview";
import { cachedVideoImage } from "@/lib/http/cachedImage";
import { requireMedia } from "@/lib/auth/media";

export const runtime = "nodejs";

/** Audio waveform for the timeline (only for videos with sound). */
export async function GET(request: Request, ctx: RouteContext<"/api/videos/[id]/wave">) {
  const { id } = await ctx.params;
  // only your own file
  const own = await requireMedia(id);
  if (own instanceof Response) return own;
  return cachedVideoImage(id, "wave.png", "image/png", (src) => renderWave(src, request.signal), (v) => v.info.hasAudio);
}
