import { createHash } from "node:crypto";
import { readdir, stat, unlink } from "node:fs/promises";
import { maskFile, maskKey, maskStatus } from "@/lib/ai/masks";
import { activeAiOp, DEFAULT_OUTPUT, type EditSpec } from "@/lib/edit/spec";
import { parseFilmOps } from "@/lib/editor/film";
import { renderFilm } from "@/lib/ffmpeg/preview";
import { cachedVideoImage } from "@/lib/http/cachedImage";
import { apiError } from "@/lib/http/errors";
import { maskParamsOf } from "@/lib/ops/aiMatte";
import { storagePath } from "@/lib/storage";
import { getVideo, type VideoMeta } from "@/lib/videos";

export const runtime = "nodejs";

/** Films kept per video with background removal (each setting tried makes one). */
const KEEP = 8;
const isVideo = (v: VideoMeta) => v.info.duration > 0 && v.info.width > 0;

/**
 * The timeline film of a video (lib/editor/film.ts). `?ops=` (the clip's background removal):
 * the removed parts are see-through (PNG), made once per setting.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/videos/[id]/film">) {
  const { id } = await ctx.params;
  const plain = () => cachedVideoImage(id, "film-v3.jpg", "image/jpeg", (src, v) => renderFilm(src, v.info, null, null, request.signal), isVideo);
  const param = new URL(request.url).searchParams.get("ops");
  if (!param) return plain();
  let spec: EditSpec;
  try {
    spec = { version: 1, ops: parseFilmOps(param), output: DEFAULT_OUTPUT };
  } catch {
    return apiError(400, "bad_settings", "Invalid settings");
  }
  if (!spec.ops.length) return plain();
  const video = await getVideo(id);
  if (!video) return apiError(404, "not_found", "This video is no longer here.");
  let mask: string | null = null;
  const ai = activeAiOp(spec);
  if (ai) {
    const p = maskParamsOf(ai.params);
    // no AI mask yet: the plain film for now, not kept (the next look gets the cut-out one)
    if ((await maskStatus(video, p)).state !== "ready") {
      const r = await plain();
      return new Response(r.body, { status: r.status, headers: { "Content-Type": r.headers.get("Content-Type") ?? "image/jpeg", "Cache-Control": "no-store" } });
    }
    mask = maskFile(id, maskKey(p));
  }
  const key = createHash("sha1").update(JSON.stringify(spec.ops)).digest("hex").slice(0, 12);
  const file = `film-${key}.png`;
  const res = await cachedVideoImage(id, file, "image/png", (src, v) => renderFilm(src, v.info, spec, mask, request.signal), isVideo);
  if (res.ok) void prune(id, file);
  return res;
}

/** Keep the newest few keyed films of a video. */
async function prune(id: string, keep: string) {
  try {
    const dir = storagePath("videos", id);
    const films = (await readdir(dir)).filter((f) => /^film-[0-9a-f]{12}\.png$/.test(f) && f !== keep);
    if (films.length < KEEP) return;
    const dated = await Promise.all(films.map(async (f) => ({ f, t: (await stat(`${dir}/${f}`)).mtimeMs })));
    dated.sort((a, b) => b.t - a.t);
    await Promise.all(dated.slice(KEEP - 1).map((d) => unlink(`${dir}/${d.f}`).catch(() => undefined)));
  } catch {
    /* gone already */
  }
}
