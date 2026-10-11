import { z, ZodError } from "zod";
import { TYPE_STEPS_MAX } from "@/lib/player/anim";
import { getCapabilities } from "@/lib/ffmpeg/capabilities";
import { apiError } from "@/lib/http/errors";
import { isFormat } from "@/lib/export/presets";
import { createDocJob, createJob, FormatError } from "@/lib/jobs/queue";
import { docSchema, elementClipsOf, textClipsOf } from "@/lib/edit/doc";
import { isRenderId, renderExists } from "@/lib/renders";
import { cleanDoc } from "@/lib/projects/store";
import { specFromBody } from "@/lib/edit/spec";
import { DEFAULTS, limitsOf, parseSettings } from "@/lib/settings";
import { getVideo } from "@/lib/videos";
import { getCurrentUser } from "@/lib/auth/session";
import { entitlementsFor, exportBlocked } from "@/lib/billing/entitlements";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // exports run on the server: signed-in users only, within what their plan allows
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in to export.");
  const ent = entitlementsFor(user);
  let body: { videoId?: unknown; spec?: unknown; settings?: unknown; doc?: unknown; texts?: unknown; textSprites?: unknown; elements?: unknown; backdrop?: unknown; logo?: unknown; format?: unknown; at?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "bad_request", "Send JSON.");
  }
  // a whole timeline (several clips, pictures, sound), in any export format (lib/export/presets)
  if (body.doc !== undefined) {
    if (body.format !== undefined && !isFormat(body.format)) return apiError(400, "bad_format", "Unknown export format.");
    const at = typeof body.at === "number" && Number.isFinite(body.at) && body.at >= 0 ? body.at : undefined;
    const caps = await getCapabilities();
    if (!caps.ok) return apiError(503, "missing_ffmpeg_features", caps.message ?? "FFmpeg is missing features.");
    try {
      const doc = await cleanDoc(docSchema.parse(body.doc));
      if (!doc.tracks.some((t) => t.clips.length)) return apiError(400, "empty", "The timeline is empty.");
      const tooBig = exportBlocked(ent, doc.canvas.width, doc.canvas.height);
      if (tooBig) return apiError(403, "needs_upgrade", tooBig);
      // every text clip that shows comes as a PNG the editor drew (POST /api/renders)
      const sent = body.texts && typeof body.texts === "object" ? (body.texts as Record<string, unknown>) : {};
      const renders: Record<string, string> = {};
      for (const c of textClipsOf(doc)) {
        const id = sent[c.id];
        if (!isRenderId(id) || !(await renderExists(id))) return apiError(400, "missing_text", "A text on the timeline couldn't be drawn. Try exporting again.");
        renders[c.id] = id;
      }
      // every element that shows too (lib/elements/render): its PNG, and a progress bar's shape or a ticker's words
      const sentEl = body.elements && typeof body.elements === "object" ? (body.elements as Record<string, unknown>) : {};
      const elements: Record<string, ElementSent> = {};
      for (const c of elementClipsOf(doc)) {
        const e = elementSentSchema.safeParse(sentEl[c.id]);
        const ids = e.success ? [e.data.png, e.data.mask, e.data.strip?.png].filter((x): x is string => !!x) : [];
        if (!e.success || !(await Promise.all(ids.map(renderExists))).every(Boolean)) return apiError(400, "missing_text", "An element on the timeline couldn't be drawn. Try exporting again.");
        elements[c.id] = e.data;
      }
      // a drawn backdrop (gradient / studio set) comes as a PNG too
      let backdrop: string | null = null;
      const bk = doc.canvas.backdrop?.kind;
      if (bk === "gradient" || bk === "set") {
        if (!isRenderId(body.backdrop) || !(await renderExists(body.backdrop))) return apiError(400, "missing_text", "The background couldn't be drawn. Try exporting again.");
        backdrop = body.backdrop;
      }
      // the logo's badge (a box, rounded corners: lib/player/logo), when it has one; else the logo picture itself
      const logo = doc.watermark && isRenderId(body.logo) && (await renderExists(body.logo)) ? body.logo : undefined;
      // typewriter texts: their PNG holds every step (how many, and where the text's area is)
      const textSprites = spritesOf(body.textSprites, doc.canvas.width, doc.canvas.height, new Set(Object.keys(renders)));
      const job = await createDocJob(doc, renders, backdrop, { format: isFormat(body.format) ? body.format : undefined, at, logo, textSprites, elements, planMark: ent.watermark });
      return Response.json({ jobId: job.id }, { status: 201 });
    } catch (err) {
      if (err instanceof ZodError) return apiError(400, "bad_settings", err.issues[0]?.message ?? "Invalid timeline");
      if (err instanceof FormatError) return apiError(400, "bad_format", err.message);
      return apiError(500, "server_error", err instanceof Error ? err.message : "Couldn't start the export.");
    }
  }
  const video = typeof body.videoId === "string" ? await getVideo(body.videoId) : null;
  if (!video) return apiError(404, "not_found", "This video is no longer here. Upload it again.");
  const caps = await getCapabilities();
  if (!caps.ok) return apiError(503, "missing_ffmpeg_features", caps.message ?? "FFmpeg is missing features.");
  try {
    const source = limitsOf(video.info);
    const spec = specFromBody(body, source, (s) => parseSettings({ ...DEFAULTS, ...(s as object) }));
    // (the size this export comes out at: its chosen width, or the video's own)
    const outW = spec.output.resolution === "original" ? video.info.width : spec.output.resolution;
    const tooBig = exportBlocked(ent, outW, Math.round((outW * video.info.height) / Math.max(1, video.info.width)));
    if (tooBig) return apiError(403, "needs_upgrade", tooBig);
    const job = await createJob(video.id, spec);
    return Response.json({ jobId: job.id }, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) return apiError(400, "bad_settings", err.issues[0]?.message ?? "Invalid settings");
    return apiError(500, "server_error", "Couldn't start the job.");
  }
}

const renderIdSchema = z.string().regex(/^[0-9a-f]{32}$/);
const side = z.number().int().min(2).max(8192);
/** An element's drawn pictures (lib/elements/render ElementParts, as render ids). */
const elementSentSchema = z.object({
  png: renderIdSchema,
  w: side,
  h: side,
  mask: renderIdSchema.optional(),
  strip: z.object({ png: renderIdSchema, w: side, x: z.number().int().min(0).max(8192), win: side, speed: z.number().finite().min(0).max(100000) }).optional(),
});
type ElementSent = z.infer<typeof elementSentSchema>;

const spriteSchema = z.object({
  frames: z.number().int().min(1).max(TYPE_STEPS_MAX),
  chars: z.number().int().min(0).max(5000),
  box: z.object({ x: z.number().int().min(0), y: z.number().int().min(0), w: z.number().int().min(2), h: z.number().int().min(2) }),
  // word-by-word captions (lib/text/render wordSpriteOf); times: when each word starts, seconds into the clip
  kind: z.enum(["type", "words"]).optional(),
  times: z.array(z.number().finite().min(0).max(3600)).max(TYPE_STEPS_MAX).optional(),
});
/** The typewriter steps sent with the texts (only for texts on the timeline, inside the canvas). */
function spritesOf(raw: unknown, W: number, H: number, ids: Set<string>): Record<string, z.infer<typeof spriteSchema>> {
  const out: Record<string, z.infer<typeof spriteSchema>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const p = spriteSchema.safeParse(v);
    if (ids.has(id) && p.success && p.data.box.x + p.data.box.w <= W && p.data.box.y + p.data.box.h <= H) out[id] = p.data;
  }
  return out;
}
