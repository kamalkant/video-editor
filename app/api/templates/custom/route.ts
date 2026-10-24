import { apiError } from "@/lib/http/errors";
import { requireUser } from "@/lib/auth/requireUser";
import { createCustom, listCustomWithStatus, templateErrorResponse } from "@/lib/templates/custom";

export const runtime = "nodejs";

/** Your templates (Video Templates → My Templates), each with `missing` when its files were deleted. */
export async function GET() {
  const user = await requireUser("Sign in to see your templates.");
  if (user instanceof Response) return user;
  return Response.json({ templates: await listCustomWithStatus(user.id) });
}

/** Make one: { name, category?, description?, baseId, videoId, audioId? } (the files are your uploads in My Assets). */
export async function POST(request: Request) {
  const user = await requireUser("Sign in to make templates.");
  if (user instanceof Response) return user;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "bad_request", "Send JSON.");
  }
  try {
    return Response.json({ template: await createCustom(user.id, body as never) }, { status: 201 });
  } catch (e) {
    return templateErrorResponse(e);
  }
}
