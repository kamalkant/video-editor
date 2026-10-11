"use client";

import { useEffect, useRef, useState } from "react";
import type { Job } from "./queue";

const TERMINAL = ["done", "failed", "canceled"];

/** Poll a job with a setTimeout chain (never overlapping) and backoff on errors. */
/** onDone gets `fresh` = true when the job finished while this page watched it (not an old result). */
export function useJobPolling(jobId: string | null, onDone?: (job: Job, fresh: boolean) => void) {
  const [job, setJob] = useState<Job | null>(null);
  const [connection, setConnection] = useState<"ok" | "retrying" | "gone">("ok");
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    let seenActive = false;
    const ac = new AbortController();
    const tick = async () => {
      if (document.hidden) {
        timer = setTimeout(tick, 1000);
        return;
      }
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { signal: ac.signal, cache: "no-store" });
        if (res.status === 404) {
          setConnection("gone");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json()) as Job;
        if (!alive) return;
        failures = 0;
        setConnection("ok");
        setJob(j);
        if (TERMINAL.includes(j.state)) {
          if (j.state === "done") done.current?.(j, seenActive);
          return;
        }
        seenActive = true;
        timer = setTimeout(tick, j.state === "queued" ? 1500 : 1000);
      } catch (e) {
        if ((e as Error).name === "AbortError" || !alive) return;
        failures++;
        if (failures >= 2) setConnection("retrying");
        timer = setTimeout(tick, Math.min(10_000, 1000 * 2 ** (failures - 1)));
      }
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
      ac.abort();
    };
  }, [jobId]);

  return { job: job && job.id === jobId ? job : null, connection };
}
