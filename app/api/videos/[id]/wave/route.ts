import { renderWave } from "@/lib/ffmpeg/preview";
import { cachedVideoImage } from "@/lib/http/cachedImage";

export const runtime = "nodejs";

/** Audio waveform for the timeline (only for videos with sound). */
export async function GET(request: Request, ctx: RouteContext<"/api/videos/[id]/wave">) {
  const { id } = await ctx.params;
  return cachedVideoImage(id, "wave.png", "image/png", (src) => renderWave(src, request.signal), (v) => v.info.hasAudio);
}
