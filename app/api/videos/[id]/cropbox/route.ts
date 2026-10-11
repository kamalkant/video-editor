import { limitsOf } from "@/lib/settings";
import { ZodError } from "zod";
import { maskForSpec } from "@/lib/ai/masks";
import { outputGeometry } from "@/lib/edit/geometry";
import { specFromBody } from "@/lib/edit/spec";
import { findCropBox } from "@/lib/ffmpeg/cropbox";
import { AbortedError } from "@/lib/ffmpeg/run";
import { apiError } from "@/lib/http/errors";
import { getVideo, sourcePath } from "@/lib/videos";

export const runtime = "nodejs";

/** The area "Crop empty area" would keep, and the resulting output size. */
export async function POST(request: Request, ctx: RouteContext<"/api/videos/[id]/cropbox">) {
  const { id } = await ctx.params;
  const video = await getVideo(id);
  if (!video) return apiError(404, "not_found", "This video is no longer here.");
  let spec;
  try {
    spec = specFromBody(await request.json(), limitsOf(video.info));
  } catch (err) {
    return apiError(400, "bad_settings", err instanceof ZodError ? err.issues[0]?.message ?? "Invalid settings" : "Send JSON.");
  }
  try {
    // with AI Removal the whole-clip mask is needed first (made once, then cached)
    const mask = await maskForSpec(video, spec);
    const box = await findCropBox(id, sourcePath(id), video.info, { ...spec, output: { ...spec.output, crop: { ...spec.output.crop, enabled: true } } }, request.signal, mask);
    const geo = outputGeometry(spec.output, video.info, box);
    return Response.json({ box, frame: { w: video.info.width, h: video.info.height }, out: { w: geo.outW, h: geo.outH } });
  } catch (err) {
    if (err instanceof AbortedError) return apiError(499, "canceled", "Canceled.");
    return apiError(500, "cropbox_failed", "Couldn't find the empty area.");
  }
}
