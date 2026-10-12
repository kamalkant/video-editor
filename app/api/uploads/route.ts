import { requireUser } from "@/lib/auth/requireUser";
import { apiError } from "@/lib/http/errors";
import { createSession, MAX_CHUNK_BYTES } from "@/lib/uploads/chunked";
import { uploadErrorResponse } from "./errors";

export const runtime = "nodejs";

/**
 * Start an upload in chunks (lib/uploads/chunked): { name, type, size, id?, recording? }.
 * Then PUT /api/uploads/<uploadId>?offset=… for each chunk and POST …/finish.
 */
export async function POST(request: Request) {
  const user = await requireUser("Sign in to upload.");
  if (user instanceof Response) return user;
  const b = (await request.json().catch(() => null)) as { name?: unknown; type?: unknown; size?: unknown; id?: unknown; recording?: unknown } | null;
  if (!b || typeof b.size !== "number") return apiError(400, "bad_request", "Say which file is coming.");
  try {
    const s = await createSession(user.id, {
      name: typeof b.name === "string" ? b.name : "video",
      type: typeof b.type === "string" ? b.type : "",
      size: b.size,
      id: typeof b.id === "string" ? b.id : null,
      recording: b.recording === true,
    });
    return Response.json({ uploadId: s.uploadId, received: 0, maxChunk: MAX_CHUNK_BYTES }, { status: 201 });
  } catch (err) {
    return uploadErrorResponse(err);
  }
}
