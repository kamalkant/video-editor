import { apiError } from "@/lib/http/errors";
import { fileResponse } from "@/lib/http/range";
import { MEME_CATALOG } from "@/lib/library/memeCatalog";
import { ensureMemeVideo } from "@/lib/library/memeGenerator";

export const runtime = "nodejs";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const meme = MEME_CATALOG.find((m) => m.id === id);

  if (!meme) {
    return apiError(404, "not_found", "Meme clip not found.");
  }

  try {
    const videoPath = await ensureMemeVideo(meme);
    return fileResponse(videoPath, "video/mp4", request.headers.get("range"), {
      cache: "public, max-age=86400",
    });
  } catch (err) {
    console.error("Failed to stream meme video", id, err);
    return apiError(500, "server_error", "Failed to load meme video.");
  }
}
