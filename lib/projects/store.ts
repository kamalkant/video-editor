import { readdir, rename, writeFile } from "node:fs/promises";
import { ZodError } from "zod";
import { mediaIdsOf, mediaLiteOf, sanitizeDoc, type MediaLite, type TimelineDoc } from "../edit/doc";
import { ensureDir, isId, newId, readJson, removeDir, storagePath } from "../storage";
import { getVideo } from "../videos";
import { migrateProject, newProject, projectMediaIds, projectNameSchema, summaryOf, type Project, type ProjectSummary } from "./model";

const dir = (id: string) => storagePath("projects", id);
const file = (id: string) => storagePath("projects", id, "project.json");

// one write at a time per project, so autosaves never land out of order (versions use it too)
const chains = new Map<string, Promise<unknown>>();
export function serial<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const run = (chains.get(id) ?? Promise.resolve()).catch(() => undefined).then(fn);
  chains.set(id, run);
  void run.finally(() => chains.get(id) === run && chains.delete(id)).catch(() => undefined);
  return run;
}

/** Write + rename: a crash mid-save never leaves a half-written file. */
export async function writeAtomic(path: string, data: unknown) {
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, path);
}

async function write(p: Project) {
  await ensureDir(dir(p.id));
  await writeAtomic(file(p.id), p);
}

/** The uploads behind these ids, as the timeline needs them (unknown ids are left out). */
export async function mediaMap(ids: string[]): Promise<Record<string, MediaLite>> {
  const metas = await Promise.all(ids.map(getVideo));
  const out: Record<string, MediaLite> = {};
  for (const m of metas) if (m) out[m.id] = mediaLiteOf(m);
  return out;
}

/** Check and clean a timeline sent by the editor (only uploads that exist on this computer). */
export async function cleanDoc(doc: TimelineDoc): Promise<TimelineDoc> {
  const media = await mediaMap(mediaIdsOf(doc));
  return sanitizeDoc(doc, (id) => media[id] ?? null);
}

export async function getProject(id: string, userId?: string): Promise<Project | null> {
  if (!isId(id)) return null;
  const raw = await readJson<unknown>(file(id));
  if (!raw) return null;
  try {
    const media = await mediaMap(projectMediaIds(raw));
    const project = migrateProject(raw, (m) => media[m] ?? null);
    if (userId !== undefined && project.userId !== userId) {
      return null;
    }
    return project;
  } catch {
    return null;
  }
}

export async function listProjects(userId?: string): Promise<Project[]> {
  let ids: string[] = [];
  try {
    ids = (await readdir(storagePath("projects"))).filter(isId);
  } catch {
    return [];
  }
  const all = await Promise.all(ids.map((id) => getProject(id, userId)));
  return all.filter((p): p is Project => !!p).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function summarize(p: Project): Promise<ProjectSummary> {
  const media = await mediaMap(mediaIdsOf(p.doc));
  return summaryOf(p, (id) => !!media[id]);
}

export class ProjectError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function createProject(o: {
  id?: string;
  name: string;
  doc: TimelineDoc;
  jobId?: string | null;
  userId?: string | null;
}): Promise<Project> {
  const pid = o.id && isId(o.id) ? o.id : newId();
  const p = newProject({
    id: pid,
    name: o.name,
    doc: await cleanDoc(o.doc),
    now: Date.now(),
    jobId: o.jobId,
    userId: o.userId ?? null,
  });
  await serial(p.id, () => write(p));
  return p;
}

export type ProjectPatch = { name?: unknown; doc?: TimelineDoc; jobId?: string | null };

export async function updateProject(id: string, patch: ProjectPatch, userId?: string): Promise<Project> {
  return serial(id, async () => {
    const p = await getProject(id, userId);
    if (!p) throw new ProjectError(404, "not_found", "This project was deleted.");
    let next = p;
    if (patch.name !== undefined) {
      try {
        next = { ...next, name: projectNameSchema.parse(patch.name) };
      } catch (e) {
        throw new ProjectError(400, "bad_name", e instanceof ZodError ? (e.issues[0]?.message ?? "Bad name") : "Bad name");
      }
    }
    if (patch.doc) next = { ...next, doc: await cleanDoc(patch.doc) };
    if (patch.jobId !== undefined) next = { ...next, jobId: patch.jobId };
    next = { ...next, updatedAt: Date.now() };
    await write(next);
    return next;
  });
}

export async function deleteProject(id: string, userId?: string): Promise<boolean> {
  if (!isId(id)) return false;
  return serial(id, async () => {
    if (!(await getProject(id, userId))) return false;
    await removeDir(dir(id));
    return true;
  });
}

/** Uploads and exports that projects still use: the 24-hour cleanup keeps them. */
export async function referencedIds(): Promise<{ videos: Set<string>; jobs: Set<string> }> {
  const videos = new Set<string>();
  const jobs = new Set<string>();
  for (const p of await listProjects()) {
    for (const m of mediaIdsOf(p.doc)) videos.add(m);
    if (p.jobId) jobs.add(p.jobId);
  }
  return { videos, jobs };
}

/** Projects using an upload (to refuse deleting it). */
export async function projectsUsingVideo(videoId: string): Promise<Project[]> {
  return (await listProjects()).filter((p) => mediaIdsOf(p.doc).includes(videoId));
}
