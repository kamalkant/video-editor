import { readFile, writeFile } from "node:fs/promises";
import { apiError } from "./errors";
import { storagePath } from "../storage";
import { getVideo, sourcePath, type VideoMeta } from "../videos";

/** A small image made once per video by FFmpeg, then served from disk. */
export async function cachedVideoImage(id: string, file: string, type: string, make: (source: string, video: VideoMeta) => Promise<Buffer>, when?: (v: VideoMeta) => boolean): Promise<Response> {
  const video = await getVideo(id);
  if (!video) return apiError(404, "not_found", "This video is no longer here.");
  if (when && !when(video)) return apiError(404, "not_available", "Not available for this video.");
  const path = storagePath("videos", id, file);
  let body: Buffer;
  try {
    body = await readFile(path);
  } catch {
    try {
      body = await make(sourcePath(id), video);
      await writeFile(path, body).catch(() => undefined);
    } catch {
      return apiError(500, "image_failed", "Couldn't make the image.");
    }
  }
  return new Response(new Uint8Array(body), { headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400, immutable" } });
}
