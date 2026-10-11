"use client";

import { useRef, useState } from "react";
import { precheck, uploadVideo } from "../api/upload";
import { ApiError, type VideoMeta } from "../api/types";
import { formatBytes } from "../format";
import { LIMITS, limitSizeLabel } from "../settings";

export type UploadState =
  | { kind: "idle" }
  | { kind: "uploading"; loaded: number; total: number; name: string }
  | { kind: "checking"; name: string }
  | { kind: "error"; code: string; message: string };

/** Upload state machine shared by the empty canvas, drag & drop and "Change video". */
export function useUpload(onUploaded: (v: VideoMeta) => void) {
  const [state, setState] = useState<UploadState>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);

  const start = async (file: File) => {
    const bad = precheck(file);
    if (bad) {
      return setState({
        kind: "error",
        code: bad,
        message: bad === "too_big" ? `This file is ${formatBytes(file.size)}. The limit is ${limitSizeLabel()}.` : "This file type isn't supported. Use a video (MP4, MOV, WebM, M4V, MKV, AVI), a picture (PNG, JPG, WebP) or a sound (MP3, WAV, M4A).",
      });
    }
    abort.current = new AbortController();
    setState({ kind: "uploading", loaded: 0, total: file.size, name: file.name });
    try {
      const video = await uploadVideo(
        file,
        (loaded, total) => setState(loaded >= total ? { kind: "checking", name: file.name } : { kind: "uploading", loaded, total, name: file.name }),
        abort.current.signal,
      );
      setState({ kind: "idle" });
      onUploaded(video);
    } catch (e) {
      const err = e as ApiError;
      if (err.code === "aborted") return setState({ kind: "idle" });
      setState({ kind: "error", code: err.code, message: err.message });
    }
  };

  return {
    state,
    busy: state.kind === "uploading" || state.kind === "checking",
    start,
    cancel: () => abort.current?.abort(),
    clearError: () => setState({ kind: "idle" }),
    openPicker: () => inputRef.current?.click(),
    inputRef,
  };
}
