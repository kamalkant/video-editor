import { stat } from "node:fs/promises";
import { apiError } from "@/lib/http/errors";
import { fileResponse } from "@/lib/http/range";
import { getVideo, kindOf } from "@/lib/videos";
import {
  ensureProxy,
  getProxyStatus,
  invalidateProxy,
  proxyFilePath,
} from "@/lib/media/proxy";

export const runtime = "nodejs";

async function fileExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.size > 0;
  } catch {
    return false;
  }
}

/**
 * Proxy Endpoint:
 * Streams 720p fast-seeking proxy with HTTP 206 Partial Content range requests.
 * If proxy is generating or not yet ready, redirects to /play (or /source), so this URL only ever serves the proxy,
 * ensuring playback never breaks or displays black frames.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/videos/[id]/proxy">) {
  const { id } = await ctx.params;
  const video = await getVideo(id);
  if (!video) return apiError(404, "not_found", "This video is no longer here.");

  const url = new URL(request.url);
  if (url.searchParams.get("status") === "1") {
    const status = await getProxyStatus(video);
    return Response.json(status);
  }

  const isAlpha = !!video.info.alpha;
  const pPath = proxyFilePath(id, isAlpha);
  const ready = await fileExists(pPath);

  if (ready) {
    const mime = isAlpha ? "video/webm" : "video/mp4";
    return fileResponse(pPath, mime, request.headers.get("range"), { cache: "private, max-age=86400" });
  }

  // Proxy not yet ready: trigger background generation if not already active
  void ensureProxy(video).catch(() => undefined);

  // Meanwhile the preview plays /play (the playable copy, or the upload). A redirect, not those bytes under
  // this URL: once the proxy exists this URL is a different file, and a player still reading the old one
  // asked for ranges past its end (416) and froze on a black frame.
  // (a relative Location: behind the host's proxy request.url can be the internal address)
  return new Response(null, { status: 307, headers: { Location: `/api/videos/${id}/${kindOf(video) === "video" ? "play" : "source"}`, "Cache-Control": "no-store" } });
}

/**
 * Trigger proxy generation or rebuild.
 * Body: { force?: boolean }
 */
export async function POST(request: Request, ctx: RouteContext<"/api/videos/[id]/proxy">) {
  const { id } = await ctx.params;
  const video = await getVideo(id);
  if (!video) return apiError(404, "not_found", "This video is no longer here.");

  const body = await request.json().catch(() => ({}));
  try {
    const proxy = await ensureProxy(video, undefined, { force: !!body.force });
    return Response.json({ success: true, proxy });
  } catch (err: any) {
    return apiError(500, "proxy_generation_failed", err?.message || "Failed to generate proxy");
  }
}

/**
 * Invalidate and remove proxy for this video without touching master source media.
 */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/videos/[id]/proxy">) {
  const { id } = await ctx.params;
  const video = await getVideo(id);
  if (!video) return apiError(404, "not_found", "This video is no longer here.");

  const removed = await invalidateProxy(id);
  return Response.json({ success: true, removed });
}
