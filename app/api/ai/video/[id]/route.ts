import { getVeo } from "@/lib/ai/veo";
import { apiError } from "@/lib/http/errors";
import { getVideo } from "@/lib/videos";

export const runtime = "nodejs";

/** A Veo job: { state, startedAt, error?, media? } (media: the finished upload). */
export async function GET(_request: Request, ctx: RouteContext<"/api/ai/video/[id]">) {
  const { id } = await ctx.params;
  const job = await getVeo(id);
  if (!job) return apiError(404, "not_found", "That video job isn't here.");
  const media = job.mediaId ? await getVideo(job.mediaId) : null;
  return Response.json({ ...job, operation: undefined, media }, { headers: { "Cache-Control": "no-store" } });
}
