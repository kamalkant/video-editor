import { apiError } from "@/lib/http/errors";
import { MAX_RENDER_BYTES, RenderError, saveRender } from "@/lib/renders";
import { requireUser } from "@/lib/auth/requireUser";

export const runtime = "nodejs";

/** A PNG the editor drew (a text clip) for the export. Body: the PNG. Returns { id }. */
export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("image/png")) return apiError(415, "bad_type", "Send a PNG picture.");
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_RENDER_BYTES) return apiError(413, "too_big", "The picture is too big.");
  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length > MAX_RENDER_BYTES) return apiError(413, "too_big", "The picture is too big.");
  try {
    const r = await saveRender(buf);
    return Response.json(r, { status: 201 });
  } catch (err) {
    if (err instanceof RenderError) return apiError(400, "bad_picture", err.message);
    return apiError(500, "server_error", "Couldn't save the picture.");
  }
}
