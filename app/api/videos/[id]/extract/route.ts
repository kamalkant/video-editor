import { runFfmpeg, SAFE_INPUT } from "@/lib/ffmpeg/run";
import { apiError } from "@/lib/http/errors";
import { storagePath } from "@/lib/storage";
import { getVideo, importFile, sourcePath } from "@/lib/videos";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { requireMedia } from "@/lib/auth/media";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/videos/[id]/extract">) {
  const { id } = await ctx.params;
  // only your own file (and a fair share of FFmpeg work per person)
  const own = await requireMedia(id, { heavy: true });
  if (own instanceof Response) return own;
  const video = await getVideo(id);
  if (!video) return apiError(404, "not_found", "This video is no longer here.");

  let body: { start?: unknown; end?: unknown; title?: unknown; aspect?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "bad_request", "Send JSON.");
  }

  const start = typeof body.start === "number" && Number.isFinite(body.start) ? Math.max(0, body.start) : 0;
  const duration = video.info.duration || 60;
  const end = typeof body.end === "number" && Number.isFinite(body.end) ? Math.min(duration, Math.max(start + 0.5, body.end)) : duration;
  const aspect = body.aspect === "vertical" ? "vertical" : body.aspect === "square" ? "square" : "original";
  const rawTitle = typeof body.title === "string" ? body.title.trim().slice(0, 80) : "";
  const title = (rawTitle.replace(/[^\w.\- ]/g, "_") || `Highlight_${Math.round(start)}s`).trim();

  const tmpDir = storagePath("tmp");
  await mkdir(tmpDir, { recursive: true });
  const tmpPath = join(tmpDir, `extract-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mp4`);

  const vf =
    aspect === "vertical"
      ? "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black"
      : aspect === "square"
        ? "scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2:black"
        : undefined;

  const args: string[] = [
    ...SAFE_INPUT,
    "-ss",
    start.toFixed(3),
    "-to",
    end.toFixed(3),
    "-i",
    sourcePath(id),
    ...(vf ? ["-vf", vf] : []),
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "20",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    "-y",
    tmpPath,
  ];

  try {
    await runFfmpeg(args, { timeoutMs: 180_000, signal: request.signal });
    const newAsset = await importFile(tmpPath, `${title}.mp4`, own.user.id);
    return Response.json({ video: newAsset });
  } catch (err) {
    return apiError(500, "extract_failed", "Couldn't extract this highlight sub-clip.");
  }
}
