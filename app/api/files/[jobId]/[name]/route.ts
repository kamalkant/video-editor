import { fileResponse } from "@/lib/http/range";
import { apiError } from "@/lib/http/errors";
import { getJob } from "@/lib/jobs/queue";
import { storagePath } from "@/lib/storage";

export const runtime = "nodejs";

/** Serve a finished file with HTTP Range support (Safari needs it for video). */
async function serve(request: Request, ctx: RouteContext<"/api/files/[jobId]/[name]">, head = false) {
  const { jobId, name } = await ctx.params;
  const job = await getJob(jobId);
  const file = job?.files.find((f) => f.name === name);
  if (!job || !file) return apiError(404, "not_found", "This file is no longer here. Files are deleted after 24 hours.");
  const download = new URL(request.url).searchParams.has("download");
  const res = await fileResponse(storagePath("jobs", job.id, file.name), file.mime, request.headers.get("range"), {
    downloadName: download ? file.name : undefined,
  });
  return head ? new Response(null, { status: res.status, headers: res.headers }) : res;
}

export function GET(request: Request, ctx: RouteContext<"/api/files/[jobId]/[name]">) {
  return serve(request, ctx);
}

export function HEAD(request: Request, ctx: RouteContext<"/api/files/[jobId]/[name]">) {
  return serve(request, ctx, true);
}
