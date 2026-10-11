import { apiError } from "@/lib/http/errors";
import { fileResponse } from "@/lib/http/range";
import { ensureReversed, reversedFile, reversedStatus, reversedUrl } from "@/lib/media/reverse";
import { getVideo, kindOf } from "@/lib/videos";

export const runtime = "nodejs";

const MAX_SECONDS = 120;

/** Start (or check) the backwards copy of [in, out]. Body: { in, out } (seconds). Call again to poll. */
export async function POST(request: Request, ctx: RouteContext<"/api/videos/[id]/reversed">) {
  const { id } = await ctx.params;
  const video = await getVideo(id);
  if (!video || kindOf(video) !== "video") return apiError(404, "not_found", "This video is no longer here.");
  let body: { in?: unknown; out?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "bad_request", "Send JSON.");
  }
  const a = typeof body.in === "number" ? Math.max(0, body.in) : NaN;
  const b = typeof body.out === "number" ? Math.min(video.info.duration, body.out) : NaN;
  if (!(b > a)) return apiError(400, "bad_request", "Send the part to reverse.");
  if (b - a > MAX_SECONDS) return apiError(400, "too_long", `Reverse works on parts up to ${MAX_SECONDS / 60} minutes. Split the clip first.`);
  const s = await reversedStatus(video, a, b);
  if (s.state === "idle") {
    ensureReversed(video, a, b).catch(() => undefined);
    return Response.json({ state: "working", percent: 0, url: null });
  }
  return Response.json({ ...s, url: s.state === "ready" ? reversedUrl(id, a, b) : null });
}

/** The backwards copy (Range support). ?a=&b= in milliseconds. */
export async function GET(request: Request, ctx: RouteContext<"/api/videos/[id]/reversed">) {
  const { id } = await ctx.params;
  if (!(await getVideo(id))) return apiError(404, "not_found", "This video is no longer here.");
  const q = new URL(request.url).searchParams;
  const a = Number(q.get("a"));
  const b = Number(q.get("b"));
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return apiError(400, "bad_request", "Bad range.");
  return fileResponse(reversedFile(id, a / 1000, b / 1000), "video/mp4", request.headers.get("range"), { cache: "private, max-age=86400" });
}
