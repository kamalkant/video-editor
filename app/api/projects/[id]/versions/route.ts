import { apiError } from "@/lib/http/errors";
import { ProjectError } from "@/lib/projects/store";
import { listVersions, saveVersion } from "@/lib/projects/versions";

export const runtime = "nodejs";

/** The project's saved versions, newest first. */
export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[id]/versions">) {
  const { id } = await ctx.params;
  try {
    return Response.json({ versions: await listVersions(id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof ProjectError) return apiError(err.status, err.code, err.message);
    return apiError(500, "server_error", "Couldn't read the versions.");
  }
}

/** Save a version of the project as it is saved now: { name?, auto? }. */
export async function POST(request: Request, ctx: RouteContext<"/api/projects/[id]/versions">) {
  const { id } = await ctx.params;
  let body: { name?: unknown; auto?: unknown } = {};
  try {
    body = (await request.json()) ?? {};
  } catch {
    return apiError(400, "bad_request", "Send JSON.");
  }
  try {
    return Response.json(await saveVersion(id, { name: body.name, auto: body.auto === true }), { status: 201 });
  } catch (err) {
    if (err instanceof ProjectError) return apiError(err.status, err.code, err.message);
    return apiError(500, "server_error", "Couldn't save the version.");
  }
}
