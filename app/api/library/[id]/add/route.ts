import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apiError } from "@/lib/http/errors";
import { copyForImport, uploadAssetId } from "@/lib/library";
import { getVideo, importFile } from "@/lib/videos";

export const runtime = "nodejs";

/** Add a library sound to My Assets (a copy; your file stays where it is). Returns the new upload. */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/library/[id]/add">,
) {
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const hide = url.searchParams.get("hidden") === "1";

  // one of your template sounds: it's in My Assets already (no copy)
  const asset = uploadAssetId(id);
  if (asset) {
    const m = await getVideo(asset);
    return m
      ? Response.json(m, { status: 201 })
      : apiError(404, "not_found", "That sound is no longer here.");
  }
  const dir = await mkdtemp(join(tmpdir(), "VDO-lib-"));
  try {
    const c = await copyForImport(id, dir);
    if (!c)
      return apiError(404, "not_found", "That sound isn't in the library.");
    const meta = await importFile(c.path, c.name);
    if (hide) {
      const { hideVideoFromLibrary } = await import("@/lib/videos");
      await hideVideoFromLibrary(meta.id);
      meta.hiddenFromLibrary = true;
    }
    return Response.json(meta, { status: 201 });
  } catch (err) {
    console.error("library add failed", id, err);
    return apiError(500, "server_error", "Couldn't add that sound.");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
