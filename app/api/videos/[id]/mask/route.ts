import { limitsOf } from "@/lib/settings";
import { ZodError } from "zod";
import { ensureMask, ensurePacked, maskKey, maskStatus, packedFile } from "@/lib/ai/masks";
import { AiUnavailableError, ensureTool } from "@/lib/ai/tool";
import { activeAiOp, specFromBody } from "@/lib/edit/spec";
import { apiError } from "@/lib/http/errors";
import { maskParamsOf } from "@/lib/ops/aiMatte";
import { getVideo } from "@/lib/videos";
import { stat } from "node:fs/promises";

export const runtime = "nodejs";

/**
 * AI Removal mask for the current settings: starts making it if needed and
 * reports progress. Call again to poll. When done, also makes the playing
 * preview (video + mask stacked) and returns its address.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/videos/[id]/mask">) {
  const { id } = await ctx.params;
  const video = await getVideo(id);
  if (!video) return apiError(404, "not_found", "This video is no longer here.");
  let spec;
  try {
    spec = specFromBody(await request.json(), limitsOf(video.info));
  } catch (err) {
    return apiError(400, "bad_settings", err instanceof ZodError ? err.issues[0]?.message ?? "Invalid settings" : "Send JSON.");
  }
  const op = activeAiOp(spec);
  if (!op) return apiError(400, "no_ai", "AI Removal is off.");
  try {
    await ensureTool();
  } catch (err) {
    return apiError(503, "ai_unavailable", err instanceof AiUnavailableError ? err.message : "AI Removal isn't available on this computer.");
  }
  const params = maskParamsOf(op.params);
  const key = maskKey(params);
  const status = await maskStatus(video, params);
  if (status.state === "idle") {
    ensureMask(video, params).then(() => ensurePacked(video, params)).catch(() => undefined);
    return Response.json({ state: "working", percent: 0, key, packed: null });
  }
  let packed: string | null = null;
  if (status.state === "ready") {
    const ok = await stat(packedFile(id, key)).then((s) => s.size > 0).catch(() => false);
    if (ok) packed = `/api/videos/${id}/packed/${key}`;
    else ensurePacked(video, params).catch(() => undefined);
  }
  return Response.json({ ...status, key, packed });
}
