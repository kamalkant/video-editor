import { apiError } from "@/lib/http/errors";
import { getImport } from "@/lib/import/jobs";

export const runtime = "nodejs";

/** An import's progress: { state, percent, media?, error? }. */
export async function GET(_request: Request, ctx: RouteContext<"/api/import/jobs/[id]">) {
  const { id } = await ctx.params;
  const job = await getImport(id);
  if (!job) return apiError(404, "not_found", "That import isn't here.");
  return Response.json(job, { headers: { "Cache-Control": "no-store" } });
}
