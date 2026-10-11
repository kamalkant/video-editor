"use client";

/**
 * Background tasks (the top bar's list): exports, Veo videos, uploads, AI
 * cut-outs, steadied / reversed copies, subtitles, link imports. Whatever does
 * the work reports it here (useTask from React state, runTask around a
 * promise); finished ones stay listed for a while under "Recently finished".
 */
import { useEffect, useSyncExternalStore } from "react";

export type TaskKind = "export" | "ai" | "copy" | "upload" | "import";
export type TaskState = "running" | "done" | "failed";
export type Task = {
  id: string;
  kind: TaskKind;
  label: string;
  detail?: string;
  /** 0–100, or null when there's no way to tell (it shows a moving bar) */
  percent: number | null;
  state: TaskState;
  startedAt: number;
  endedAt?: number;
};
export type TaskReport = Omit<Task, "startedAt" | "endedAt" | "state"> & { state?: TaskState };

/** How long a finished task stays listed. */
export const KEEP_MS = 10 * 60 * 1000;

const same = (a: Task, b: Task) => a.kind === b.kind && a.label === b.label && a.detail === b.detail && a.percent === b.percent && a.state === b.state;

/**
 * A report for task `r.id`: added, or updated in place (keeps when it began;
 * notes when it ended). A task first seen already finished is ignored (it
 * ended before this page knew about it). Unchanged: the same array.
 */
export function applyReport(tasks: Task[], r: TaskReport, now: number): Task[] {
  const state = r.state ?? "running";
  const i = tasks.findIndex((t) => t.id === r.id);
  const old = tasks[i];
  if (!old && state !== "running") return tasks;
  const next: Task = {
    id: r.id,
    kind: r.kind,
    label: r.label,
    detail: r.detail,
    percent: r.percent == null ? null : Math.max(0, Math.min(100, Math.round(r.percent))),
    state,
    // (a finished task that starts again, e.g. a new export, starts over)
    startedAt: !old || (state === "running" && old.state !== "running") ? now : old.startedAt,
    endedAt: state === "running" ? undefined : old?.state === "running" ? now : old?.endedAt ?? now,
  };
  if (old && same(old, next)) return tasks;
  return old ? tasks.map((t, k) => (k === i ? next : t)) : [...tasks, next];
}

/** The work's source went away: a running task goes; a finished one stays until it's old. */
export const withdraw = (tasks: Task[], id: string): Task[] => (tasks.some((t) => t.id === id && t.state === "running") ? tasks.filter((t) => t.id !== id) : tasks);

/** Drop finished tasks older than KEEP_MS. */
export const settle = (tasks: Task[], now: number): Task[] => {
  const kept = tasks.filter((t) => t.state === "running" || now - (t.endedAt ?? now) < KEEP_MS);
  return kept.length === tasks.length ? tasks : kept;
};

export const runningCount = (tasks: Task[]) => tasks.filter((t) => t.state === "running").length;

/** An export's progress as one number: its steps on average (done steps count 100). */
export function stepsPercent(steps: { state: string; percent: number }[]): number | null {
  if (!steps.length) return null;
  return Math.round(steps.reduce((a, s) => a + (s.state === "done" ? 100 : s.percent), 0) / steps.length);
}

// ---------- the store (one per page) ----------
let tasks: Task[] = [];
const opens = new Map<string, () => void>();
const listeners = new Set<() => void>();
const set = (next: Task[]) => {
  if (next === tasks) return;
  tasks = next;
  listeners.forEach((l) => l());
};
let sweep: ReturnType<typeof setTimeout> | null = null;
const scheduleSweep = () => {
  if (sweep) clearTimeout(sweep);
  const ends = tasks.filter((t) => t.state !== "running").map((t) => (t.endedAt ?? 0) + KEEP_MS);
  if (!ends.length) return;
  sweep = setTimeout(() => {
    sweep = null;
    set(settle(tasks, Date.now()));
    scheduleSweep();
  }, Math.max(1000, Math.min(...ends) - Date.now()));
};

export function reportTask(r: TaskReport, open?: () => void) {
  if (open) opens.set(r.id, open);
  set(applyReport(tasks, r, Date.now()));
  if (r.state && r.state !== "running") scheduleSweep();
}

export function withdrawTask(id: string) {
  set(withdraw(tasks, id));
  if (!tasks.some((t) => t.id === id)) opens.delete(id);
}

/** Remove finished tasks from the list. */
export function clearFinished() {
  set(tasks.filter((t) => t.state === "running"));
}

/** Go to where the work is (open its panel or dialog, select its clip). */
export const openTask = (id: string) => opens.get(id)?.();

export function useTasks(): Task[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => tasks,
    () => EMPTY,
  );
}
const EMPTY: Task[] = [];

/**
 * Report work held in React state while `r` is set (null: nothing running).
 * `open` goes where the work is; it may change every render.
 */
export function useTask(r: TaskReport | null, open?: () => void) {
  const id = r?.id ?? null;
  const key = r ? JSON.stringify(r) : null;
  useEffect(() => {
    if (id && open) opens.set(id, open);
  });
  useEffect(() => {
    if (key) reportTask(JSON.parse(key) as TaskReport);
  }, [key]);
  // (gone or unmounted: a running task is removed, a finished one stays listed)
  useEffect(() => {
    if (!id) return;
    return () => withdrawTask(id);
  }, [id]);
}

/**
 * Run a promise as a task: listed while it runs, then done or failed (with
 * the error). Stopping it (an AbortError) just removes it. `t.update` changes
 * its detail or percent along the way.
 */
export async function runTask<T>(r: Omit<TaskReport, "state" | "percent"> & { percent?: number | null }, open: (() => void) | undefined, fn: (t: { update: (p: Partial<Pick<Task, "label" | "detail" | "percent">>) => void }) => Promise<T>): Promise<T> {
  let cur: TaskReport = { ...r, percent: r.percent ?? null, state: "running" };
  reportTask(cur, open);
  try {
    const v = await fn({
      update: (p) => {
        cur = { ...cur, ...p };
        reportTask(cur);
      },
    });
    reportTask({ ...cur, state: "done", percent: 100 });
    return v;
  } catch (e) {
    if ((e as Error)?.name === "AbortError") withdrawTask(r.id);
    else reportTask({ ...cur, state: "failed", detail: (e as Error)?.message || "It didn't work." });
    throw e;
  }
}
