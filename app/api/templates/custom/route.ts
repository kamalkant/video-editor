import { apiError } from "@/lib/http/errors";
import { createCustom, listCustomWithStatus, templateErrorResponse } from "@/lib/templates/custom";

export const runtime = "nodejs";

/** Your templates (Video Templates → My Templates), each with `missing` when its files were deleted. */
export async function GET() {
  return Response.json({ templates: await listCustomWithStatus() });
}

/** Make one: { name, category?, description?, baseId, videoId, audioId? } (the files are uploads in My Assets). */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "bad_request", "Send JSON.");
  }
  try {
    return Response.json({ template: await createCustom(body as never) }, { status: 201 });
  } catch (e) {
    return templateErrorResponse(e);
  }
}
