import { LIMITS } from "../settings";
import { ApiError, type VideoMeta } from "./types";
import { CHUNKED_ABOVE_BYTES, uploadInChunks } from "./chunkedUpload";

/** Every video file that works (a browser can't play some of them: those get a playable copy, lib/ffmpeg/playable). */
export const VIDEO_EXTS = ["mp4", "mov", "webm", "m4v", "mkv", "avi"];
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v", "video/x-matroska", "video/matroska", "video/x-msvideo", "video/avi", "video/msvideo"];
/** For a video-only file picker (Brand Kit, Create template). */
export const VIDEO_ACCEPT = [...VIDEO_TYPES, ...VIDEO_EXTS.map((e) => `.${e}`)].join(",");
/** The video formats, for help texts. */
export const VIDEO_FORMATS = "MP4, MOV, WebM, M4V, MKV, AVI";
const AUDIO_TYPES = ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/webm", "audio/ogg"];
const AUDIO_EXTS = ["mp3", "wav", "m4a", "aac", "ogg", "opus"];
/** For a sound-only file picker. */
export const AUDIO_ACCEPT = [...AUDIO_TYPES, ...AUDIO_EXTS.map((e) => `.${e}`)].join(",");
export const ACCEPT = [VIDEO_ACCEPT, "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp", AUDIO_ACCEPT].join(",");
const TYPES = [...VIDEO_TYPES, "image/png", "image/jpeg", "image/webp", ...AUDIO_TYPES];
const EXTS = [...VIDEO_EXTS, "png", "jpg", "jpeg", "webp", ...AUDIO_EXTS];

/** Check a file before sending anything. Returns an error code or null. */
export function precheck(file: File): "unsupported_type" | "too_big" | null {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (!TYPES.includes(file.type) && !EXTS.includes(ext)) return "unsupported_type";
  if (file.size > LIMITS.maxUploadBytes) return "too_big";
  return null;
}

/**
 * Upload a file with progress. A big one goes in chunks (lib/api/chunkedUpload: hosting proxies stall long
 * single requests); a small one as the raw body of one request (XHR: fetch can't report upload progress).
 */
export function uploadVideo(file: File | Blob, onProgress: (loaded: number, total: number) => void, signal?: AbortSignal, o: { name?: string; recording?: boolean } = {}): Promise<VideoMeta> {
  if (file.size > CHUNKED_ABOVE_BYTES)
    return uploadInChunks(file, { name: o.name ?? (file as File).name ?? "recording", recording: o.recording }, onProgress, signal);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/videos");
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(o.name ?? (file as File).name ?? "recording"));
    // a browser recording: the server re-encodes it once for smooth editing
    if (o.recording) xhr.setRequestHeader("X-Recording", "1");
    xhr.upload.onprogress = (e) => onProgress(e.loaded, e.lengthComputable ? e.total : file.size);
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body as VideoMeta);
      const err = (body as { error?: { code: string; message: string } })?.error;
      reject(new ApiError(xhr.status, err?.code ?? "network", err?.message ?? "The upload stopped. Check that ViPlay Studio is still running, then try again."));
    };
    xhr.onerror = () => reject(new ApiError(0, "network", "The upload stopped. Check that ViPlay Studio is still running, then try again."));
    xhr.onabort = () => reject(new ApiError(0, "aborted", "Upload canceled."));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}
