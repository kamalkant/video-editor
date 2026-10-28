import { clipCount, docDuration, type TimelineDoc } from "../edit/doc";

/**
 * The rules of a project's saved versions, shared by the browser's store (lib/storage/workspace) and the
 * server's older one (lib/projects/versions): no server code here.
 */

/** Versions kept per project (the oldest automatic ones go first). */
export const VERSIONS_MAX = 50;

export type VersionSummary = {
  id: string;
  name: string;
  createdAt: number;
  auto: boolean;
  duration: number;
  clips: number;
  /** uploads it uses that are gone */ missing: number;
};

type Saved = { id: string; createdAt: number; auto?: boolean };

/** The name of a new version you didn't name: "Version N", counting only your own (not the automatic ones). */
export const nextVersionName = (existing: Saved[]) => `Version ${existing.filter((v) => !v.auto).length + 1}`;

/** The versions to delete so that one more fits: the oldest automatic ones, then the oldest. */
export function versionsToDrop<T extends Saved>(existing: T[], max = VERSIONS_MAX): T[] {
  const extra = existing.length + 1 - max;
  if (extra <= 0) return [];
  const byAge = [...existing].sort((a, b) => a.createdAt - b.createdAt);
  return [...byAge.filter((x) => x.auto), ...byAge.filter((x) => !x.auto)].slice(0, extra);
}

/** What the list shows of a version. */
export function versionSummaryOf(v: Saved & { name: string }, doc: TimelineDoc, missing = 0): VersionSummary {
  return { id: v.id, name: v.name, createdAt: v.createdAt, auto: !!v.auto, duration: Math.round(docDuration(doc) * 10) / 10, clips: clipCount(doc), missing };
}
