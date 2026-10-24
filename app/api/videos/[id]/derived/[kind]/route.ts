import { derivedFile, type DerivedKind } from "@/lib/media/derived";
import { apiError } from "@/lib/http/errors";
import { fileResponse } from "@/lib/http/range";
import { requireMedia } from "@/lib/auth/media";

export const runtime = "nodejs";

/** A derived video file (Range support, for the preview). */
export async function GET(request: Request, ctx: RouteContext<"/api/videos/[id]/derived/[kind]">) {
  const { id, kind } = await ctx.params;
  if (kind !== "stabilize") return apiError(404, "not_found", "Unknown file.");
  // only your own file
  const own = await requireMedia(id);
  if (own instanceof Response) return own;
  return fileResponse(derivedFile(id, kind as DerivedKind), "video/mp4", request.headers.get("range"), { cache: "private, max-age=86400" });
}
