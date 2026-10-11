import { apiError } from "@/lib/http/errors";
import { deleteVersion, getVersion } from "@/lib/projects/versions";

export const runtime = "nodejs";

/** A version's timeline and its uploads (to restore it). */
export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[id]/versions/[versionId]">) {
  const { id, versionId } = await ctx.params;
  const v = await getVersion(id, versionId);
  if (!v) return apiError(404, "not_found", "This version was deleted.");
  return Response.json(v, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/projects/[id]/versions/[versionId]">) {
  const { id, versionId } = await ctx.params;
  if (!(await deleteVersion(id, versionId))) return apiError(404, "not_found", "This version was already deleted.");
  return new Response(null, { status: 204 });
}
