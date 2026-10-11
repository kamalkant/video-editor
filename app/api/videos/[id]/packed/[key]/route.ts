import { packedFile } from "@/lib/ai/masks";
import { apiError } from "@/lib/http/errors";
import { fileResponse } from "@/lib/http/range";
import { getVideo } from "@/lib/videos";

export const runtime = "nodejs";

/** Playing preview for AI Removal: the video (top) with its mask (bottom), Range-enabled. */
export async function GET(request: Request, ctx: RouteContext<"/api/videos/[id]/packed/[key]">) {
  const { id, key } = await ctx.params;
  if (!/^[0-9a-f]{16}$/.test(key)) return apiError(400, "bad_request", "Bad key.");
  if (!(await getVideo(id))) return apiError(404, "not_found", "This video is no longer here.");
  try {
    return await fileResponse(packedFile(id, key), "video/mp4", request.headers.get("range"), { cache: "private, max-age=86400" });
  } catch {
    return apiError(404, "not_ready", "The AI preview isn't ready yet.");
  }
}
