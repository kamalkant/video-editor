import { copyFile, mkdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { apiError } from "@/lib/http/errors";
import { importFile } from "@/lib/videos";
import { TEMPLATE_VIDEO_CLIPS } from "@/lib/templates/templateMediaAssets";

export const runtime = "nodejs";

/**
 * Import a template video loop from public/templates/media into My Assets
 * so it can be placed directly on the timeline or used as a background.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { clipId?: string; url?: string };
    const clipId = body?.clipId;
    const url = body?.url;

    const matched = TEMPLATE_VIDEO_CLIPS.find(
      (c) => c.id === clipId || c.url === url,
    );
    // (a file someone saved in public/templates/media: by its address; basename keeps it inside that folder)
    const fileName = matched
      ? basename(matched.url)
      : url?.startsWith("/templates/media/")
        ? basename(url)
        : clipId
          ? `${clipId}.mp4`
          : null;

    if (!fileName) {
      return apiError(
        400,
        "bad_request",
        "Please provide a valid clipId or url.",
      );
    }

    const srcPath = join(process.cwd(), "public/templates/media", fileName);
    const exists = await stat(srcPath).catch(() => null);
    if (!exists) {
      return apiError(
        404,
        "not_found",
        `Template media file "${fileName}" not found.`,
      );
    }

    const tmpDir = join(tmpdir(), `VDO-tmpl-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    const tmpFile = join(tmpDir, `import-${fileName}`);

    await copyFile(srcPath, tmpFile);
    const meta = await importFile(
      tmpFile,
      matched?.title ? `${matched.title}.mp4` : fileName,
    );
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});

    // Templates keep their media decoupled: do not pollute user's "My Assets" bin
    const { hideVideoFromLibrary } = await import("@/lib/videos");
    await hideVideoFromLibrary(meta.id);
    meta.hiddenFromLibrary = true;

    return Response.json(meta, { status: 201 });
  } catch (err) {
    console.error("Failed to import template video clip", err);
    return apiError(
      500,
      "server_error",
      "Failed to import template media clip.",
    );
  }
}
