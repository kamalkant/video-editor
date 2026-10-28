import { z } from "zod";
import { clipCount, clipLength, docDuration, docFromSpec, docSchema, mainTrack, sanitizeDoc, type AnyClip, type MediaLite, type TimelineDoc } from "../edit/doc";
import { opInstanceSchema, outputSchema, sanitizeSpec, type EditSpec } from "../edit/spec";

/**
 * Project v3: a name plus its timeline (lib/edit/doc.ts: canvas, tracks of
 * clips from many uploads, per-clip effects, export settings) and the latest
 * export. Older projects (v2: one video's parts; v1: { videoId, spec }) are
 * converted when read.
 */

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const localId = z.string().regex(/^[\w-]{1,40}$/);

export const NAME_MAX = 80;

/** A project link opened where the project isn't: projects are kept in the browser they were made in. */
export const PROJECT_NOT_HERE =
  "That project isn't saved in this browser. Projects stay in the browser they were made in: open it there, or save it as a .vdo file (Projects) and import it here.";
export const projectNameSchema = z
  .string()
  .transform((s) => s.replace(/\s+/g, " ").trim().slice(0, NAME_MAX))
  .pipe(z.string().min(1, "Give the project a name."));

export const projectSchema = z.object({
  version: z.literal(3),
  id: uuid,
  name: projectNameSchema,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  doc: docSchema,
  /** The latest export, shown again when the project is opened. */
  jobId: uuid.nullable(),
  userId: z.string().nullable().optional(),
});
export type Project = z.infer<typeof projectSchema>;

export function newProject(o: { id: string; name: string; doc: TimelineDoc; now: number; jobId?: string | null; userId?: string | null }): Project {
  return projectSchema.parse({ version: 3, id: o.id, name: o.name, createdAt: o.now, updatedAt: o.now, doc: o.doc, jobId: o.jobId ?? null, userId: o.userId ?? null });
}

/** A project name from a file name: "Anchor Intro.mp4" → "Anchor Intro". */
export function nameFromFile(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
  return (base || "Untitled project").slice(0, NAME_MAX);
}

// ---------- older projects ----------

const v2ClipSchema = z.object({ id: localId, videoId: uuid, start: z.number(), in: z.number().min(0), out: z.number().positive().nullable(), ops: z.array(opInstanceSchema).max(20) });
const v2Schema = z.object({
  version: z.literal(2),
  id: uuid,
  name: projectNameSchema,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  tracks: z.array(z.object({ id: localId, kind: z.literal("video"), clips: z.array(v2ClipSchema).max(100) })).length(1),
  output: outputSchema,
  jobId: uuid.nullable(),
});
const v1Schema = z.object({ id: uuid, name: z.string().optional(), videoId: uuid, spec: z.unknown(), createdAt: z.number().optional(), updatedAt: z.number().optional(), jobId: uuid.nullable().optional() });

/** Every upload a stored project refers to, whatever its version (to look them up before converting). */
export function projectMediaIds(raw: unknown): string[] {
  const o = (raw ?? {}) as { version?: unknown; videoId?: unknown; tracks?: { clips?: { videoId?: unknown }[] }[]; doc?: { tracks?: { clips?: { mediaId?: unknown; patches?: { mediaId?: unknown }[] }[] }[]; canvas?: { backdrop?: { mediaId?: unknown } }; watermark?: { mediaId?: unknown } } };
  const ids = new Set<string>();
  const add = (v: unknown) => typeof v === "string" && uuid.safeParse(v).success && ids.add(v);
  add(o.videoId);
  for (const t of o.tracks ?? []) for (const c of t.clips ?? []) add(c.videoId);
  for (const t of o.doc?.tracks ?? [])
    for (const c of t.clips ?? []) {
      add(c.mediaId);
      // pictures that cover a watermark
      for (const x of c.patches ?? []) add(x.mediaId);
    }
  // a picture / video backdrop and your logo (else loading the project would drop them)
  add(o.doc?.canvas?.backdrop?.mediaId);
  add(o.doc?.watermark?.mediaId);
  return [...ids];
}

/** Read a stored project of any version as v3. `media` knows the uploads (for sizes and lengths). */
export function migrateProject(input: unknown, media: (id: string) => MediaLite | null): Project {
  const o = (input ?? {}) as Record<string, unknown>;
  if (o.version === 3) {
    const p = projectSchema.parse(input);
    return { ...p, doc: sanitizeDoc(p.doc, media) };
  }
  if (o.version === 2) {
    const p = v2Schema.parse(input);
    const clips = p.tracks[0].clips;
    const m = clips[0] ? media(clips[0].videoId) : null;
    // v2 held the parts of one video, all with the same effects
    const cut = clips.length > 1 || (clips[0] && (clips[0].in > 0 || clips[0].out !== null));
    const spec: EditSpec = sanitizeSpec({
      version: 1,
      ops: clips[0]?.ops ?? [],
      output: p.output,
      ...(cut && m ? { timeline: { clips: clips.map((c) => ({ id: c.id, in: c.in, out: c.out ?? m.duration })) } } : {}),
    }, m ? { width: m.width, fps: m.fps, duration: m.duration } : undefined);
    return { version: 3, id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt, jobId: p.jobId, doc: sanitizeDoc(docFromSpec(spec, m), media) };
  }
  const legacy = v1Schema.parse(input);
  const spec = sanitizeSpec(z.object({ version: z.literal(1), ops: z.array(opInstanceSchema).max(20), output: outputSchema }).parse(legacy.spec));
  const now = legacy.updatedAt ?? legacy.createdAt ?? 0;
  return {
    version: 3,
    id: legacy.id,
    name: legacy.name?.trim() || "Untitled project",
    createdAt: legacy.createdAt ?? now,
    updatedAt: now,
    jobId: legacy.jobId ?? null,
    doc: sanitizeDoc(docFromSpec(spec, media(legacy.videoId)), media),
  };
}

/** The first picture or video on the timeline (for thumbnails), if any. */
export function coverMediaId(doc: TimelineDoc): string | null {
  // (a blank scene has no picture: the first clip that has one)
  const main = mainTrack(doc).clips.find((c) => "mediaId" in c);
  if (main && "mediaId" in main) return main.mediaId;
  for (const t of doc.tracks) for (const c of t.clips) if ((c.type === "video" || c.type === "image") && "mediaId" in c) return c.mediaId;
  return null;
}

/** What the project list shows. */
export type ProjectSummary = {
  id: string;
  name: string;
  updatedAt: number;
  /** Upload shown as the thumbnail. */
  coverId: string | null;
  /** Up to 4 different pictures (videos, images) in timeline order, for the thumbnail's collage. */
  coverIds?: string[];
  duration: number;
  clips: number;
  missing: boolean;
};

/** Up to `n` different pictures the timeline shows (Video 1 first, then the overlays), for a collage. */
export function coverMediaIds(doc: TimelineDoc, n = 4): string[] {
  const out: string[] = [];
  const add = (c: AnyClip) => {
    if ((c.type === "video" || c.type === "image") && "mediaId" in c && !out.includes(c.mediaId)) out.push(c.mediaId);
  };
  for (const c of mainTrack(doc).clips as AnyClip[]) add(c);
  for (const t of doc.tracks) if (t.kind === "overlay") for (const c of t.clips as AnyClip[]) add(c);
  return out.slice(0, n);
}

export function summaryOf(p: Project, known: (id: string) => boolean): ProjectSummary {
  const coverId = coverMediaId(p.doc);
  return { id: p.id, name: p.name, updatedAt: p.updatedAt, coverId: coverId && known(coverId) ? coverId : null, coverIds: coverMediaIds(p.doc).filter(known), duration: Math.round(docDuration(p.doc) * 10) / 10, clips: clipCount(p.doc), missing: !!coverId && !known(coverId) };
}

export { clipLength };
