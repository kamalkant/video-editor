import { createWriteStream } from "node:fs";
import { copyFile, readdir, rename, rm } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { detectKeyColor } from "./ffmpeg/key";
import { normalizeRecording } from "./ffmpeg/normalize";
import { makePlayable, playableFile, playableMode } from "./ffmpeg/playable";
import { probeMedia, ProbeError, type MediaKind, type VideoInfo } from "./ffmpeg/probe";
import { LIMITS, limitSizeLabel } from "./settings";
import { ensureDir, isId, newId, readJson, removeDir, startCleanup, storagePath, videoDir, writeJson } from "./storage";

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
  /** A copy the browser can play, for the preview (the source isn't playable in a browser); see lib/ffmpeg/playable. */
  playable?: "playable.mp4" | "playable.webm";
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

export type UploadErrorCode = "too_big" | "empty" | "unsupported_type" | ProbeError["code"];

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

/** Stream the request body to disk, stopping as soon as it passes the size limit. */
export async function restoreUpload(id: string, body: WebReadableStream<Uint8Array> | null, contentType: string | null, fileName: string | null, userId?: string | null): Promise<VideoMeta> {
  startCleanup();
  if (!body) throw new UploadError("empty", "No file was sent.");
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (type && !EXT[type] && type !== "application/octet-stream") {
    throw new UploadError("unsupported_type", "This file type isn't supported.", 415);
  }
  const dir = videoDir(id);
  await ensureDir(dir);
  try {
    await pipeline(Readable.fromWeb(body), createWriteStream(sourcePath(id)));
    return await describe(id, fileName, userId);
  } catch (err) {
    await removeDir(dir);
    if (err instanceof UploadError) throw err;
    if (err instanceof ProbeError) throw new UploadError(err.code, err.message, 422);
    throw new UploadError("unreadable", "The file couldn't be read.", 400);
  }
}

export async function saveUpload(body: WebReadableStream<Uint8Array> | null, contentType: string | null, fileName: string | null, contentLength: number | null, recording = false, userId?: string | null): Promise<VideoMeta> {
  startCleanup();
  if (!body) throw new UploadError("empty", "No file was sent.");
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (type && !EXT[type] && type !== "application/octet-stream") {
    throw new UploadError("unsupported_type", "This file type isn't supported. Use a video (MP4, MOV, WebM, M4V, MKV, AVI), a picture (PNG, JPG, WebP) or a sound (MP3, WAV, M4A).", 415);
  }
  if (contentLength && contentLength > LIMITS.maxUploadBytes) {
    throw new UploadError("too_big", `This file is ${Math.round(contentLength / 1048576)} MB. The limit is ${LIMIT_LABEL}.`, 413);
  }
  const id = newId();
  const dir = videoDir(id);
  await ensureDir(dir);
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
    // browser recordings: constant frame rate, a real length, fast seeking (lib/ffmpeg/normalize)
    if (recording)
      await normalizeRecording(sourcePath(id)).catch(() => {
        throw new UploadError("unreadable", "The recording couldn't be read. Try recording again.", 422);
      });
    return await describe(id, fileName, userId);
  } catch (err) {
    await removeDir(dir);
    if (err instanceof UploadError) throw err;
    if (err instanceof ProbeError) throw new UploadError(err.code, err.message, 422);
    throw new UploadError("unreadable", "The upload stopped or the file couldn't be read. Try again.", 400);
  }
}

/** Probe a stored source file and write its meta.json (the last step of every upload). */
async function describe(id: string, fileName: string | null, userId?: string | null): Promise<VideoMeta> {
  const { kind, info } = await probeMedia(sourcePath(id));
  // green/blue/black background detection only makes sense for videos
  const key = kind === "video" ? await detectKeyColor(sourcePath(id), info) : null;
  // a video the browser can't play (ProRes / HEVC .mov, AVI, MKV…): a copy for the preview (lib/ffmpeg/playable)
  const mode = playableMode(kind, info);
  const copy = playableFile(mode);
  let playable: VideoMeta["playable"];
  if (mode !== "none" && copy) {
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
    ...(userId ? { userId } : {}),
  };
  await writeJson(storagePath("videos", id, "meta.json"), meta);
  return meta;
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

