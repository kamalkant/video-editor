"use client";

import { useEffect, useRef, useState } from "react";
import { jobShape, publishJob } from "../export/liveJob";
import type { Job } from "./queue";

const TERMINAL = ["done", "failed", "canceled"];

/** Poll a job with a setTimeout chain (never overlapping) and backoff on errors. */
/** onDone gets `fresh` = true when the job finished while this page watched it (not an old result). */
export function useJobPolling(jobId: string | null, onDone?: (job: Job, fresh: boolean) => void) {
  const [job, setJob] = useState<Job | null>(null);
  const [connection, setConnectionState] = useState<"ok" | "retrying" | "gone">("ok");
  // (only when it changes: the same value set again still re-rendered the editor once on every poll)
  const conn = useRef<"ok" | "retrying" | "gone">("ok");
  const setConnection = (c: "ok" | "retrying" | "gone") => {
    if (conn.current === c) return;
    conn.current = c;
    setConnectionState(c);
  };
  const done = useRef(onDone);
  /** The job's shape last put in the state (its percent is in lib/export/liveJob). */
  const shape = useRef("");
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    shape.current = "";
    if (!jobId) {
      setJob(null);
      return;
    }
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
        // (each poll goes to what shows the percent; the editor re-renders only when the job's shape changes)
        publishJob(j);
        const s = jobShape(j);
        if (s !== shape.current) {
          shape.current = s;
          setJob(j);
        }
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
