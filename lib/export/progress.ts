import type { JobStep } from "../jobs/queue";

/** How much of an export each kind of step is (the files themselves are most of it). */
const WEIGHT: Partial<Record<JobStep["kind"], number>> = { derive: 5, crop: 5, matte: 30, poster: 2, zip: 3 };
const FILE_WEIGHT = 100;

/**
 * The whole export's progress (0–100): the steps weighed by how long they take. It only goes up as the export
 * runs (the running step's own percentage started again at 0 at each step); 100 only when it's done.
 */
export function jobProgress(job: { state: string; steps: JobStep[] } | null | undefined): number {
  if (!job) return 0;
  if (job.state === "done") return 100;
  let total = 0;
  let got = 0;
  for (const s of job.steps) {
    const w = WEIGHT[s.kind] ?? FILE_WEIGHT;
    total += w;
    got += w * (s.state === "done" ? 1 : s.state === "running" ? Math.min(100, Math.max(0, s.percent)) / 100 : 0);
  }
  return total ? Math.min(99, Math.floor((100 * got) / total)) : 0;
}
