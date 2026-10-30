"use client";

import { stepsPercent, useTask } from "@/lib/editor/tasks";
import { useLiveJob } from "@/lib/export/liveJob";
import { jobProgress } from "@/lib/export/progress";
import { useExportTab } from "@/lib/export/useExportTab";
import type { Job } from "@/lib/jobs/queue";

/**
 * How far the export is, in the tab's title and the top bar's list of tasks. Its own component: it reads the
 * live progress (lib/export/liveJob) and re-renders alone a few times a second, not the whole editor.
 */
export function ExportProgress(p: {
  job: Job | null;
  /** An export is being started (before its job exists). */
  starting: boolean;
  projectName: string;
  onOpen: () => void;
}) {
  const job = useLiveJob(p.job);
  const running = !!job && (job.state === "queued" || job.state === "running");
  // the tab says how far an export is (and when it's ready), and the screen stays awake meanwhile
  useExportTab({
    projectName: p.projectName,
    running,
    pct: jobProgress(job),
    done: job?.state === "done",
    jobId: job?.id ?? null,
  });
  const step = job?.steps.find((x) => x.state === "running");
  useTask(
    p.starting
      ? { id: "export", kind: "export", label: "Exporting", detail: "Starting…", percent: 0 }
      : !job || job.state === "canceled"
        ? null
        : {
            id: "export",
            kind: "export",
            label: running ? "Exporting" : job.state === "done" ? "Export ready" : "Export failed",
            detail: running ? step?.label : (job.error ?? undefined),
            percent: running ? stepsPercent(job.steps) : null,
            state: running ? "running" : job.state === "done" ? "done" : "failed",
          },
    p.onOpen,
  );
  return null;
}
