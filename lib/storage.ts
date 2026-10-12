import { randomUUID } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { dataRoot } from "./dataRoot";

export const STORAGE_ROOT = resolve(
  /*turbopackIgnore: true*/ process.env.VDO_STORAGE ??
    join(dataRoot(), "storage"),
);
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function newId(): string {
  return randomUUID();
}

export function isId(id: unknown): id is string {
  return typeof id === "string" && UUID.test(id);
}

/** Resolve a path inside storage; refuses anything that escapes the root. */
export function storagePath(...parts: string[]): string {
  const p = resolve(STORAGE_ROOT, ...parts);
  if (p !== STORAGE_ROOT && !p.startsWith(STORAGE_ROOT + sep))
    throw new Error("Path escapes storage");
  return p;
}

export const videoDir = (id: string) => storagePath("videos", id);
export const jobDir = (id: string) => storagePath("jobs", id);

export async function ensureDir(p: string) {
  await mkdir(p, { recursive: true });
}

export async function writeJson(path: string, data: unknown) {
  await writeFile(path, JSON.stringify(data, null, 2));
}

export async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function removeDir(p: string) {
  await rm(p, { recursive: true, force: true });
}

/**
 * Videos and exports used by a project. Read straight from the project files
 * (no import of the project module, which depends on this one). Returns null
 * if a project can't be read: then nothing is deleted, to be safe.
 */
export async function projectReferences(): Promise<{
  videos: Set<string>;
  jobs: Set<string>;
} | null> {
  const videos = new Set<string>();
  const jobs = new Set<string>();
  let ids: string[] = [];
  try {
    ids = (await readdir(storagePath("projects"))).filter(isId);
  } catch {
    // no projects yet: the Brand Kit's and templates' files below still count
    ids = [];
  }
  type Stored = {
    videoId?: unknown;
    jobId?: unknown;
    tracks?: { clips?: { videoId?: unknown }[] }[];
    doc?: {
      tracks?: {
        clips?: { mediaId?: unknown; patches?: { mediaId?: unknown }[] }[];
      }[];
      canvas?: { backdrop?: { mediaId?: unknown } };
      watermark?: { mediaId?: unknown };
    };
  };
  const add = (p: Stored | undefined, withJob = true) => {
    if (!p) return;
    if (isId(p.videoId)) videos.add(p.videoId);
    if (withJob && isId(p.jobId)) jobs.add(p.jobId);
    for (const t of p.tracks ?? [])
      for (const c of t.clips ?? []) if (isId(c.videoId)) videos.add(c.videoId);
    for (const t of p.doc?.tracks ?? [])
      for (const c of t.clips ?? []) {
        if (isId(c.mediaId)) videos.add(c.mediaId);
        for (const x of c.patches ?? [])
          if (isId(x.mediaId)) videos.add(x.mediaId);
      }
    if (isId(p.doc?.canvas?.backdrop?.mediaId))
      videos.add(p.doc.canvas.backdrop.mediaId);
    if (isId(p.doc?.watermark?.mediaId)) videos.add(p.doc.watermark.mediaId);
  };
  for (const id of ids) {
    try {
      add(
        JSON.parse(
          await readFile(storagePath("projects", id, "project.json"), "utf8"),
        ) as Stored,
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") continue; // deleted meanwhile
      return null;
    }
    // its saved versions (lib/projects/versions) keep their uploads too
    let versions: string[] = [];
    try {
      versions = (
        await readdir(storagePath("projects", id, "versions"))
      ).filter((n) => n.endsWith(".json"));
    } catch {
      /* none */
    }
    for (const v of versions) {
      try {
        // (only the uploads: a version's old export may go)
        add(
          (
            JSON.parse(
              await readFile(
                storagePath("projects", id, "versions", v),
                "utf8",
              ),
            ) as { project?: Stored }
          ).project,
          false,
        );
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") continue;
        return null;
      }
    }
  }
  // the Brand Kit's logo, intro and outro (read here: lib/brand depends on this module)
  try {
    const b = JSON.parse(
      await readFile(storagePath("brand.json"), "utf8"),
    ) as Record<string, unknown>;
    for (const k of ["logo", "intro", "outro"])
      if (isId(b[k])) videos.add(b[k] as string);
    if (Array.isArray(b.videos)) {
      for (const v of b.videos) {
        if (
          v &&
          typeof v === "object" &&
          "id" in v &&
          isId((v as { id: unknown }).id)
        ) {
          videos.add((v as { id: string }).id);
        }
      }
    }
  } catch {
    /* no Brand Kit yet */
  }
  // your templates' video and sound, and the clips / sounds uploaded in the template pane (lib/templates/custom)
  try {
    const t = JSON.parse(
      await readFile(storagePath("templates.json"), "utf8"),
    ) as {
      templates?: {
        video?: { assetId?: unknown };
        audio?: { assetId?: unknown };
      }[];
      uploads?: { assetId?: unknown }[];
    };
    for (const x of t.templates ?? [])
      for (const m of [x?.video, x?.audio])
        if (isId(m?.assetId)) videos.add(m.assetId);
    for (const u of t.uploads ?? [])
      if (isId(u?.assetId)) videos.add(u.assetId);
  } catch (e) {
    // (unreadable but there: keep everything, to be safe)
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") return null;
  }
  return { videos, jobs };
}

/** Delete uploads and results older than 24 hours, except those a project uses. */
export async function cleanupOld(now = Date.now()) {
  const keep = await projectReferences();
  if (!keep) return;
  for (const kind of ["videos", "jobs"] as const) {
    const base = storagePath(kind);
    let entries: string[] = [];
    try {
      entries = await readdir(base);
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!isId(e) || keep[kind].has(e)) continue;
      // pictures, voices and videos made by Gemini were paid for: never cleaned up
      if (
        kind === "videos" &&
        (await readJson<{ ai?: unknown }>(join(base, e, "meta.json")))?.ai
      )
        continue;
      try {
        const st = await stat(join(base, e));
        if (now - st.mtimeMs > MAX_AGE_MS) await removeDir(join(base, e));
      } catch {
        /* already gone */
      }
    }
  }
}

const g = globalThis as unknown as { __VDOCleanup?: NodeJS.Timeout };
/** Start the hourly cleanup once per server process. */
export function startCleanup() {
  if (g.__VDOCleanup) return;
  const run = () => {
    void cleanupOld();
    // text pictures drawn for exports (lib/renders; imported late: it depends on this module)
    void import("./renders")
      .then((r) => r.cleanupRenders())
      .catch(() => undefined);
  };
  run();
  g.__VDOCleanup = setInterval(run, 60 * 60 * 1000);
  g.__VDOCleanup.unref?.();
}
