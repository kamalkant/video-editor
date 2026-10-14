"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { formatAgo, formatTime } from "@/lib/format";
import type { ProjectSummary } from "@/lib/projects/model";
import { localThumb } from "@/lib/media/localMedia";

export type MobileProjectSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  currentId: string | null;
  currentName: string;
  projects: ProjectSummary[];
  onOpen: (id: string) => void;
  onNew: () => void;
  onNewBlank: () => void;
  onRename?: (newName: string) => void;
  onDuplicate?: () => void;
  onAll?: () => void;
  onRefresh?: () => void;
};

export function MobileProjectSheet({
  isOpen,
  onClose,
  currentId,
  currentName,
  projects,
  onOpen,
  onNew,
  onNewBlank,
  onRename,
  onDuplicate,
  onAll,
  onRefresh,
}: MobileProjectSheetProps) {
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState(currentName);
  const [startY, setStartY] = useState<number | null>(null);

  if (!isOpen) return null;

  const handleSaveName = () => {
    const trimmed = tempName.trim();
    if (trimmed && trimmed !== currentName && onRename) {
      onRename(trimmed);
    }
    setEditingName(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartY(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (startY === null) return;
    const deltaY = e.changedTouches[0].clientY - startY;
    setStartY(null);
    if (deltaY > 60) {
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Switch Project"
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs animate-backdrop-fade transition-opacity"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[82vh] w-full flex-col rounded-t-3xl border-t border-line/60 bg-surface/98 backdrop-blur-2xl p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl animate-sheet-up select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Drag Handle */}
        <div
          className="flex w-full cursor-grab justify-center pb-2 pt-0.5 touch-none"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <span className="h-1.5 w-10 rounded-full bg-muted/40 hover:bg-muted transition-colors" />
        </div>

        {/* Sheet Header */}
        <div className="flex items-center justify-between border-b border-line/40 pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <Icon name="projects" className="size-4 text-primary shrink-0" />
            <h2 className="text-sm font-semibold text-ink truncate">Projects</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-full text-muted hover:bg-raised hover:text-ink active:scale-95 transition-all"
            aria-label="Close"
          >
            <Icon name="x" className="size-4" />
          </button>
        </div>

        {/* Current Project Actions */}
        {currentId && (
          <div className="my-3 rounded-2xl border border-line/60 bg-surface-raised/60 p-3">
            <div className="text-[11px] font-medium text-muted uppercase tracking-wider mb-1">
              Active Project
            </div>
            {editingName ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveName();
                    if (e.key === "Escape") setEditingName(false);
                  }}
                  autoFocus
                  className="flex-1 rounded-lg border border-primary bg-surface px-2.5 py-1 text-xs text-ink focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={handleSaveName}
                  className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-white active:scale-95 transition-all"
                >
                  Save
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-ink">
                  {currentName}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setTempName(currentName);
                      setEditingName(true);
                    }}
                    className="flex size-7 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-ink active:scale-95 transition-all"
                    title="Rename project"
                    aria-label="Rename"
                  >
                    <Icon name="pencil" className="size-3.5" />
                  </button>
                  {onDuplicate && (
                    <button
                      type="button"
                      onClick={() => {
                        onDuplicate();
                        onClose();
                      }}
                      className="flex size-7 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-ink active:scale-95 transition-all"
                      title="Duplicate project"
                      aria-label="Duplicate"
                    >
                      <Icon name="copy" className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Quick New Project Buttons */}
        <div className="flex items-center gap-2 mb-3">
          <button
            type="button"
            onClick={() => {
              onNew();
              onClose();
            }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 active:scale-95 transition-all"
          >
            <Icon name="plus" className="size-3.5" />
            <span>New Project</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onNewBlank();
              onClose();
            }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface hover:bg-raised px-3 py-2 text-xs font-medium text-ink active:scale-95 transition-all"
          >
            <Icon name="layers" className="size-3.5 text-muted" />
            <span>With Blank</span>
          </button>
        </div>

        {/* Project List */}
        <div className="flex items-center justify-between pb-1.5 pt-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Recent Projects
          </span>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="text-[11px] text-primary hover:underline"
            >
              Refresh
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5 pr-0.5 max-h-[36vh]">
          {projects.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted">
              No other saved projects yet.
            </div>
          ) : (
            projects.map((proj) => {
              const isCurrent = proj.id === currentId;
              const thumbSrc = proj.coverId
                ? localThumb(proj.coverId) ?? `/api/videos/${proj.coverId}/thumb`
                : null;

              return (
                <button
                  key={proj.id}
                  type="button"
                  disabled={isCurrent}
                  onClick={() => {
                    onOpen(proj.id);
                    onClose();
                  }}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-2 text-left transition-all ${
                    isCurrent
                      ? "border-primary/50 bg-primary/5 cursor-default"
                      : "border-line/60 bg-surface hover:border-control hover:bg-raised active:scale-[0.98] cursor-pointer"
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="relative size-12 shrink-0 rounded-xl bg-black/40 overflow-hidden flex items-center justify-center border border-line/40">
                    {thumbSrc ? (
                      <img
                        src={thumbSrc}
                        alt=""
                        className="size-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <Icon name="film" className="size-5 text-muted/60" />
                    )}
                    {proj.duration > 0 && (
                      <span className="absolute bottom-0.5 right-0.5 rounded bg-black/80 px-1 py-0.2 text-[9px] font-semibold text-white">
                        {formatTime(proj.duration)}
                      </span>
                    )}
                  </div>

                  {/* Meta */}
                  <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                    <span className="truncate text-xs font-semibold text-ink">
                      {proj.name}
                    </span>
                    <span className="text-[10px] text-muted">
                      Edited {formatAgo(proj.updatedAt)}
                      {proj.clips > 0 ? ` · ${proj.clips} ${proj.clips === 1 ? "clip" : "clips"}` : ""}
                    </span>
                  </div>

                  {/* Current indicator */}
                  {isCurrent && (
                    <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary shrink-0">
                      Active
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {onAll && (
          <div className="pt-2 border-t border-line/40 mt-2">
            <button
              type="button"
              onClick={() => {
                onAll();
                onClose();
              }}
              className="w-full text-center text-xs font-medium text-primary py-1 hover:underline"
            >
              View all projects…
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
