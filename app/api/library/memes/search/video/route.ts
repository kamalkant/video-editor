import { apiError } from "@/lib/http/errors";
import { fileResponse } from "@/lib/http/range";
import { dynamicFailure, ensureDynamicVideo } from "@/lib/library/dynamicSearch";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return apiError(400, "bad_request", "Missing dynamic meme id.");
  }

  try {
    const videoPath = await ensureDynamicVideo(id);
    if (!videoPath) {
      return apiError(502, "not_found", dynamicFailure(id) ?? "Failed to resolve dynamic video.");
    }

    return fileResponse(videoPath, "video/mp4", request.headers.get("range"), {
      cache: "public, max-age=86400",
    });
  } catch (err) {
    console.error("Failed to stream dynamic meme video", id, err);
    return apiError(500, "server_error", "Failed to stream video.");
  }
}
