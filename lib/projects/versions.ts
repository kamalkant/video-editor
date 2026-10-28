import { readdir, rm } from "node:fs/promises";
import { z } from "zod";
import {
  clipCount,
  docDuration,
  mediaIdsOf,
  type TimelineDoc,
} from "../edit/doc";
import { ensureDir, isId, newId, readJson, storagePath } from "../storage";
import { getVideo, type VideoMeta } from "../videos";
import { migrateProject, projectMediaIds, projectNameSchema } from "./model";
import {
  getProject,
  mediaMap,
  ProjectError,
  serial,
  writeAtomic,
} from "./store";

/**
 * Saved versions of a project: a named copy of the timeline at one moment,
 * to go back to later. Kept next to the project (projects/<id>/versions/<vid>.json),
 * so deleting the project deletes them. Each holds the whole project record as it
 * was, read back like a project (older timelines are converted).
 */

import { VERSIONS_MAX, type VersionSummary } from "./versionList";
export { VERSIONS_MAX, type VersionSummary };

const vdir = (pid: string) => storagePath("projects", pid, "versions");
const vfile = (pid: string, vid: string) =>
  storagePath("projects", pid, "versions", `${vid}.json`);

const fileSchema = z.object({
  kind: z.literal("VDO-version"),
  version: z.literal(1),
  id: z.string().refine(isId),
  name: projectNameSchema,
  createdAt: z.number().int().nonnegative(),
  /** made by the editor (before a restore), not by you */
  auto: z.boolean().optional(),
  project: z.unknown(),
});
type VersionFile = z.infer<typeof fileSchema>;


async function readVersion(
  pid: string,
  vid: string,
): Promise<VersionFile | null> {
  if (!isId(pid) || !isId(vid)) return null;
  const r = fileSchema.safeParse(await readJson<unknown>(vfile(pid, vid)));
  return r.success ? r.data : null;
}

async function allFiles(pid: string): Promise<VersionFile[]> {
  let names: string[] = [];
  try {
    names = await readdir(vdir(pid));
  } catch {
    return [];
  }
  const ids = names
    .filter((n) => n.endsWith(".json"))
    .map((n) => n.slice(0, -5))
    .filter(isId);
  const files = await Promise.all(ids.map((v) => readVersion(pid, v)));
  return files
    .filter((f): f is VersionFile => !!f)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** A version's timeline as the editor can use it now (clips whose upload is gone are left out). */
async function docOf(
  f: VersionFile,
): Promise<{ doc: TimelineDoc; missing: number }> {
  const ids = projectMediaIds(f.project);
  const media = await mediaMap(ids);
  const doc = migrateProject(f.project, (m) => media[m] ?? null).doc;
  return { doc, missing: ids.filter((m) => !media[m]).length };
}

async function summaryOf(f: VersionFile): Promise<VersionSummary> {
  const { doc, missing } = await docOf(f);
  return {
    id: f.id,
    name: f.name,
    createdAt: f.createdAt,
    auto: !!f.auto,
    duration: Math.round(docDuration(doc) * 10) / 10,
    clips: clipCount(doc),
    missing,
  };
}

export async function listVersions(pid: string): Promise<VersionSummary[]> {
  if (!(await getProject(pid)))
    throw new ProjectError(404, "not_found", "This project was deleted.");
  return Promise.all((await allFiles(pid)).map(summaryOf));
}

/**
 * Save the project as it is on disk now (the editor saves your latest change
 * first). No name: "Version N".
 */
export async function saveVersion(
  pid: string,
  o: { name?: unknown; auto?: boolean } = {},
  now = Date.now(),
): Promise<VersionSummary> {
  return serial(pid, async () => {
    const p = await getProject(pid);
    if (!p)
      throw new ProjectError(404, "not_found", "This project was deleted.");
    const files = await allFiles(pid);
    let name: string;
    if (
      o.name === undefined ||
      (typeof o.name === "string" && !o.name.trim())
    ) {
      name = `Version ${files.filter((f) => !f.auto).length + 1}`;
    } else {
      const r = projectNameSchema.safeParse(o.name);
      if (!r.success)
        throw new ProjectError(
          400,
          "bad_name",
          r.error.issues[0]?.message ?? "Bad name",
        );
      name = r.data;
    }
    const f: VersionFile = {
      kind: "VDO-version",
      version: 1,
      id: newId(),
      name,
      createdAt: Math.max(now, (files[0]?.createdAt ?? 0) + 1),
      ...(o.auto ? { auto: true } : {}),
      project: p,
    };
    await ensureDir(vdir(pid));
    await writeAtomic(vfile(pid, f.id), f);
    // too many: drop the oldest automatic ones, then the oldest
    const extra = files.length + 1 - VERSIONS_MAX;
    if (extra > 0) {
      const byAge = [...files].reverse();
      const drop = [
        ...byAge.filter((x) => x.auto),
        ...byAge.filter((x) => !x.auto),
      ].slice(0, extra);
      await Promise.all(drop.map((x) => rm(vfile(pid, x.id), { force: true })));
    }
    return summaryOf(f);
  });
}

/** A version to put back on the timeline, with its uploads. */
export async function getVersion(
  pid: string,
  vid: string,
): Promise<{
  version: VersionSummary;
  doc: TimelineDoc;
  media: VideoMeta[];
} | null> {
  const f = await readVersion(pid, vid);
  if (!f) return null;
  const { doc } = await docOf(f);
  const media = (await Promise.all(mediaIdsOf(doc).map(getVideo))).filter(
    (m): m is VideoMeta => !!m,
  );
  return { version: await summaryOf(f), doc, media };
}

export async function deleteVersion(
  pid: string,
  vid: string,
): Promise<boolean> {
  return serial(pid, async () => {
    if (!(await readVersion(pid, vid))) return false;
    await rm(vfile(pid, vid), { force: true });
    return true;
  });
}
