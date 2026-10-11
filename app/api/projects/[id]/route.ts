import { ZodError } from "zod";
import { docSchema } from "@/lib/edit/doc";
import { apiError } from "@/lib/http/errors";
import { getJob } from "@/lib/jobs/queue";
import { deleteProject, getProject, ProjectError, updateProject, type ProjectPatch } from "@/lib/projects/store";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in to view projects.");
  const { id } = await ctx.params;
  const p = await getProject(id, user.id);
  if (!p) return apiError(404, "not_found", "This project was deleted.");
  return Response.json(p);
}

/** Autosave and rename: { name?, doc?, jobId? }. */
export async function PUT(request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in to update projects.");
  const { id } = await ctx.params;
  if (!(await getProject(id, user.id))) return apiError(404, "not_found", "This project was deleted.");
  let body: { name?: unknown; doc?: unknown; jobId?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "bad_request", "Send JSON.");
  }
  try {
    const patch: ProjectPatch = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.doc !== undefined) patch.doc = docSchema.parse(body.doc);
    if (body.jobId !== undefined) {
      if (body.jobId === null) patch.jobId = null;
      else {
        const job = typeof body.jobId === "string" ? await getJob(body.jobId) : null;
        if (!job) return apiError(404, "not_found", "That export is no longer here.");
        patch.jobId = job.id;
      }
    }
    return Response.json(await updateProject(id, patch, user.id));
  } catch (err) {
    if (err instanceof ZodError) return apiError(400, "bad_settings", err.issues[0]?.message ?? "Invalid timeline");
    if (err instanceof ProjectError) return apiError(err.status, err.code, err.message);
    return apiError(500, "server_error", "Couldn't save the project.");
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in to delete projects.");
  const { id } = await ctx.params;
  if (!(await deleteProject(id, user.id))) return apiError(404, "not_found", "This project was already deleted.");
  return new Response(null, { status: 204 });
}
