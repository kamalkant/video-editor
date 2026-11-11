/**
 * What the video editor reports to ViPlay usage (see ./track.ts): the visit, panels and AI tools used,
 * files brought in (kind and size only), templates, and each export's outcome (format, made in the browser
 * or on the server, how long it took). No file names, video, text or prompts.
 */
import { initUsage, sizeBucket, track, type UsageEvent } from "./track";

let started = false;

/** AI endpoints that do something (status and key checks are not uses). */
const AI_PATH = /^(?:https?:\/\/[^/]+)?\/api\/ai\/([a-z0-9-]+)(?:[/?]|$)/;
const NOT_A_USE = new Set(["status", "keys", "prompt-enhance"]);

export function startUsage() {
  if (started || typeof window === "undefined") return;
  started = true;
  initUsage({ app: "video" });
  // the AI tools call /api/ai/<tool> from many places: count each request there and whether it worked
  const fetch0 = window.fetch;
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    const res = fetch0.call(window, input, init);
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const tool = method === "POST" ? AI_PATH.exec(url)?.[1] : undefined;
      if (tool && !NOT_A_USE.has(tool))
        res.then(
          (r) => track("ai_use", { tool, ok: r.ok }),
          () => track("ai_use", { tool, ok: false }),
        );
    } catch {
      /* never in the way of the request */
    }
    return res;
  };
}

/** Report something, starting the tracker first (a page's effects can run before the layout's). */
export function usage(name: UsageEvent, props?: Record<string, string | number | boolean | undefined>) {
  startUsage();
  track(name, props);
}

export const trackImport = (kind: "video" | "image" | "audio", bytes: number) => usage("media_import", { type: kind, size: sizeBucket(bytes) });

type JobLike = { id: string; state: string; format?: string; createdAt: number; updatedAt: number };
const seen = new Map<string, string>();

/**
 * An export job as the editor sees it (browser jobs' ids start with "local-"): reported when it starts, and
 * when it ends. A job first seen already finished (a page reload) is not counted again.
 */
export function trackExportJob(job: JobLike | null) {
  if (!job) return;
  const before = seen.get(job.id);
  if (before === job.state) return;
  seen.set(job.id, job.state);
  const format = job.format ?? "mp4";
  const where = job.id.startsWith("local-") ? "browser" : "server";
  const live = job.state === "queued" || job.state === "running";
  if (live && !before) usage("export_start", { format, where });
  if (!before || before === "done" || before === "failed" || before === "canceled") return;
  const seconds = Math.max(0, Math.round((job.updatedAt - job.createdAt) / 100) / 10);
  if (job.state === "done") usage("export_done", { format, where, seconds });
  // (no reason: a job's error is a sentence that can name a file)
  if (job.state === "failed") usage("export_fail", { format, where });
}
