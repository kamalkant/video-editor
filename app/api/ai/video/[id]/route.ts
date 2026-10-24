import { getVeo } from "@/lib/ai/veo";
import { apiError } from "@/lib/http/errors";
import { getVideo } from "@/lib/videos";
import { requireUser } from "@/lib/auth/requireUser";
import { canUseMedia } from "@/lib/auth/media";

export const runtime = "nodejs";

/** A Veo job: { state, startedAt, error?, media? } (media: the finished upload). */
export async function GET(_request: Request, ctx: RouteContext<"/api/ai/video/[id]">) {
  const user = await requireUser("Sign in to see your video.");
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const job = await getVeo(id);
  if (!job) return apiError(404, "not_found", "That video job isn't here.");
  // (the finished video: only for the person it was made for)
  const made = job.mediaId ? await getVideo(job.mediaId) : null;
  if (made && !canUseMedia(user, made)) return apiError(404, "not_found", "That video job isn't here.");
  const media = made;
  return Response.json({ ...job, operation: undefined, media }, { headers: { "Cache-Control": "no-store" } });
}
