"use client";

import { useEffect } from "react";

const restingTitle = (projectName: string) => `${projectName} · ViPlay Studio`;

/**
 * The editor's tab while an export runs: its title says how far it is ("42% · Exporting · Goa trip"), and
 * "✓ Export ready" when it finishes while you look elsewhere; the screen is kept awake meanwhile (a laptop
 * that sleeps stops an export made in the browser).
 */
export function useExportTab(p: { projectName: string; running: boolean; pct: number | null; done: boolean; jobId: string | null }) {
  const { projectName, running, pct, done, jobId } = p;

  useEffect(() => {
    document.title = running ? `${Math.round(pct ?? 0)}% · Exporting · ${projectName}` : restingTitle(projectName);
  }, [projectName, running, pct]);

  // ready while you were in another tab: said in the title until you come back
  useEffect(() => {
    if (!done || running || !document.hidden) return;
    document.title = `✓ Export ready · ${projectName}`;
    const back = () => {
      if (document.hidden) return;
      document.title = restingTitle(projectName);
      document.removeEventListener("visibilitychange", back);
    };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, [done, running, jobId, projectName]);

  useEffect(() => {
    if (!running || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let alive = true;
    let lock: WakeLockSentinel | null = null;
    const take = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock.request("screen").then(
        (l) => {
          if (alive) lock = l;
          else void l.release().catch(() => undefined);
        },
        () => undefined, // (not allowed here: the export runs anyway)
      );
    };
    take();
    // (the browser lets go of it when the tab is hidden: taken again on return)
    const onVisible = () => {
      if (!lock || lock.released) take();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [running]);
}
