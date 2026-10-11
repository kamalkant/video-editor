import { apiError } from "@/lib/http/errors";
import { rememberUpload, templateErrorResponse } from "@/lib/templates/custom";

export const runtime = "nodejs";

/**
 * A clip or sound uploaded in the template pane ({ assetId, kind: "video" | "audio" }, already in
 * My Assets via POST /api/videos): remembered so it's listed by /api/templates/media after a reload.
 */
export async function POST(request: Request) {
  let body: { assetId?: unknown; kind?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "bad_request", "Send JSON.");
  }
  if (typeof body.assetId !== "string" || (body.kind !== "video" && body.kind !== "audio")) return apiError(400, "bad_request", "Send { assetId, kind }.");
  try {
    return Response.json({ upload: await rememberUpload(body.assetId, body.kind) }, { status: 201 });
  } catch (e) {
    return templateErrorResponse(e);
  }
}
