import { z, ZodError } from "zod";
import { apiError } from "../http/errors";
import { isId, newId, readJson, storagePath, writeJson } from "../storage";
import { getVideo, kindOf, type VideoMeta } from "../videos";
import { BROADCAST_TEMPLATES_BY_ID } from "./newsTemplates";

/**
 * Your own templates (Video Templates → "+ Create template"): your video on Video 1,
 * your sound on an audio track, and a base look (one of the broadcast templates' titles,
 * ticker and graphics on top, or none). Kept in storage/templates.json, with the clips and
 * sounds uploaded in the template pane ("+ Upload Clip" / "+ Upload Audio"), so they show
 * again after a reload. The files themselves are ordinary uploads (My Assets); the 24-hour
 * clean-up keeps them while a template uses them (lib/storage projectReferences).
 */

export const MY_TEMPLATES = "My Templates";
export const TEMPLATE_RATIOS = ["16:9", "9:16", "1:1"] as const;
export type TemplateRatio = (typeof TEMPLATE_RATIOS)[number];

const mediaRef = z.object({
  assetId: z.string().refine(isId, "Not a file id"),
  name: z.string().trim().min(1).max(200),
  duration: z.number().finite().min(0),
  width: z.number().int().min(0).max(8192).optional(),
  height: z.number().int().min(0).max(8192).optional(),
});
export type TemplateMediaRef = z.infer<typeof mediaRef>;

export const customTemplateSchema = z.object({
  id: z.string().refine(isId),
  name: z.string().trim().min(1, "Give the template a name").max(60),
  category: z.string().trim().min(1).max(40).default(MY_TEMPLATES),
  description: z.string().trim().max(300).optional(),
  aspectRatio: z.enum(TEMPLATE_RATIOS),
  /** a broadcast template's id (its look on top of your video), or null: just your video and sound */
  baseId: z.string().max(80).nullable(),
  video: mediaRef,
  audio: mediaRef.optional(),
  createdAt: z.number().int(),
  /** whose template it is (older ones: the person whose video it uses) */
  userId: z.string().max(80).optional(),
});
export type CustomTemplate = z.infer<typeof customTemplateSchema>;

/** What "+ Create template" sends (the server fills the rest from the files). */
export const newCustomTemplateSchema = z.object({
  name: customTemplateSchema.shape.name,
  category: z.string().trim().min(1).max(40).optional(),
  description: customTemplateSchema.shape.description,
  baseId: z.string().max(80).nullable().default(null),
  videoId: z.string().refine(isId, "Choose a video"),
  audioId: z.string().refine(isId).optional(),
});
export const customTemplatePatchSchema = z
  .object({
    name: customTemplateSchema.shape.name.optional(),
    category: z.string().trim().min(1).max(40).optional(),
    description: customTemplateSchema.shape.description,
    /** a new video (e.g. the old one was deleted from My Assets) */
    videoId: z.string().refine(isId, "Choose a video").optional(),
    /** a new sound, or null to have none */
    audioId: z.string().refine(isId).nullable().optional(),
  })
  .strict();
/** A template as the library gets it: which of its files are gone from My Assets. */
export type CustomTemplateStatus = CustomTemplate & { missing?: { video?: true; audio?: true } };

const uploadSchema = z.object({ assetId: z.string().refine(isId), kind: z.enum(["video", "audio"]), name: z.string().max(200), addedAt: z.number().int(), userId: z.string().max(80).optional() });
export type TemplateUpload = z.infer<typeof uploadSchema>;
const fileSchema = z.object({ templates: z.array(customTemplateSchema).default([]), uploads: z.array(uploadSchema).default([]) });
type TemplatesFile = z.infer<typeof fileSchema>;

export class TemplateError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** A route's answer for a failed template change. */
export function templateErrorResponse(e: unknown): Response {
  if (e instanceof TemplateError) return apiError(e.status, e.code, e.message);
  if (e instanceof ZodError) return apiError(400, "bad_template", e.issues[0]?.message ?? "Check the template's details.");
  return apiError(500, "template_failed", "Couldn't save the template.");
}

const FILE = () => storagePath("templates.json");

async function read(): Promise<TemplatesFile> {
  const raw = await readJson<unknown>(FILE());
  const p = fileSchema.safeParse(raw ?? {});
  return p.success ? p.data : { templates: [], uploads: [] };
}

// one change at a time (two quick saves mustn't lose one)
let queue: Promise<unknown> = Promise.resolve();
function change<T>(fn: (f: TemplatesFile) => Promise<T> | T): Promise<T> {
  const run = queue.then(async () => {
    const f = await read();
    const out = await fn(f);
    await writeJson(FILE(), f);
    return out;
  });
  queue = run.catch(() => undefined);
  return run;
}

/** The ratio a video fits best: 16:9, 9:16 or 1:1. */
export function ratioOf(width: number, height: number): TemplateRatio {
  const r = width / Math.max(1, height);
  return r > 1.25 ? "16:9" : r < 0.8 ? "9:16" : "1:1";
}

const refOf = (m: VideoMeta): TemplateMediaRef => ({ assetId: m.id, name: m.fileName.slice(0, 200), duration: m.info.duration, ...(m.info.width ? { width: m.info.width, height: m.info.height } : {}) });

async function mediaOf(id: string, want: "video" | "audio", userId?: string): Promise<VideoMeta> {
  const m = await getVideo(id);
  // (someone else's upload: as if it weren't there)
  if (!m || (userId && m.userId && m.userId !== "local" && m.userId !== userId)) throw new TemplateError(404, "not_found", want === "video" ? "That video is no longer here. Upload it again." : "That sound is no longer here. Upload it again.");
  if (kindOf(m) !== want) throw new TemplateError(400, "wrong_kind", want === "video" ? "Choose a video file for the template's video." : "Choose a sound file (MP3, WAV, M4A…) for the template's audio.");
  return m;
}

/**
 * Whose a template or upload is: its own userId, else (older ones) the person who uploaded its file; null when
 * nobody can be told (open to anyone signed in, like files from before files had owners).
 */
async function ownerOf(x: { userId?: string }, assetId: string): Promise<string | null> {
  if (x.userId) return x.userId;
  const m = await getVideo(assetId);
  return m?.userId && m.userId !== "local" ? m.userId : null;
}
const mine = async <T extends { userId?: string }>(items: T[], userId: string, asset: (x: T) => string): Promise<T[]> => {
  const owners = await Promise.all(items.map((x) => ownerOf(x, asset(x))));
  return items.filter((_, i) => owners[i] === null || owners[i] === userId);
};

/** Every template on the server (for keeping their files: lib/storage, templatesUsing). */
export async function listAllCustom(): Promise<CustomTemplate[]> {
  return (await read()).templates;
}
/** Your templates. */
export async function listCustom(userId: string): Promise<CustomTemplate[]> {
  return mine((await read()).templates, userId, (t) => t.video.assetId);
}

/** Your templates, each marked with the files that were deleted from My Assets (so the library can say so). */
export async function listCustomWithStatus(userId: string): Promise<CustomTemplateStatus[]> {
  return Promise.all(
    (await listCustom(userId)).map(async (t) => {
      const video = !(await getVideo(t.video.assetId));
      const audio = !!t.audio && !(await getVideo(t.audio.assetId));
      return video || audio ? { ...t, missing: { ...(video ? { video: true as const } : {}), ...(audio ? { audio: true as const } : {}) } } : t;
    }),
  );
}

/** The templates that use this file (its video or its sound): it mustn't be deleted from My Assets while they do. */
export async function templatesUsing(assetId: string): Promise<CustomTemplate[]> {
  return (await listAllCustom()).filter((t) => t.video.assetId === assetId || t.audio?.assetId === assetId);
}

export async function createCustom(userId: string, input: z.input<typeof newCustomTemplateSchema>): Promise<CustomTemplate> {
  const i = newCustomTemplateSchema.parse(input);
  if (i.baseId && !BROADCAST_TEMPLATES_BY_ID.has(i.baseId)) throw new TemplateError(400, "bad_base", "That base look doesn't exist.");
  const video = await mediaOf(i.videoId, "video", userId);
  const audio = i.audioId ? await mediaOf(i.audioId, "audio", userId) : null;
  // a look is laid out for its own shape (a 16:9 ticker doesn't fit a tall video)
  const ratio = ratioOf(video.info.width, video.info.height);
  const base = i.baseId ? BROADCAST_TEMPLATES_BY_ID.get(i.baseId) : undefined;
  if (base && base.aspectRatio !== ratio) throw new TemplateError(400, "ratio_mismatch", `The ${base.name} look is made for ${base.aspectRatio} videos, and this video is ${ratio}. Choose another look, or None.`);
  const t: CustomTemplate = customTemplateSchema.parse({
    id: newId(),
    name: i.name,
    category: i.category ?? MY_TEMPLATES,
    ...(i.description ? { description: i.description } : {}),
    aspectRatio: ratio,
    baseId: i.baseId,
    video: refOf(video),
    ...(audio ? { audio: refOf(audio) } : {}),
    createdAt: Date.now(),
    userId,
  });
  return change((f) => {
    f.templates.unshift(t);
    return t;
  });
}

export async function updateCustom(userId: string, id: string, patch: z.input<typeof customTemplatePatchSchema>): Promise<CustomTemplate> {
  const { videoId, audioId, ...p } = customTemplatePatchSchema.parse(patch);
  // (the files are checked before the change: a missing or wrong file changes nothing)
  const video = videoId ? await mediaOf(videoId, "video", userId) : null;
  const audio = audioId ? await mediaOf(audioId, "audio", userId) : null;
  const own = new Set((await listCustom(userId)).map((t) => t.id));
  return change((f) => {
    const i = f.templates.findIndex((t) => t.id === id);
    if (i < 0 || !own.has(id)) throw new TemplateError(404, "not_found", "That template is no longer here.");
    const cur = f.templates[i];
    const next: Record<string, unknown> = { ...cur, ...p };
    if (video) {
      const ratio = ratioOf(video.info.width, video.info.height);
      const base = cur.baseId ? BROADCAST_TEMPLATES_BY_ID.get(cur.baseId) : undefined;
      if (base && base.aspectRatio !== ratio) throw new TemplateError(400, "ratio_mismatch", `The ${base.name} look is made for ${base.aspectRatio} videos, and this video is ${ratio}. Choose a ${base.aspectRatio} video.`);
      next.video = refOf(video);
      next.aspectRatio = ratio;
    }
    if (audio) next.audio = refOf(audio);
    else if (audioId === null) delete next.audio;
    f.templates[i] = customTemplateSchema.parse(next);
    return f.templates[i];
  });
}

/** Remove a template (its files stay in My Assets). */
export async function deleteCustom(userId: string, id: string): Promise<boolean> {
  const own = new Set((await listCustom(userId)).map((t) => t.id));
  if (!own.has(id)) return false;
  return change((f) => {
    const n = f.templates.length;
    f.templates = f.templates.filter((t) => t.id !== id);
    return f.templates.length < n;
  });
}

/** A clip or sound uploaded in the template pane: remembered so it shows (and works) after a reload. */
export async function rememberUpload(userId: string, assetId: string, kind: "video" | "audio"): Promise<TemplateUpload> {
  const m = await mediaOf(assetId, kind, userId);
  return change((f) => {
    const u: TemplateUpload = { assetId, kind, name: m.fileName.slice(0, 200), addedAt: Date.now(), userId };
    f.uploads = [u, ...f.uploads.filter((x) => x.assetId !== assetId)].slice(0, 200);
    return u;
  });
}

/** The remembered pane uploads whose files are still here, newest first. */
export async function listUploads(userId: string): Promise<{ upload: TemplateUpload; meta: VideoMeta }[]> {
  const uploads = await mine((await read()).uploads, userId, (u) => u.assetId);
  const out = await Promise.all(uploads.map(async (u) => ({ upload: u, meta: await getVideo(u.assetId) })));
  return out.filter((x): x is { upload: TemplateUpload; meta: VideoMeta } => !!x.meta);
}

/** Sounds of your templates and pane uploads, for the Audio library ("My uploads"). */
export async function templateSounds(userId: string): Promise<{ assetId: string; name: string; template: string | null }[]> {
  const f = await read();
  const [templates, uploads] = await Promise.all([mine(f.templates, userId, (t) => t.video.assetId), mine(f.uploads, userId, (u) => u.assetId)]);
  const seen = new Map<string, { assetId: string; name: string; template: string | null }>();
  for (const t of templates) if (t.audio && !seen.has(t.audio.assetId)) seen.set(t.audio.assetId, { assetId: t.audio.assetId, name: t.audio.name, template: t.name });
  for (const u of uploads) if (u.kind === "audio" && !seen.has(u.assetId)) seen.set(u.assetId, { assetId: u.assetId, name: u.name, template: null });
  return [...seen.values()];
}
