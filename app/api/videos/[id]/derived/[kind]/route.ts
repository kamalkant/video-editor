import { derivedFile, type DerivedKind } from "@/lib/media/derived";
import { apiError } from "@/lib/http/errors";
import { fileResponse } from "@/lib/http/range";
import { getVideo } from "@/lib/videos";

export const runtime = "nodejs";

/** A derived video file (Range support, for the preview). */
export async function GET(request: Request, ctx: RouteContext<"/api/videos/[id]/derived/[kind]">) {
  const { id, kind } = await ctx.params;
  if (kind !== "stabilize") return apiError(404, "not_found", "Unknown file.");
  if (!(await getVideo(id))) return apiError(404, "not_found", "This video is no longer here.");
  return fileResponse(derivedFile(id, kind as DerivedKind), "video/mp4", request.headers.get("range"), { cache: "private, max-age=86400" });
}
