"use client";

import { useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Popover } from "@/components/ui/Popover";
import { clearFinished, openTask, runningCount, useTasks, type Task, type TaskKind } from "@/lib/editor/tasks";

const ICON: Record<TaskKind, IconName> = { export: "export", ai: "ai", copy: "film", upload: "upload", import: "download" };

function Row({ t, onPick }: { t: Task; onPick: () => void }) {
  const running = t.state === "running";
  return (
    <li>
      <button type="button" onClick={onPick} className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-raised" data-testid="task" data-state={t.state}>
        <Icon name={ICON[t.kind]} className={`mt-0.5 size-4 ${t.state === "failed" ? "text-danger" : t.state === "done" ? "text-success" : "text-muted"}`} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-baseline gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate font-medium">{t.label}</span>
            <span className={`shrink-0 tabular-nums ${t.state === "failed" ? "text-danger" : "text-muted"}`}>{running ? (t.percent != null ? `${t.percent}%` : "") : t.state === "done" ? "Done" : "Failed"}</span>
          </span>
          {t.detail && <span className="truncate text-[0.6875rem] text-muted">{t.detail}</span>}
          {running && (
            <span className="relative h-1 overflow-hidden rounded-full bg-track" role="progressbar" aria-label={t.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={t.percent ?? undefined}>
              {t.percent != null ? <span className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width]" style={{ width: `${t.percent}%` }} /> : <span className="task-indeterminate absolute inset-y-0 w-1/3 rounded-full bg-primary" />}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

/**
 * Top bar: what's working in the background (exports, AI, copies, uploads,
 * imports), with a count while any runs. A task opens where its work is.
 */
export function TasksButton({ className }: { className: string }) {
  const tasks = useTasks();
  const [open, setOpen] = useState(false);
  const n = runningCount(tasks);
  const running = tasks.filter((t) => t.state === "running");
  const finished = tasks.filter((t) => t.state !== "running").reverse();
  const pick = (id: string) => {
    setOpen(false);
    openTask(id);
  };
  return (
    <Popover
      label="Background tasks"
      open={open}
      onOpenChange={setOpen}
      buttonLabel={n ? `Background tasks: ${n} running` : "Background tasks: nothing running"}
      tip={n ? `${n} working in the background` : "Background tasks"}
      buttonClassName={`relative ${className} ${open ? "bg-raised text-ink" : ""}`}
      panelClassName="w-72 p-2"
      align="right"
      button={
        <>
          <Icon name="activity" className={`size-5 ${n ? "text-link" : ""}`} />
          {n > 0 && (
            <span data-testid="tasks-count" aria-hidden="true" className="absolute right-0.5 top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-semibold leading-4 text-white">
              {n}
            </span>
          )}
        </>
      }
    >
      <div aria-live="polite">
        {running.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted">Nothing running. Exports, AI work, uploads and imports show here while they work.</p>
        ) : (
          <ul className="flex flex-col" aria-label="Running">
            {running.map((t) => (
              <Row key={t.id} t={t} onPick={() => pick(t.id)} />
            ))}
          </ul>
        )}
        {finished.length > 0 && (
          <section aria-labelledby="tasks-finished" className="mt-1 border-t border-line pt-1">
            <div className="flex items-center px-2 py-1">
              <h3 id="tasks-finished" className="flex-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">
                Recently finished
              </h3>
              <button type="button" className="text-[0.6875rem] text-link underline" onClick={clearFinished}>
                Clear
              </button>
            </div>
            <ul className="flex flex-col">
              {finished.map((t) => (
                <Row key={t.id} t={t} onPick={() => pick(t.id)} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </Popover>
  );
}
