import { ZodError } from "zod";
import { previewMaskForSpec } from "@/lib/ai/masks";
import { AiUnavailableError } from "@/lib/ai/tool";
import { AbortedError } from "@/lib/ffmpeg/run";
import { renderPreview } from "@/lib/ffmpeg/preview";
import { apiError } from "@/lib/http/errors";
import { specFromBody } from "@/lib/edit/spec";
import { DEFAULTS, parseSettings } from "@/lib/settings";
import { getVideo, sourcePath } from "@/lib/videos";

export const runtime = "nodejs";

const g = globalThis as unknown as {
  __VDOPreview?: Map<string, AbortController>;
};
const latest = (g.__VDOPreview ??= new Map());

/**
 * Exact keyed frame (PNG with alpha). Stats travel in the X-VDO-Stats header.
 * A newer preview for the same video kills the older FFmpeg process.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/videos/[id]/preview">,
) {
  const { id } = await ctx.params;
  const video = await getVideo(id);
  if (!video)
    return apiError(404, "not_found", "This video is no longer here.");
  let body: { spec?: unknown; settings?: unknown; t?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "bad_request", "Send JSON.");
  }
  let spec;
  try {
    spec = specFromBody(body, undefined, (s) =>
      parseSettings({ ...DEFAULTS, ...(s as object) }),
    );
  } catch (err) {
    return apiError(
      400,
      "bad_settings",
      err instanceof ZodError
        ? (err.issues[0]?.message ?? "Invalid settings")
        : "Invalid settings",
    );
  }
  const t = typeof body.t === "number" && Number.isFinite(body.t) ? body.t : 0;

  latest.get(id)?.abort();
  const ac = new AbortController();
  latest.set(id, ac);
  request.signal.addEventListener("abort", () => ac.abort(), { once: true });
  try {
    const mask = await previewMaskForSpec(video, spec, t, ac.signal);
    const { png, stats } = await renderPreview(
      sourcePath(id),
      video.info,
      spec,
      t,
      ac.signal,
      mask,
    );
    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        "X-VDO-Stats": JSON.stringify(stats),
      },
    });
  } catch (err) {
    if (err instanceof AbortedError || ac.signal.aborted)
      return apiError(499, "canceled", "A newer preview replaced this one.");
    if (err instanceof AiUnavailableError)
      return apiError(503, "ai_unavailable", err.message);
    return apiError(500, "preview_failed", "Couldn't make the preview.");
  } finally {
    if (latest.get(id) === ac) latest.delete(id);
  }
}
