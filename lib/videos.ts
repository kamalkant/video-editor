import { createWriteStream } from "node:fs";
import { copyFile, mkdir, readdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { detectKeyColor } from "./ffmpeg/key";
import { normalizeRecording } from "./ffmpeg/normalize";
import { makePlayable, playableFile, playableMode } from "./ffmpeg/playable";
import { probeMedia, ProbeError, type MediaKind, type VideoInfo } from "./ffmpeg/probe";
import { LIMITS, limitSizeLabel } from "./settings";
import { ensureDir, isId, newId, readJson, removeDir, startCleanup, storagePath, videoDir, writeJson } from "./storage";
import { currentOwner } from "./auth/owner";

/** An upload in My Assets: a video, a picture or a sound file. (Named VideoMeta for history.) */
export type VideoMeta = {
  id: string;
  /** Missing on uploads made before pictures and sound were allowed: those are videos. */
  kind?: MediaKind;
  fileName: string;
  createdAt: number;
  info: VideoInfo;
  suggestedKey: string | null;
  /** Detected background: green/blue screen (suggestedKey is set) or a black background. */
  keyKind: "green" | "blue" | "black" | null;
  /** "frame": the green was found only inside the frame (smoke/powder over the borders): likely an effects clip. */
  keyVia?: "border" | "frame";
  /** The background is still being looked for (a browser upload doesn't wait for it): ask again for the result. */
  keyPending?: boolean;
  /** A copy the browser can play, for the preview (the source isn't playable in a browser); see lib/ffmpeg/playable. */
  playable?: "playable.mp4" | "playable.webm";
  /** That copy is being made in the background (a browser upload doesn't wait for it): see whenPlayable. */
  playablePending?: boolean;
  /** Lightweight 720p fast-seeking proxy for timeline editing; export always uses sourcePath. */
  proxy?: {
    ready: boolean;
    file: "proxy.mp4" | "proxy.webm";
    width: number;
    height: number;
    fps: number;
    sizeBytes: number;
    createdAt: number;
    hasAlpha?: boolean;
  };
  /** Made by a ✦ Gemini feature (paid for, so the 24-hour cleanup keeps it). */
  ai?: AiMade;
  /** Imported from a library (Pexels, Pixabay, YouTube): who made it, for the credit line. */
  credit?: { source: "pexels" | "pixabay" | "youtube"; author: string; url: string; license: "free" | "cc" | "youtube" };
  /** If true, the file is unlisted/removed from "My Assets" but kept on disk for projects/templates using it. */
  hiddenFromLibrary?: boolean;
  /** Owner user ID for account personalization and privacy isolation. */
  userId?: string;
};

export type AiMade = { by: "gemini" | "grok"; what: "image" | "background" | "voice" | "video"; prompt?: string; model?: string };

export type UploadErrorCode = "too_big" | "empty" | "unsupported_type" | "bad_id" | "exists" | ProbeError["code"];

export class UploadError extends Error {
  constructor(
    public readonly code: UploadErrorCode,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

const LIMIT_LABEL = limitSizeLabel();

const EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-m4v": "m4v",
  "video/x-matroska": "mkv",
  "video/matroska": "mkv",
  "video/x-msvideo": "avi",
  "video/avi": "avi",
  "video/msvideo": "avi",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
};

/** The kind of an upload (old uploads have no kind: they are videos). */
export const kindOf = (m: Pick<VideoMeta, "kind">): MediaKind => m.kind ?? "video";

export function sourcePath(id: string) {
  return storagePath("videos", id, "source");
}

function cleanName(name: string | null): string {
  let n = "video";
  try {
    n = decodeURIComponent(name ?? "video");
  } catch {
    /* keep default */
  }
  return n.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || "video";
}

/**
 * An upload under an id the browser chose: the editor's local-first import (the clip is already on the
 * timeline under that id, playing from your own file) and portable .vdo packages. Same checks as saveUpload.
 */
export async function restoreUpload(id: string, body: WebReadableStream<Uint8Array> | null, contentType: string | null, fileName: string | null, userId?: string | null, contentLength: number | null = null): Promise<VideoMeta> {
  return saveUpload(body, contentType, fileName, contentLength, false, userId, { id });
}

/** The checks made before any of an upload arrives: its type and announced size (throws UploadError). */
export function checkUploadStart(contentType: string | null, contentLength: number | null): void {
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (type && !EXT[type] && type !== "application/octet-stream") {
    throw new UploadError("unsupported_type", "This file type isn't supported. Use a video (MP4, MOV, WebM, M4V, MKV, AVI), a picture (PNG, JPG, WebP) or a sound (MP3, WAV, M4A).", 415);
  }
  if (contentLength && contentLength > LIMITS.maxUploadBytes) {
    throw new UploadError("too_big", `This file is ${Math.round(contentLength / 1048576)} MB. The limit is ${LIMIT_LABEL}.`, 413);
  }
}

export async function saveUpload(body: WebReadableStream<Uint8Array> | null, contentType: string | null, fileName: string | null, contentLength: number | null, recording = false, userId?: string | null, opts: { id?: string } = {}): Promise<VideoMeta> {
  startCleanup();
  if (opts.id !== undefined && !isId(opts.id)) throw new UploadError("bad_id", "That media id isn't valid.", 400);
  if (!body) throw new UploadError("empty", "No file was sent.");
  checkUploadStart(contentType, contentLength);
  const id = opts.id ?? newId();
  const dir = videoDir(id);
  await claimDir(dir);
  let bytes = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      bytes += chunk.length;
      if (bytes > LIMITS.maxUploadBytes) cb(new UploadError("too_big", `This file is bigger than ${LIMIT_LABEL}, the limit.`, 413));
      else cb(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(body), limiter, createWriteStream(sourcePath(id)));
    if (bytes === 0) throw new UploadError("empty", "The file is empty.");
    return await finishUpload(id, fileName, recording, userId);
  } catch (err) {
    await removeDir(dir);
    throw uploadFailure(err);
  }
}

/**
 * An upload whose bytes already arrived on this server another way (in chunks, lib/uploads/chunked): the
 * file at `path` is moved in, then it's checked and described exactly like saveUpload.
 */
export async function saveUploadedFile(path: string, fileName: string | null, recording = false, userId?: string | null, opts: { id?: string } = {}): Promise<VideoMeta> {
  startCleanup();
  if (opts.id !== undefined && !isId(opts.id)) throw new UploadError("bad_id", "That media id isn't valid.", 400);
  const id = opts.id ?? newId();
  const dir = videoDir(id);
  await claimDir(dir);
  try {
    await rename(path, sourcePath(id)).catch(async () => {
      await copyFile(path, sourcePath(id));
      await rm(path, { force: true });
    });
    return await finishUpload(id, fileName, recording, userId);
  } catch (err) {
    await removeDir(dir);
    throw uploadFailure(err);
  }
}

/** The last steps of every upload, once the file is in place. */
async function finishUpload(id: string, fileName: string | null, recording: boolean, userId?: string | null): Promise<VideoMeta> {
  // browser recordings: constant frame rate, a real length, fast seeking (lib/ffmpeg/normalize)
  if (recording)
    await normalizeRecording(sourcePath(id)).catch(() => {
      throw new UploadError("unreadable", "The recording couldn't be read. Try recording again.", 422);
    });
  // (the preview copy, when one is needed, is made after the upload answers: the editor plays your own
  // file meanwhile, and /play waits for the copy)
  return await describe(id, fileName, userId, { copyLater: true });
}

const uploadFailure = (err: unknown): UploadError =>
  err instanceof UploadError
    ? err
    : err instanceof ProbeError
      ? new UploadError(err.code, err.message, 422)
      : new UploadError("unreadable", "The upload stopped or the file couldn't be read. Try again.", 400);

/**
 * Make an upload's folder. A finished upload (it has meta.json) is never overwritten; a folder left by an
 * upload that stopped halfway (no meta.json) is replaced: its id is the browser's, sending it again.
 */
async function claimDir(dir: string) {
  await ensureDir(dirname(dir));
  try {
    await mkdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    if (await readJson(join(dir, "meta.json"))) throw new UploadError("exists", "A file with this id is already uploaded.", 409);
    await removeDir(dir);
    await mkdir(dir);
  }
}

/** Probe a stored source file and write its meta.json (the last step of every upload). */
async function describe(id: string, fileName: string | null, userId?: string | null, { copyLater = false } = {}): Promise<VideoMeta> {
  const { kind, info } = await probeMedia(sourcePath(id));
  // green/blue/black background detection only makes sense for videos
  const key = kind === "video" && !copyLater ? await detectKeyColor(sourcePath(id), info) : null;
  // a video the browser can't play (ProRes / HEVC .mov, AVI, MKV…): a copy for the preview (lib/ffmpeg/playable)
  const mode = playableMode(kind, info);
  const copy = playableFile(mode);
  let playable: VideoMeta["playable"];
  const later = copyLater && mode !== "none" && !!copy;
  if (mode !== "none" && copy && !later) {
    try {
      await makePlayable(sourcePath(id), storagePath("videos", id, copy), mode, info);
      playable = copy as VideoMeta["playable"];
    } catch {
      /* the preview may not play it; the export still works from the original */
    }
  }
  const meta: VideoMeta = {
    id,
    kind,
    fileName: cleanName(fileName),
    createdAt: Date.now(),
    info,
    suggestedKey: key && key.kind !== "black" ? key.hex : null,
    keyKind: key?.kind ?? null,
    keyVia: key?.via,
    ...(playable ? { playable } : {}),
    ...(later ? { playablePending: true } : {}),
    ...(copyLater && kind === "video" ? { keyPending: true } : {}),
    ...(userId ? { userId } : {}),
  };
  await writeJson(storagePath("videos", id, "meta.json"), meta);
  if (later) void whenPlayable(meta);
  if (copyLater && kind === "video") {
    // (found or not, the result is written: the editor asks until keyPending is gone)
    const settle = async (detected: Awaited<ReturnType<typeof detectKeyColor>>) => {
      const now = await getVideo(id);
      if (!now) return;
      const rest: VideoMeta = { ...now };
      delete rest.keyPending;
      const updated: VideoMeta = detected
        ? { ...rest, suggestedKey: detected.kind !== "black" ? detected.hex : null, keyKind: detected.kind, keyVia: detected.via }
        : rest;
      await writeJson(storagePath("videos", id, "meta.json"), updated).catch(() => undefined);
    };
    void detectKeyColor(sourcePath(id), info).then(settle, () => settle(null)).catch(() => undefined);
  }
  return meta;
}

/** Preview copies being made in the background (one per video at a time). */
const gp = globalThis as unknown as { __viplayCopies?: Map<string, Promise<VideoMeta>> };
const copies = (gp.__viplayCopies ??= new Map());

/**
 * The video once its preview copy is made: starts the copy if it's pending and not being made (e.g. the
 * server restarted meanwhile). Background work (lib/ffmpeg/slots). Never throws: without a copy the
 * video is returned as it is (the export still uses the original).
 */
export function whenPlayable(video: VideoMeta): Promise<VideoMeta> {
  if (!video.playablePending) return Promise.resolve(video);
  const running = copies.get(video.id);
  if (running) return running;
  const mode = playableMode(video.kind ?? "video", video.info);
  const copy = playableFile(mode);
  const finish = async (made: boolean) => {
    const now = await getVideo(video.id);
    if (!now) return video; // deleted meanwhile
    const next: VideoMeta = { ...now, ...(made ? { playable: copy as VideoMeta["playable"] } : {}) };
    delete next.playablePending;
    await writeJson(storagePath("videos", video.id, "meta.json"), next).catch(() => undefined);
    return next;
  };
  const job = (mode === "none" || !copy
    ? finish(false)
    : makePlayable(sourcePath(video.id), storagePath("videos", video.id, copy), mode, video.info, { background: true }).then(
        () => finish(true),
        () => finish(false),
      )
  ).finally(() => copies.delete(video.id));
  copies.set(video.id, job);
  return job;
}

/** Add a file a ✦ Gemini feature made to My Assets, marked so it is kept (it was paid for). The file is moved. */
export async function importAiFile(path: string, fileName: string, ai: AiMade, userId?: string | null): Promise<VideoMeta> {
  const meta = { ...(await importFile(path, fileName, userId)), ai: { ...ai, prompt: ai.prompt?.slice(0, 500) } };
  await writeJson(storagePath("videos", meta.id, "meta.json"), meta);
  return meta;
}

/** Add a file the editor made itself (e.g. text to speech) to My Assets. The file is moved. */
export async function importFile(path: string, fileName: string, userId?: string | null): Promise<VideoMeta> {
  startCleanup();
  // (made for someone: theirs, lib/auth/owner)
  userId ??= currentOwner();
  const id = newId();
  await ensureDir(videoDir(id));
  try {
    await rename(path, sourcePath(id)).catch(async () => {
      await copyFile(path, sourcePath(id));
      await rm(path, { force: true });
    });
    return await describe(id, fileName, userId);
  } catch (err) {
    await removeDir(videoDir(id));
    throw err;
  }
}

export async function getVideo(id: string): Promise<VideoMeta | null> {
  if (!isId(id)) return null;
  return readJson<VideoMeta>(storagePath("videos", id, "meta.json"));
}

/** All uploaded videos, newest first ("My Assets"). Excludes items unlisted from library unless requested. */
export async function listVideos(options?: { includeHidden?: boolean; userId?: string | null }): Promise<VideoMeta[]> {
  let ids: string[] = [];
  try {
    ids = (await readdir(storagePath("videos"))).filter(isId);
  } catch {
    return [];
  }
  const all = await Promise.all(ids.map(getVideo));
  return all
    .filter((v): v is VideoMeta => {
      if (!v) return false;
      if (!options?.includeHidden && v.hiddenFromLibrary) return false;
      if (options?.userId !== undefined) {
        if (!options.userId) return false;
        if (v.userId !== options.userId) return false;
      }
      return true;
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Unlist a video from "My Assets" without deleting it from disk, keeping it working in projects and templates. */
export async function hideVideoFromLibrary(id: string): Promise<boolean> {
  const meta = await getVideo(id);
  if (!meta) return false;
  meta.hiddenFromLibrary = true;
  await writeJson(storagePath("videos", id, "meta.json"), meta);
  return true;
}

export async function deleteVideo(id: string): Promise<boolean> {
  if (!(await getVideo(id))) return false;
  await removeDir(videoDir(id));
  return true;
}

