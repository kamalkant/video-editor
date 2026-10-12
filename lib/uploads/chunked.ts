import "server-only";
import { createWriteStream } from "node:fs";
import { readdir, stat, truncate, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { ensureDir, isId, MAX_AGE_MS, newId, readJson, removeDir, storagePath, writeJson } from "../storage";
import { checkUploadStart, getVideo, saveUploadedFile, UploadError, type VideoMeta } from "../videos";

/**
 * Uploads in chunks: a big file is sent as many small requests instead of one long one. Hosting proxies
 * (Hostinger's in front of the live site) limit and buffer request bodies, and a single 500 MB request can
 * stall there; each chunk here is small, and a chunk that didn't arrive is simply sent again (the session
 * remembers how much arrived, so the browser resumes from there). The finished file goes through exactly
 * the same checks as a one-request upload (lib/videos saveUploadedFile).
 *
 * A session: storage/uploads/<uploadId>/ with the bytes so far (`part`) and session.json.
 */

/** The biggest chunk accepted (the browser sends 8 MB, smaller if a proxy refuses that). */
export const MAX_CHUNK_BYTES = 16 * 1024 * 1024;

export type UploadSession = {
  uploadId: string;
  userId: string;
  /** The id the file gets (the editor's local-first id), else a new one. */
  id?: string;
  name: string;
  type: string;
  size: number;
  received: number;
  recording: boolean;
  createdAt: number;
};

/** A chunk that doesn't fit where the session is: `received` says where to go on from. */
export class ChunkError extends Error {
  constructor(
    public readonly code: "not_found" | "bad_offset" | "too_big" | "incomplete" | "bad_request",
    message: string,
    public readonly status: number,
    public readonly received?: number,
  ) {
    super(message);
    this.name = "ChunkError";
  }
}

const dirOf = (uploadId: string) => storagePath("uploads", uploadId);
const sessionFile = (uploadId: string) => join(dirOf(uploadId), "session.json");
const partFile = (uploadId: string) => join(dirOf(uploadId), "part");

/** One change at a time per session (a retried chunk can arrive while the first try is still being written). */
const g = globalThis as unknown as { __viplayChunkLocks?: Map<string, Promise<unknown>> };
const locks = (g.__viplayChunkLocks ??= new Map());
function locked<T>(uploadId: string, work: () => Promise<T>): Promise<T> {
  const before = locks.get(uploadId) ?? Promise.resolve();
  const run = before.then(work, work);
  const settled = run.catch(() => undefined);
  locks.set(uploadId, settled);
  void settled.then(() => {
    if (locks.get(uploadId) === settled) locks.delete(uploadId);
  });
  return run;
}

async function load(uploadId: string, userId: string): Promise<UploadSession> {
  if (!isId(uploadId)) throw new ChunkError("not_found", "That upload isn't here any more. Start it again.", 404);
  const s = await readJson<UploadSession>(sessionFile(uploadId));
  // (someone else's session looks the same as a missing one)
  if (!s || s.userId !== userId) throw new ChunkError("not_found", "That upload isn't here any more. Start it again.", 404);
  return s;
}

/** Start an upload: checked like a one-request upload before any of it arrives. */
export async function createSession(userId: string, o: { name: string; type: string; size: number; id?: string | null; recording?: boolean }): Promise<UploadSession> {
  if (!Number.isFinite(o.size) || o.size <= 0) throw new UploadError("empty", "The file is empty.");
  if (o.id != null && !isId(o.id)) throw new UploadError("bad_id", "That media id isn't valid.", 400);
  checkUploadStart(o.type || null, o.size);
  void pruneSessions();
  const s: UploadSession = {
    uploadId: newId(),
    userId,
    ...(o.id ? { id: o.id } : {}),
    name: (o.name || "video").slice(0, 200),
    type: o.type || "application/octet-stream",
    size: o.size,
    received: 0,
    recording: !!o.recording,
    createdAt: Date.now(),
  };
  await ensureDir(dirOf(s.uploadId));
  await writeFile(partFile(s.uploadId), "");
  await writeJson(sessionFile(s.uploadId), s);
  return s;
}

/** How much of it arrived (to resume after a dropped chunk). */
export async function statusOf(uploadId: string, userId: string): Promise<{ received: number; size: number }> {
  const s = await load(uploadId, userId);
  return { received: s.received, size: s.size };
}

/** Add the chunk that starts at `offset`. Returns how much has arrived. */
export function appendChunk(uploadId: string, userId: string, offset: number, body: WebReadableStream<Uint8Array> | null): Promise<{ received: number; size: number }> {
  return locked(uploadId, async () => {
    const s = await load(uploadId, userId);
    if (!body) throw new ChunkError("bad_request", "No data was sent.", 400, s.received);
    if (!Number.isInteger(offset) || offset !== s.received)
      throw new ChunkError("bad_offset", "That part of the file doesn't fit here.", 409, s.received);
    // (bytes from a chunk that stopped halfway earlier are dropped first)
    await truncate(partFile(uploadId), s.received);
    let bytes = 0;
    const counter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        bytes += chunk.length;
        if (bytes > MAX_CHUNK_BYTES) cb(new ChunkError("too_big", "This part is too big.", 413, s.received));
        else if (s.received + bytes > s.size) cb(new ChunkError("too_big", "More arrived than the file's size.", 413, s.received));
        else cb(null, chunk);
      },
    });
    try {
      await pipeline(Readable.fromWeb(body), counter, createWriteStream(partFile(uploadId), { flags: "a" }));
    } catch (err) {
      await truncate(partFile(uploadId), s.received).catch(() => undefined);
      if (err instanceof ChunkError) throw err;
      throw new ChunkError("bad_request", "That part stopped on the way. It's sent again.", 400, s.received);
    }
    const next: UploadSession = { ...s, received: s.received + bytes };
    await writeJson(sessionFile(uploadId), next);
    return { received: next.received, size: next.size };
  });
}

/** Every chunk is here: the file becomes an upload (My Assets), checked like any other. */
export function finishSession(uploadId: string, userId: string): Promise<VideoMeta> {
  return locked(uploadId, async () => {
    const s = await load(uploadId, userId);
    const have = (await stat(partFile(uploadId)).catch(() => null))?.size ?? 0;
    if (s.received !== s.size || have !== s.size)
      throw new ChunkError("incomplete", "Not all of the file has arrived yet.", 409, Math.min(s.received, have));
    try {
      // (the same file under the editor's id was sent before: that upload is the answer, like PUT /api/videos/<id>)
      const existing = s.id ? await getVideo(s.id) : null;
      if (existing) {
        if (existing.userId && existing.userId !== userId) throw new UploadError("exists", "A file with this id is already uploaded.", 409);
        return existing;
      }
      return await saveUploadedFile(partFile(uploadId), s.name, s.recording, userId, s.id ? { id: s.id } : {});
    } finally {
      await removeDir(dirOf(uploadId));
    }
  });
}

/** Stop an upload and forget what arrived. */
export async function cancelSession(uploadId: string, userId: string): Promise<void> {
  await load(uploadId, userId);
  await locked(uploadId, () => removeDir(dirOf(uploadId)));
}

/** Sessions nobody finished within a day are deleted (the browser starts a new one). */
export async function pruneSessions(now = Date.now(), maxAgeMs = MAX_AGE_MS): Promise<number> {
  let ids: string[] = [];
  try {
    ids = await readdir(storagePath("uploads"));
  } catch {
    return 0;
  }
  let removed = 0;
  for (const id of ids) {
    if (!isId(id) || locks.has(id)) continue;
    const s = await readJson<UploadSession>(sessionFile(id));
    const since = s?.createdAt ?? (await stat(dirOf(id)).catch(() => null))?.mtimeMs ?? 0;
    if (now - since > maxAgeMs) {
      await removeDir(dirOf(id));
      removed++;
    }
  }
  return removed;
}
