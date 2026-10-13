import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apiError } from "@/lib/http/errors";
import { importFile } from "@/lib/videos";
import { requireUser } from "@/lib/auth/requireUser";

export const runtime = "nodejs";

/**
 * POST /api/library/memes/import
 * Imports a stock or curated library video into My Assets so it can be inserted into the timeline or canvas.
 */
export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  try {
    const body = await request.json();
    const id = body?.id;
    if (!id || typeof id !== "string") {
      return apiError(400, "bad_request", "Missing asset id.");
    }

    let videoPath: string | null = null;
    let title = "Library Clip";

    if (id.startsWith("pexels-") || id.startsWith("pixabay-")) {
      const source = id.startsWith("pixabay-") ? "pixabay" : "pexels";
      const rawId = id.replace(/^(pexels|pixabay)-/, "");
      const { startImport, getImport } = await import("@/lib/import/jobs");
      const job = startImport(source, rawId);
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 600));
        const res = await getImport(job.id);
        if (res?.state === "ready" && res.media) {
          return Response.json(res.media, { status: 201 });
        }
        if (res?.state === "failed") {
          return apiError(500, "server_error", res.error ?? "Failed to import stock video.");
        }
      }
      return apiError(504, "timeout", "Stock video import timed out.");
    } else if (id.startsWith("curated-")) {
      const { existsSync } = await import("node:fs");
      const { CURATED_BROADCAST_ASSETS } = await import("@/lib/media/stockProvider");
      const asset = CURATED_BROADCAST_ASSETS.find((a) => a.id === id);
      title = asset?.title || (body?.title as string) || id;
      const candidatePaths = [
        asset?.videoUrl ? join(process.cwd(), "public", asset.videoUrl.replace(/^\//, "")) : "",
        join(process.cwd(), "public/templates/media", `${id.replace(/^curated-/, "")}.mp4`),
      ].filter(Boolean);
      for (const p of candidatePaths) {
        if (existsSync(p)) {
          videoPath = p;
          break;
        }
      }
    } else {
      return apiError(404, "not_found", "Library clip not found.");
    }

    if (!videoPath) {
      return apiError(
        502,
        "server_error",
        "Failed to retrieve video file.",
      );
    }

    const safeTitle = title.replace(/[^a-zA-Z0-9_\-\s]/g, "_").trim();
    const dir = await mkdtemp(join(tmpdir(), "VDO-meme-"));
    const tempFile = join(dir, `${safeTitle}.mp4`);

    await copyFile(videoPath, tempFile);

    try {
      const meta = await importFile(tempFile, `${safeTitle}.mp4`, user.id);
      return Response.json(meta, { status: 201 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  } catch (err) {
    console.error("Failed to import meme", err);
    return apiError(500, "server_error", "Failed to import meme clip.");
  }
}
