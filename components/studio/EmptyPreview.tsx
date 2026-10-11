"use client";

import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { formatBytes } from "@/lib/format";
import { LIMITS, limitSizeLabel } from "@/lib/settings";
import type { UploadState } from "@/lib/upload/useUpload";

/** Before anything is on the timeline: one big stage to start from (upload, record or text). */
export function EmptyPreview({ state, onChoose, onCancel, dragging, onRecord, onText, onElements, onBlank }: { state: UploadState; onChoose: () => void; onCancel: () => void; dragging: boolean; onRecord?: (mode: "camera" | "screen" | "screenCamera" | "voice") => void; onText?: () => void; onElements?: () => void; onBlank?: () => void }) {
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
