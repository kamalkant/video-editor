import { NeedsPage } from "../encoding";
import { OrderedParts, sameBytes } from "../parts";
import { errorOfStop, type ChunkMeta, type FromWorker, type WorkerStart } from "./protocol";

/**
 * The page's side of the export's Worker (lib/export/worker/export.worker.ts): it starts the Worker, gives the
 * encoded pictures to the page's muxer and passes a cancel on. A Worker that can't start, or stops for a reason
 * of its own, ends with NeedsPage: the page makes the export itself.
 */

/**
 * `localStorage["viplay.exportWorker"]`: "off", every export's pictures on the page; "on", in a Worker
 * whenever it can (also one Worker alone). Otherwise ("auto") the Worker is used when it makes the export in
 * parts at once: one Worker alone was slower than the page on a computer without a graphics chip.
 */
export const WORKER_SWITCH = "viplay.exportWorker";
export type WorkerUse = "auto" | "on" | "off";

/** How long the Worker may take to load, and how long it may then say nothing, before the page makes the export. */
export const WORKER_READY_MS = 15_000;
export const WORKER_SILENT_MS = 60_000;

/** Whether this browser can make the export's pictures in a Worker, and when ("off": it can't, or switched off). */
export function workerUse(): WorkerUse {
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined" || typeof VideoEncoder === "undefined") return "off";
  try {
    const v = globalThis.localStorage?.getItem(WORKER_SWITCH);
    if (v === "off" || v === "on") return v;
  } catch {
    // (no storage here: the default)
  }
  return "auto";
}

/** Whether these pictures are made in Workers: `parts` how many at once, `use` the switch. */
export const usesWorker = (use: WorkerUse, parts: number) => use === "on" || (use === "auto" && parts >= 2);

export type WorkerVideoOptions = {
  onChunk: (data: Uint8Array, key: boolean, timestamp: number, duration: number, meta?: ChunkMeta) => void;
  onProgress: (framesDone: number) => void;
  onTrace?: (what: string, data?: Record<string, unknown>) => void;
  /** Why to stop now (canceled, the sound failed): checked as the Worker reports. */
  stop: () => Error | null;
  signal?: AbortSignal;
};

/** Make the pictures in a Worker; resolves with the poster. */
export function renderInWorker(start: Omit<WorkerStart, "type">, o: WorkerVideoOptions): Promise<{ poster: Blob | null }> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./export.worker.ts", import.meta.url), { type: "module" });
    } catch (e) {
      reject(new NeedsPage(`The export's Worker didn't start: ${e instanceof Error ? e.message : String(e)}`));
      return;
    }
    let ended = false;
    let ready = false;
    let heard = Date.now();
    // a Worker that fails while loading, or hangs, never says so: the page makes the export instead
    const watch = setInterval(() => {
      const quiet = Date.now() - heard;
      if (!ready && quiet > WORKER_READY_MS) end(new NeedsPage("The export's Worker didn't load."));
      else if (ready && quiet > WORKER_SILENT_MS) end(new NeedsPage("The export's Worker stopped answering."));
    }, 1000);
    const end = (err: Error | null, poster: Blob | null = null) => {
      if (ended) return;
      ended = true;
      clearInterval(watch);
      o.signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      if (err) reject(err);
      else resolve({ poster });
    };
    const onAbort = () => {
      worker.postMessage({ type: "cancel" });
      end(new Error("Export canceled."));
    };
    o.signal?.addEventListener("abort", onAbort);
    worker.onerror = (e) => end(new NeedsPage(`The export's Worker stopped: ${e.message || "an error"}`));
    worker.onmessageerror = () => end(new NeedsPage("The export's Worker sent something unreadable."));
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      if (ended) return;
      heard = Date.now();
      const m = e.data;
      if (m.type === "ready") {
        ready = true;
        return;
      }
      const why = o.stop();
      if (why) {
        worker.postMessage({ type: "cancel" });
        end(why);
        return;
      }
      if (m.type === "chunk") o.onChunk(new Uint8Array(m.data), m.key, m.timestamp, m.duration, m.meta);
      else if (m.type === "progress") o.onProgress(m.done);
      else if (m.type === "trace") o.onTrace?.(m.what, m.data);
      else if (m.type === "done") end(null, m.poster);
      else if (m.type === "error") end(errorOfStop(m.kind, m.message));
    };
    const transfer = Object.values(start.pictures);
    worker.postMessage({ type: "start", ...start } satisfies WorkerStart, transfer);
  });
}

/** The parts' encoders were set up differently (their pictures can't be one track): made again in one go. */
export class PartsDiffer extends NeedsPage {}

type Held = { data: Uint8Array; key: boolean; timestamp: number; duration: number; meta?: ChunkMeta };

/**
 * Make the pictures in parts at once, one Worker each (lib/export/parts): every part starts on a key frame,
 * and its pictures go to `onChunk` in file order. Only the first part's encoder setup goes into the file; the
 * other parts' must be the same bytes (else PartsDiffer). The first failure stops every part.
 */
export async function renderInParts(
  start: Omit<WorkerStart, "type" | "from" | "to" | "poster" | "pictures">,
  parts: [number, number][],
  /** The pictures for one Worker (each gets its own: a picture handed to a Worker is gone from here). */
  picturesFor: () => Promise<Record<string, ImageBitmap>>,
  o: WorkerVideoOptions,
): Promise<{ poster: Blob | null }> {
  const done = parts.map(() => 0);
  let setup: ArrayBuffer | undefined;
  let failed: Error | null = null;
  const all = new AbortController();
  const onAbort = () => all.abort();
  o.signal?.addEventListener("abort", onAbort);
  const order = new OrderedParts<Held>(parts.length, (p, c) => {
    if (failed) return;
    const desc = c.meta?.decoderConfig?.description;
    if (p === 0) {
      if (desc) setup = desc;
      o.onChunk(c.data, c.key, c.timestamp, c.duration, c.meta);
      return;
    }
    if (c.meta?.decoderConfig && !sameBytes(setup, desc)) {
      failed = new PartsDiffer("The parts' encoders were set up differently.");
      all.abort();
      return;
    }
    o.onChunk(c.data, c.key, c.timestamp, c.duration);
  });
  const runs = parts.map(async ([from, to], p) => {
    try {
      const pictures = await picturesFor();
      const res = await renderInWorker(
        { ...start, from, to, poster: p === 0, pictures },
        {
          signal: all.signal,
          stop: () => failed ?? o.stop(),
          onTrace: (what, data) => o.onTrace?.(what, { ...data, part: p }),
          onProgress: (n) => {
            done[p] = n;
            o.onProgress(done.reduce((a, b) => a + b, 0));
          },
          onChunk: (data, key, timestamp, duration, meta) => order.add(p, { data, key, timestamp, duration, meta }),
        },
      );
      order.finish(p);
      return res;
    } catch (e) {
      failed ??= e instanceof Error ? e : new Error(String(e));
      all.abort();
      throw e;
    }
  });
  try {
    const results = await Promise.allSettled(runs);
    if (failed) throw failed;
    const first = results[0];
    return first.status === "fulfilled" ? first.value : { poster: null };
  } finally {
    o.signal?.removeEventListener("abort", onAbort);
  }
}
