"use client";

import { useSyncExternalStore } from "react";
import type { Job } from "../jobs/queue";

/**
 * The running export's latest progress, outside the editor's state: an export made in this browser reports
 * a few times a second, and putting each report in the editor's state re-rendered all of it (the preview
 * redrew the same frame each time). The editor keeps the job only when its shape changes (jobShape); what
 * shows the percent (the dialog, the top bar, the tab) reads it here.
 */

const latest = new Map<string, Job>();
const listeners = new Set<() => void>();

/** The job's newest report. */
export function publishJob(job: Job) {
  const had = latest.get(job.id);
  if (had && had.updatedAt > job.updatedAt) return;
  latest.set(job.id, job);
  // (only the last few exports are kept)
  if (latest.size > 8) latest.delete(latest.keys().next().value!);
  for (const l of listeners) l();
}

/** What the editor itself needs to know: the job's state and each step's (not the percent). */
export const jobShape = (job: Pick<Job, "id" | "state" | "steps">) => `${job.id}|${job.state}|${job.steps.map((s) => s.state).join(",")}`;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The newest report of the same job (its percent as it is now), else `job` itself. */
export function liveJobOf<J extends Job | null>(job: J): J {
  if (!job) return job;
  const l = latest.get(job.id);
  return (l && l.updatedAt >= job.updatedAt ? l : job) as J;
}

/** `job` with its percent as it is now (re-renders the caller, not the editor, on each report). */
export function useLiveJob<J extends Job | null>(job: J): J {
  return useSyncExternalStore(
    subscribe,
    () => liveJobOf(job),
    () => job,
  );
}
