import { extname } from "node:path";
import { apiError } from "@/lib/http/errors";
import { fileResponse } from "@/lib/http/range";
import { libraryPath, uploadAssetId } from "@/lib/library";
import { sourcePath } from "@/lib/videos";
import { requireMedia } from "@/lib/auth/media";

export const runtime = "nodejs";

const MIME: Record<string, string> = { ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac", ".wav": "audio/wav", ".aif": "audio/aiff", ".aiff": "audio/aiff", ".flac": "audio/flac", ".ogg": "audio/ogg", ".opus": "audio/ogg", ".caf": "audio/x-caf" };

/** Listen to a library sound (Range support). Only starter sounds and files in your folder. */
export async function GET(request: Request, ctx: RouteContext<"/api/library/[id]/audio">) {
  const { id } = await ctx.params;
  const asset = uploadAssetId(id);
  if (asset) {
    // your uploaded sound: only yours
    const r = await requireMedia(asset);
    if (r instanceof Response) return r;
    const m = r.video;
    return fileResponse(sourcePath(asset), MIME[extname(m.fileName).toLowerCase()] ?? "audio/mp4", request.headers.get("range"), { cache: "private, max-age=3600" });
  }
  const path = await libraryPath(id);
  if (!path) return apiError(404, "not_found", "That sound isn't in the library.");
  return fileResponse(path, MIME[extname(path).toLowerCase()] ?? "audio/mp4", request.headers.get("range"), { cache: "private, max-age=3600" });
}
