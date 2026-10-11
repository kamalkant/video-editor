import { apiError } from "@/lib/http/errors";
import { cancelJob, deleteJob, getJob } from "@/lib/jobs/queue";

export const runtime = "nodejs";

export async function GET(_request: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return apiError(404, "not_found", "This job is no longer here.");
  return Response.json(job, { headers: { "Cache-Control": "no-store" } });
}

/** Cancel a running job, or with ?purge=1 delete its files now. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const { id } = await ctx.params;
  if (new URL(request.url).searchParams.has("purge")) {
    return (await deleteJob(id)) ? new Response(null, { status: 204 }) : apiError(404, "not_found", "This job is no longer here.");
  }
  const job = await cancelJob(id);
  if (!job) return apiError(404, "not_found", "This job is no longer here.");
  return Response.json(job);
}
