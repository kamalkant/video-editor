import { apiError } from "@/lib/http/errors";
import { cancelJob, deleteJob } from "@/lib/jobs/queue";
import { requireJob } from "@/lib/auth/jobs";

export const runtime = "nodejs";

/** Your export's status (with its timeline). */
export async function GET(_request: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const { id } = await ctx.params;
  const job = await requireJob(id);
  if (job instanceof Response) return job;
  return Response.json(job, { headers: { "Cache-Control": "no-store" } });
}

/** Cancel your running export, or with ?purge=1 delete its files now. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const { id } = await ctx.params;
  const own = await requireJob(id);
  if (own instanceof Response) return own;
  if (new URL(request.url).searchParams.has("purge")) {
    return (await deleteJob(id)) ? new Response(null, { status: 204 }) : apiError(404, "not_found", "This job is no longer here.");
  }
  const job = await cancelJob(id);
  if (!job) return apiError(404, "not_found", "This job is no longer here.");
  return Response.json(job);
}
