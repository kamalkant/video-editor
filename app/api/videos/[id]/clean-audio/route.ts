import { stat, rename, rm } from "node:fs/promises";
import { DENOISE, isDenoiseLevel } from "@/lib/audio/denoise";
import { runFfmpeg, SAFE_INPUT } from "@/lib/ffmpeg/run";
import { apiError } from "@/lib/http/errors";
import { fileResponse } from "@/lib/http/range";
import { storagePath } from "@/lib/storage";
import { getVideo, sourcePath } from "@/lib/videos";
import { requireMedia } from "@/lib/auth/media";

export const runtime = "nodejs";

const making = new Map<string, Promise<void>>();

/** The upload's sound with background noise removed (made once, cached), for the preview. ?level=light|strong */
export async function GET(request: Request, ctx: RouteContext<"/api/videos/[id]/clean-audio">) {
  const { id } = await ctx.params;
  // only your own file (and a fair share of FFmpeg work per person)
  const own = await requireMedia(id, { heavy: true });
  if (own instanceof Response) return own;
  const level = new URL(request.url).searchParams.get("level");
  if (!isDenoiseLevel(level)) return apiError(400, "bad_request", "level must be light or strong.");
  const video = await getVideo(id);
  if (!video || !video.info.hasAudio) return apiError(404, "not_found", "This file has no sound.");
  const out = storagePath("videos", id, `clean-${level}.m4a`);
  const ready = await stat(out).then((s) => s.size > 0).catch(() => false);
  if (!ready) {
    const key = `${id}:${level}`;
    let job = making.get(key);
    if (!job) {
      job = (async () => {
        const tmp = `${out}.tmp.m4a`;
        try {
          await runFfmpeg([...SAFE_INPUT, "-i", sourcePath(id), "-vn", "-af", DENOISE[level], "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart", "-y", tmp], { timeoutMs: 10 * 60 * 1000 });
          await rename(tmp, out);
        } finally {
          await rm(tmp, { force: true });
          making.delete(key);
        }
      })();
      making.set(key, job);
    }
    try {
      await job;
    } catch {
      return apiError(500, "server_error", "Couldn't clean the sound.");
    }
  }
  return fileResponse(out, "audio/mp4", request.headers.get("range"), { cache: "private, max-age=86400" });
}
