"use client";

import { Notice } from "@/components/ui/Notice";
import type { Job } from "@/lib/jobs/queue";

export function GeneratePanel(p: { job: Job | null; starting: boolean; connection: "ok" | "retrying" | "gone"; disabledReason: string | null; startError: string | null; onGenerate: () => void; onCancel: () => void; label?: string; help?: string }) {
  const running = p.starting || (p.job && (p.job.state === "queued" || p.job.state === "running"));
  const step = p.job?.steps.find((s) => s.state === "running");
  const status = p.starting ? "Starting…" : p.job?.state === "queued" ? "Waiting for another video to finish…" : step ? `${step.label}…` : p.job?.state === "done" ? "Done ✓ Opening your files…" : "";

  return (
    <section aria-labelledby="gen-heading" className="card flex flex-col gap-3">
      <h2 id="gen-heading" className="sr-only">
        Make the video
      </h2>
      <button
        type="button"
        className="btn btn-primary w-full text-lg"
        aria-disabled={!!running || !!p.disabledReason}
        aria-describedby="gen-help"
        onClick={() => !running && !p.disabledReason && p.onGenerate()}
      >
        {running ? "Generating…" : (p.label ?? "Make transparent video")}
      </button>
      <p id="gen-help" className="text-sm text-muted">
        {p.disabledReason ?? p.help ?? "Makes 2 files: one for Chrome, Edge, Firefox and Android (.webm), and one for Safari, iPhone and iPad (.mov)."}
      </p>

      <p aria-live="polite" className="font-medium">
        {status}
      </p>

      {running && p.job && (
        <>
          <ol className="flex flex-col gap-2">
            {p.job.steps.map((s) => (
              <li key={s.kind} className="flex flex-col gap-1">
                <span className="flex justify-between text-sm">
                  <span>
                    <span aria-hidden="true">{s.state === "done" ? "✓ " : s.state === "running" ? "▸ " : "○ "}</span>
                    {s.label}
                    <span className="sr-only">{s.state === "done" ? " (done)" : s.state === "running" ? " (in progress)" : " (waiting)"}</span>
                  </span>
                  {s.state === "running" && <span aria-hidden="true">{s.percent}%</span>}
                </span>
                {s.state === "running" && <progress className="w-full" aria-label={s.label} value={s.percent} max={100} />}
              </li>
            ))}
          </ol>
          <button type="button" className="btn btn-secondary self-start" onClick={p.onCancel}>
            Cancel
          </button>
        </>
      )}
      {p.connection === "retrying" && <Notice tone="warning">Reconnecting to the editor…</Notice>}
      {p.connection === "gone" && <Notice tone="error">This job stopped (the editor may have restarted). Your settings are kept. Click Make transparent video again.</Notice>}
      {p.startError && <Notice tone="error" role="alert">{p.startError}</Notice>}
      {p.job?.state === "failed" && (
        <Notice tone="error" role="alert" title="Something went wrong">
          <p>{p.job.error}</p>
          {p.job.errorDetail && (
            <details className="mt-1">
              <summary className="cursor-pointer">Show details</summary>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-xs">{p.job.errorDetail}</pre>
            </details>
          )}
        </Notice>
      )}
      {p.job?.state === "canceled" && <Notice tone="info">Canceled. Your settings are kept.</Notice>}
    </section>
  );
}
