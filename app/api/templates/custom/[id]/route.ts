import { apiError } from "@/lib/http/errors";
import { requireUser } from "@/lib/auth/requireUser";
import { deleteCustom, templateErrorResponse, updateCustom } from "@/lib/templates/custom";

export const runtime = "nodejs";

/** Rename your template, move it to another group, or give it a new video / sound: { name?, category?, description?, videoId?, audioId? (null: none) }. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/templates/custom/[id]">) {
  const user = await requireUser("Sign in to change templates.");
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "bad_request", "Send JSON.");
  }
  try {
    return Response.json({ template: await updateCustom(user.id, id, body as never) });
  } catch (e) {
    return templateErrorResponse(e);
  }
}

/** Remove your template (its video and sound stay in My Assets). */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/templates/custom/[id]">) {
  const user = await requireUser("Sign in to change templates.");
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  if (!(await deleteCustom(user.id, id))) return apiError(404, "not_found", "That template is no longer here.");
  return new Response(null, { status: 204 });
}
