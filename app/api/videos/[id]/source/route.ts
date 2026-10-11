import { apiError } from "@/lib/http/errors";
import { fileResponse } from "@/lib/http/range";
import { getVideo, kindOf, sourcePath } from "@/lib/videos";

export const runtime = "nodejs";

const MIME: Record<string, string> = { mp4: "video/mp4", webm: "video/webm", matroska: "video/x-matroska", mov: "video/quicktime", avi: "video/x-msvideo" };
const IMAGE_MIME: Record<string, string> = { png: "image/png", mjpeg: "image/jpeg", webp: "image/webp", bmp: "image/bmp", tiff: "image/tiff" };
const AUDIO_MIME: Record<string, string> = { mp3: "audio/mpeg", wav: "audio/wav", aac: "audio/aac", flac: "audio/flac", ogg: "audio/ogg", mov: "audio/mp4", mp4: "audio/mp4", m4a: "audio/mp4", caf: "audio/x-caf", aiff: "audio/aiff", matroska: "audio/webm", webm: "audio/webm" };

/** The uploaded file (video, picture or sound), with Range support, for the preview. */
export async function GET(request: Request, ctx: RouteContext<"/api/videos/[id]/source">) {
  const { id } = await ctx.params;
  const video = await getVideo(id);
  if (!video) return apiError(404, "not_found", "This video is no longer here.");
  const kind = kindOf(video);
  const mime = kind === "image" ? (IMAGE_MIME[video.info.videoCodec] ?? "image/png") : kind === "audio" ? (AUDIO_MIME[video.info.container] ?? "audio/mpeg") : (MIME[video.info.container] ?? "video/mp4");
  return fileResponse(sourcePath(id), mime, request.headers.get("range"), { cache: "private, max-age=86400" });
}
