import { apiError } from "@/lib/http/errors";
import { ChunkError } from "@/lib/uploads/chunked";
import { UploadError } from "@/lib/videos";

/** The answer for a chunked-upload error (a chunk that doesn't fit says where to resume: `received`). */
export function uploadErrorResponse(err: unknown, fallback = "The upload stopped. Try again."): Response {
  if (err instanceof ChunkError)
    return Response.json({ error: { code: err.code, message: err.message }, ...(err.received !== undefined ? { received: err.received } : {}) }, { status: err.status });
  if (err instanceof UploadError) return apiError(err.status, err.code, err.message);
  console.error("chunked upload failed", err instanceof Error ? err.message : err);
  return apiError(500, "server_error", fallback);
}
