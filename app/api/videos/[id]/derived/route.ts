import { derivedStatus, derivedUrl, ensureDerived, type DerivedKind } from "@/lib/media/derived";
import { apiError } from "@/lib/http/errors";
import { getVideo, kindOf } from "@/lib/videos";

export const runtime = "nodejs";

const KINDS: DerivedKind[] = ["stabilize"];

/** Start (or check) a derived version of a video, e.g. { kind: "stabilize" }. Call again to poll. */
export async function POST(request: Request, ctx: RouteContext<"/api/videos/[id]/derived">) {
  const { id } = await ctx.params;
  const video = await getVideo(id);
  if (!video || kindOf(video) !== "video") return apiError(404, "not_found", "This video is no longer here.");
  let kind: unknown;
  try {
    kind = ((await request.json()) as { kind?: unknown }).kind;
  } catch {
    return apiError(400, "bad_request", "Send JSON.");
  }
  if (!KINDS.includes(kind as DerivedKind)) return apiError(400, "bad_request", "Unknown kind.");
  const k = kind as DerivedKind;
  const s = await derivedStatus(video, k);
  if (s.state === "idle") {
    ensureDerived(video, k).catch(() => undefined);
    return Response.json({ state: "working", percent: 0, url: null });
  }
  return Response.json({ ...s, url: s.state === "ready" ? derivedUrl(id, k) : null });
}
