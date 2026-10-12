import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apiError } from "@/lib/http/errors";
import { MEME_CATALOG } from "@/lib/library/memeCatalog";
import { ensureMemeVideo } from "@/lib/library/memeGenerator";
import { dynamicFailure, ensureDynamicVideo } from "@/lib/library/dynamicSearch";
import { importFile } from "@/lib/videos";
import { requireUser } from "@/lib/auth/requireUser";

export const runtime = "nodejs";

/**
 * POST /api/library/memes/import
 * Imports a curated or dynamic meme video into My Assets so it can be inserted into the timeline or canvas.
 */
export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  try {
    const body = await request.json();
    const id = body?.id;
    if (!id || typeof id !== "string") {
      return apiError(400, "bad_request", "Missing meme id.");
    }

    let videoPath: string | null = null;
    let title = "Meme Clip";

    if (id.startsWith("dyn_")) {
      const ytId = id.replace("dyn_", "");
      title = (body?.title as string) || `Meme_${ytId}`;
      const reqDuration =
        typeof body?.duration === "number" ? body.duration : 30;
      videoPath = await ensureDynamicVideo(
        ytId,
        Math.min(30, Math.max(1, reqDuration)),
      );
    } else if (id.startsWith("pexels-") || id.startsWith("pixabay-")) {
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
      const meme = MEME_CATALOG.find((m) => m.id === id);
      if (!meme) {
        return apiError(404, "not_found", "Meme clip not found.");
      }
      title = meme.title;
      videoPath = await ensureMemeVideo(meme);
    }

    if (!videoPath) {
      return apiError(
        502,
        "server_error",
        (id.startsWith("dyn_") && dynamicFailure(id.replace("dyn_", ""))) || "Failed to retrieve meme video file.",
      );
    }

    const safeTitle = title.replace(/[^a-zA-Z0-9_\-\s]/g, "_").trim();
    const dir = await mkdtemp(join(tmpdir(), "VDO-meme-"));
    const tempFile = join(dir, `${safeTitle}.mp4`);

    await copyFile(videoPath, tempFile);

    try {
      const meta = await importFile(tempFile, `${safeTitle}.mp4`);
      return Response.json(meta, { status: 201 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  } catch (err) {
    console.error("Failed to import meme", err);
    return apiError(500, "server_error", "Failed to import meme clip.");
  }
}
