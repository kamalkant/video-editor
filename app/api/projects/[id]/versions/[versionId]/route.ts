import { apiError } from "@/lib/http/errors";
import { getCurrentUser } from "@/lib/auth/session";
import { getProject } from "@/lib/projects/store";
import { deleteVersion, getVersion } from "@/lib/projects/versions";

export const runtime = "nodejs";

/** Signed out, or not your project: the response to return (null: it's yours). */
async function notYours(id: string): Promise<Response | null> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in to see versions.");
  return (await getProject(id, user.id)) ? null : apiError(404, "not_found", "This project was deleted.");
}

/** A version of your project: its timeline and its uploads (to restore it). */
export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[id]/versions/[versionId]">) {
  const { id, versionId } = await ctx.params;
  const denied = await notYours(id);
  if (denied) return denied;
  const v = await getVersion(id, versionId);
  if (!v) return apiError(404, "not_found", "This version was deleted.");
  return Response.json(v, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/projects/[id]/versions/[versionId]">) {
  const { id, versionId } = await ctx.params;
  const denied = await notYours(id);
  if (denied) return denied;
  if (!(await deleteVersion(id, versionId))) return apiError(404, "not_found", "This version was already deleted.");
  return new Response(null, { status: 204 });
}
