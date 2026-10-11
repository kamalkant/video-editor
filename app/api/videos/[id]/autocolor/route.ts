import { autoColor, statsOf } from "@/lib/color/auto";
import { runFfmpeg, SAFE_INPUT } from "@/lib/ffmpeg/run";
import { apiError } from "@/lib/http/errors";
import { getVideo, kindOf, sourcePath } from "@/lib/videos";

export const runtime = "nodejs";

/** Auto color for a clip: measures 5 frames of [in, out] and returns color settings. Body: { in?, out? }. */
export async function POST(request: Request, ctx: RouteContext<"/api/videos/[id]/autocolor">) {
  const { id } = await ctx.params;
  const video = await getVideo(id);
  if (!video || kindOf(video) === "audio") return apiError(404, "not_found", "This file is no longer here.");
  let body: { in?: unknown; out?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    /* whole clip */
  }
  const d = video.info.duration || 0;
  const a = typeof body.in === "number" ? Math.max(0, body.in) : 0;
  const b = typeof body.out === "number" ? Math.min(d || body.out, body.out) : d;
  const times = kindOf(video) === "image" ? [0] : [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => a + (b - a) * f);
  const all: Uint8Array[] = [];
  try {
    for (const t of times) {
      const r = await runFfmpeg([...SAFE_INPUT, ...(kindOf(video) === "image" ? [] : ["-ss", t.toFixed(3)]), "-i", sourcePath(id), "-frames:v", "1", "-vf", "scale=160:-2,format=rgb24", "-f", "rawvideo", "pipe:1"], { collectStdout: true, timeoutMs: 20_000 });
      all.push(new Uint8Array(r.stdout));
    }
  } catch {
    return apiError(500, "server_error", "Couldn't read the clip's colors.");
  }
  const joined = new Uint8Array(all.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of all) {
    joined.set(x, o);
    o += x.length;
  }
  return Response.json({ color: autoColor(statsOf(joined)) });
}
