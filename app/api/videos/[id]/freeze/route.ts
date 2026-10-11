import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { previewMaskForSpec } from "@/lib/ai/masks";
import { specFromBody } from "@/lib/edit/spec";
import { renderPreview } from "@/lib/ffmpeg/preview";
import { formatTime } from "@/lib/format";
import { apiError } from "@/lib/http/errors";
import { DEFAULTS, parseSettings } from "@/lib/settings";
import { getVideo, importFile, kindOf, sourcePath } from "@/lib/videos";

export const runtime = "nodejs";

/**
 * Freeze frame: the frame at t (source seconds) as a picture in My Assets,
 * with the clip's background removal applied (the same renderer as the exact
 * preview). Body: { t, spec }. Returns the new picture upload.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/videos/[id]/freeze">,
) {
  const { id } = await ctx.params;
  const video = await getVideo(id);
  if (!video || kindOf(video) !== "video")
    return apiError(404, "not_found", "This video is no longer here.");
  let body: { t?: unknown; spec?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "bad_request", "Send JSON.");
  }
  const t =
    typeof body.t === "number" && Number.isFinite(body.t)
      ? Math.min(Math.max(0, body.t), video.info.duration)
      : 0;
  let spec;
  try {
    spec = specFromBody({ spec: body.spec }, undefined, (s) =>
      parseSettings({ ...DEFAULTS, ...(s as object) }),
    );
  } catch {
    return apiError(400, "bad_settings", "Invalid settings");
  }
  // the full-size frame (not the smaller preview size)
  const full = {
    ...spec,
    output: {
      ...spec.output,
      resolution: "original" as const,
      crop: { ...spec.output.crop, enabled: false },
    },
  };
  const dir = await mkdtemp(join(tmpdir(), "VDO-freeze-"));
  try {
    const mask = await previewMaskForSpec(video, full, t);
    const { png } = await renderPreview(
      sourcePath(id),
      video.info,
      full,
      t,
      undefined,
      mask,
    );
    const file = join(dir, "freeze.png");
    await writeFile(file, png);
    const name = `Freeze ${video.fileName.replace(/\.[^.]+$/, "")} ${formatTime(t).replace(":", "-")}.png`;
    return Response.json(await importFile(file, name), { status: 201 });
  } catch {
    return apiError(500, "server_error", "Couldn't make the freeze frame.");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
