import { ApiError, type VideoMeta } from "./types";

/**
 * Send a big file in chunks (app/api/uploads, lib/uploads/chunked) instead of one long request: hosting
 * proxies limit and buffer request bodies, and a 500 MB upload in one go can stall there for good.
 *  - chunks of 8 MB, one after another; a chunk the proxy refuses as too big (413) or that gets no answer
 *    for a minute is sent again smaller (down to 1 MB)
 *  - a chunk that didn't arrive (network, a 5xx) is sent again after a pause; the server says how much it
 *    has, so the upload goes on from there instead of starting over
 *  - errors carry the server's message (ApiError), like a one-request upload
 */

/** Files bigger than this go in chunks (smaller ones in one request, as before). */
export const CHUNKED_ABOVE_BYTES = 16 * 1024 * 1024;
export const FIRST_CHUNK_BYTES = 8 * 1024 * 1024;
export const MIN_CHUNK_BYTES = 1024 * 1024;
/** A chunk with no answer for this long counts as stalled. */
export const CHUNK_TIMEOUT_MS = 60_000;
const BACKOFF_MS = [1_000, 3_000, 8_000, 20_000, 20_000, 20_000];

export type ChunkedOptions = {
  name: string;
  /** The id the file gets on the server (the editor's local-first id). */
  id?: string;
  recording?: boolean;
  /** (tests) shorter pauses and timeouts */
  timing?: { backoffMs?: number[]; timeoutMs?: number; firstChunk?: number; minChunk?: number };
};

const STOPPED = "The upload stopped. Check the internet connection, then try again.";
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), reject(new ApiError(0, "aborted", "Upload canceled."))), { once: true });
  });

async function errorOf(res: Response, fallback: string): Promise<ApiError & { received?: number }> {
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string }; received?: number } | null;
  const e = new ApiError(res.status, body?.error?.code ?? `http_${res.status}`, body?.error?.message ?? fallback) as ApiError & { received?: number };
  if (typeof body?.received === "number") e.received = body.received;
  return e;
}

export async function uploadInChunks(file: Blob, o: ChunkedOptions, onProgress: (sent: number, total: number) => void, signal?: AbortSignal): Promise<VideoMeta> {
  const backoff = o.timing?.backoffMs ?? BACKOFF_MS;
  const timeoutMs = o.timing?.timeoutMs ?? CHUNK_TIMEOUT_MS;
  const minChunk = o.timing?.minChunk ?? MIN_CHUNK_BYTES;
  const total = file.size;
  const aborted = () => new ApiError(0, "aborted", "Upload canceled.");
  if (signal?.aborted) throw aborted();

  const start = await fetch("/api/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: o.name, type: file.type || "application/octet-stream", size: total, ...(o.id ? { id: o.id } : {}), ...(o.recording ? { recording: true } : {}) }),
    signal,
  }).catch((err) => {
    throw signal?.aborted ? aborted() : new ApiError(0, "network", STOPPED, String(err));
  });
  if (!start.ok) throw await errorOf(start, STOPPED);
  const { uploadId } = (await start.json()) as { uploadId: string };
  const base = `/api/uploads/${uploadId}`;
  // (canceled: the server forgets what arrived)
  const cancel = () => void fetch(base, { method: "DELETE" }).catch(() => undefined);

  let offset = 0;
  const isLocalHost = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname === "::1");
  let size = o.timing?.firstChunk ?? (isLocalHost ? 64 * 1024 * 1024 : FIRST_CHUNK_BYTES);
  let failures = 0;
  onProgress(0, total);
  try {
    while (offset < total) {
      if (signal?.aborted) throw aborted();
      const end = Math.min(offset + size, total);
      // (a chunk that gets no answer is stopped, and counts as a failure)
      const ctl = new AbortController();
      const stop = () => ctl.abort();
      signal?.addEventListener("abort", stop, { once: true });
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      let res: Response | null = null;
      let stalled = false;
      try {
        res = await fetch(`${base}?offset=${offset}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: file.slice(offset, end), signal: ctl.signal });
      } catch {
        if (signal?.aborted) throw aborted();
        stalled = ctl.signal.aborted;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", stop);
      }
      if (res?.ok) {
        const j = (await res.json()) as { received: number };
        offset = j.received;
        failures = 0;
        onProgress(offset, total);
        continue;
      }
      if (res) {
        const e = await errorOf(res, STOPPED);
        // it has a different amount than we thought (a retried chunk had arrived): go on from there
        if (res.status === 409 && e.received !== undefined) {
          offset = e.received;
          onProgress(offset, total);
          continue;
        }
        // a proxy (or the server) refuses chunks this big: smaller ones
        if (res.status === 413 && size > minChunk) {
          size = Math.max(minChunk, Math.floor(size / 2));
          continue;
        }
        // the server refused the upload itself (signed out, the session gone, too big…): stop
        if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) throw e;
      }
      // didn't arrive (network, a stall, a 5xx from the proxy): a smaller chunk after a pause, from where the server is
      if (stalled && size > minChunk) size = Math.max(minChunk, Math.floor(size / 2));
      if (failures >= backoff.length) throw new ApiError(0, "network", STOPPED);
      await sleep(backoff[failures]!, signal);
      failures++;
      const st = await fetch(base, { signal }).catch(() => null);
      if (st?.ok) offset = ((await st.json()) as { received: number }).received;
      else if (st && st.status === 404) throw await errorOf(st, STOPPED);
    }
    if (signal?.aborted) throw aborted();
    const done = await fetch(`${base}/finish`, { method: "POST", signal }).catch((err) => {
      throw signal?.aborted ? aborted() : new ApiError(0, "network", STOPPED, String(err));
    });
    if (!done.ok) throw await errorOf(done, "Something went wrong while saving the video.");
    return (await done.json()) as VideoMeta;
  } catch (err) {
    if ((err as ApiError).code === "aborted") cancel();
    throw err;
  }
}
