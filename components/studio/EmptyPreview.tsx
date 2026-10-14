"use client";

import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { formatBytes } from "@/lib/format";
import { LIMITS, limitSizeLabel } from "@/lib/settings";
import type { UploadState } from "@/lib/upload/useUpload";

/** Before anything is on the timeline: one big stage to start from (upload, record or text). */
export function EmptyPreview({
  state,
  onChoose,
  onCancel,
  dragging,
  onRecord,
  onText,
  onElements,
  onBlank,
  isMobile = false,
}: {
  state: UploadState;
  onChoose: () => void;
  onCancel: () => void;
  dragging: boolean;
  onRecord?: (mode: "camera" | "screen" | "screenCamera" | "voice") => void;
  onText?: () => void;
  onElements?: () => void;
  onBlank?: () => void;
  isMobile?: boolean;
}) {
  if (isMobile) {
    return (
      <div
        data-testid="empty-preview"
        className="flex h-full w-full flex-col items-center justify-center p-2 text-center select-none"
        aria-live="polite"
      >
        <div
          className={`flex w-full max-w-[340px] flex-col items-center justify-center gap-2 rounded-2xl border p-3 shadow-xs transition-colors ${
            dragging
              ? "border-primary bg-primary/10"
              : "border-line/60 bg-surface/90"
          }`}
        >
          {state.kind === "uploading" ? (
            <div className="w-full max-w-xs py-1">
              <p className="mb-1.5 truncate text-xs font-medium text-ink">Uploading {state.name}…</p>
              <progress className="w-full h-1.5 rounded-full" aria-label="Uploading" value={state.loaded} max={state.total} />
              <p className="mt-1 text-[10px] text-muted">
                {formatBytes(state.loaded)} of {formatBytes(state.total)}
              </p>
              <button type="button" className="btn btn-secondary mt-1.5 text-xs py-1 px-3" onClick={onCancel}>
                Cancel
              </button>
            </div>
          ) : state.kind === "checking" ? (
            <div className="py-2">
              <p className="text-xs font-semibold text-ink">Checking file…</p>
              <p className="text-[10px] text-muted">Reading size, frame rate and sound</p>
            </div>
          ) : (
            <>
              {/* YouTube Create Hero Card Header */}
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Icon name="upload" className="size-3.5" />
                </div>
                <div className="flex flex-col text-left">
                  <h2 className="text-xs font-semibold text-ink leading-tight">Add Media</h2>
                  <span className="text-[10px] text-muted leading-tight">Videos, photos or audio</span>
                </div>
              </div>

              {/* Primary Choose File CTA */}
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white shadow-xs hover:bg-primary/90 active:scale-95 transition-all cursor-pointer"
                onClick={onChoose}
              >
                <Icon name="plus" className="size-3.5" strokeWidth={2.5} />
                <span>Choose file</span>
              </button>

              {/* Compact Quick Action Pills Row */}
              <div className="flex w-full items-center justify-center gap-1.5 pt-0.5 overflow-x-auto no-scrollbar">
                {onRecord && (
                  <button
                    type="button"
                    onClick={() => onRecord("camera")}
                    className="flex items-center gap-1 rounded-lg border border-line bg-raised/70 px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-raised active:scale-95 transition-all shrink-0"
                  >
                    <Icon name="camera" className="size-3 text-red-400" />
                    <span>Camera</span>
                  </button>
                )}
                {onText && (
                  <button
                    type="button"
                    onClick={onText}
                    className="flex items-center gap-1 rounded-lg border border-line bg-raised/70 px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-raised active:scale-95 transition-all shrink-0"
                  >
                    <Icon name="text" className="size-3 text-amber-400" />
                    <span>Text</span>
                  </button>
                )}
                {onBlank && (
                  <button
                    type="button"
                    onClick={onBlank}
                    className="flex items-center gap-1 rounded-lg border border-line bg-raised/70 px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-raised active:scale-95 transition-all shrink-0"
                  >
                    <Icon name="plus" className="size-3 text-sky-400" />
                    <span>Blank</span>
                  </button>
                )}
                {onElements && (
                  <button
                    type="button"
                    onClick={onElements}
                    className="flex items-center gap-1 rounded-lg border border-line bg-raised/70 px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-raised active:scale-95 transition-all shrink-0"
                  >
                    <Icon name="elements" className="size-3 text-purple-400" />
                    <span>Elements</span>
                  </button>
                )}
              </div>

              {state.kind === "error" && (
                <div className="w-full text-left mt-1">
                  <Notice tone="error" role="alert" title="Can't use this video">
                    {state.message}
                  </Notice>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="empty-preview" className="flex h-full min-h-[18rem] p-2" aria-live="polite">
      <div className={`flex flex-1 flex-col items-center justify-center gap-3 overflow-hidden rounded-lg border-2 border-solid p-6 text-center ${dragging ? "border-primary bg-primary-soft" : "border-line bg-stage"}`}>
        {state.kind === "uploading" ? (
          <div className="w-full max-w-xs">
            <p className="mb-2 truncate text-sm font-medium">Uploading {state.name}…</p>
            <progress className="w-full" aria-label="Uploading" value={state.loaded} max={state.total} />
            <p className="mt-1 text-xs text-muted">
              {formatBytes(state.loaded)} of {formatBytes(state.total)}
            </p>
            <button type="button" className="btn btn-secondary mt-2" onClick={onCancel}>
              Cancel
            </button>
          </div>
        ) : state.kind === "checking" ? (
          <div>
            <p className="font-medium">Checking the file…</p>
            <p className="text-xs text-muted">Reading its size, frame rate and sound, and finding the background.</p>
          </div>
        ) : (
          <>
            <span className="flex size-14 items-center justify-center rounded-xl border-2 border-control text-muted">
              <Icon name="film" className="size-7" />
            </span>
            <h1 className="text-lg font-semibold">No video loaded</h1>
            <p className="max-w-md text-sm text-muted">Drag &amp; drop videos, pictures or music here, choose files, or record yourself or your screen.</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" className="btn btn-primary" onClick={onChoose}>
                <Icon name="upload" className="size-4" /> Choose file
              </button>
              {onRecord && (
                <>
                  <button type="button" className="btn btn-secondary" onClick={() => onRecord("camera")}>
                    <Icon name="camera" className="size-4 text-red-400" /> Record camera
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => onRecord("screen")}>
                    <Icon name="screen" className="size-4" /> Record screen
                  </button>
                </>
              )}
              {onText && (
                <button type="button" className="btn btn-secondary" onClick={onText}>
                  <Icon name="text" className="size-4" /> Add a title
                </button>
              )}
              {onElements && (
                <button type="button" className="btn btn-secondary" onClick={onElements}>
                  <Icon name="elements" className="size-4" /> Elements
                </button>
              )}
              {onBlank && (
                <button type="button" className="btn btn-secondary" onClick={onBlank}>
                  <Icon name="plus" className="size-4" /> Start with a blank
                </button>
              )}
            </div>
            <p className="text-[0.6875rem] text-muted">
              Videos up to {LIMITS.maxDurationSec / 60} min · max {limitSizeLabel()} · MP4, MOV, WebM, M4V, MKV, AVI, PNG, JPG, MP3, WAV, M4A
            </p>
            {state.kind === "error" && (
              <div className="w-full max-w-sm text-left">
                <Notice tone="error" role="alert" title="This video can't be used">
                  {state.message}
                </Notice>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
