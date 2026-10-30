				"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { Spinner } from "@/components/ui/Spinner";
import { Skeleton, SkeletonGrid, SkeletonRows } from "@/components/ui/Skeleton";
import { Tip } from "@/components/ui/Tip";
import { mediaLiteOf } from "@/lib/edit/doc";
import { setMediaDrag, MEME_DRAG, type MemeDragItem } from "@/lib/editor/mediaDrag";
import { MEDIA_DRAG } from "./Timeline";
import { formatBytes, formatTime } from "@/lib/format";
import type { Asset } from "@/lib/media/useLibrary";
import { ContextMenu, type MenuItem } from "@/components/ui/ContextMenu";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { LIMITS, limitSizeLabel } from "@/lib/settings";
import type { UploadState } from "@/lib/upload/useUpload";
import { keptHereOnly, localItem, localSrc, localThumb, subscribeLocal, localVersion } from "@/lib/media/localMedia";

/** A file still uploading shows the frame taken in the browser (lib/media/localMedia). */
const thumbOf = (id: string) => localThumb(id) ?? `/api/videos/${id}/thumb`;

/** A thumbnail with a shimmer in its place until the picture has arrived (the server may still be making it). */
function Thumb({ src, className }: { src: string; className: string }) {
  const [state, setState] = useState<{ src: string; ok: boolean | null }>({ src, ok: null });
  // (a new picture: loading again)
  const ok = state.src === src ? state.ok : null;
  return (
    <>
      {ok === null && <Skeleton className="absolute inset-0 rounded-none" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className={`${className} ${ok === null ? "opacity-0" : ""}`}
        loading="lazy"
        draggable={false}
        onLoad={() => setState({ src, ok: true })}
        onError={() => setState({ src, ok: false })}
      />
    </>
  );
}

/** "Uploading 45%" over a file of this tab that isn't on the server yet. */
function UploadBadge({ id, compact }: { id: string; compact?: boolean }) {
  const it = localItem(id);
  // kept on this computer only: sent when a server feature needs it
  if (keptHereOnly(id))
    return compact ? (
      <span className="pointer-events-none absolute left-0.5 top-0.5 flex size-3.5 items-center justify-center rounded bg-black/70 text-white" title="On this computer" data-testid="asset-local">
        <Icon name="laptop" className="size-2.5" />
      </span>
    ) : (
      <span className="pointer-events-none absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-2xs font-semibold text-white" title="Kept on this computer: sent to the server only when the export or an AI tool needs it" data-testid="asset-local">
        <Icon name="laptop" className="size-3" /> On this computer
      </span>
    );
  if (!it || it.state === "uploaded") return null;
  if (compact)
    return <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-primary" style={{ width: `${Math.max(8, Math.round(it.progress * 100))}%` }} title="Uploading" data-testid="asset-uploading" />;
  return (
    <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-2xs font-semibold text-white" data-testid="asset-uploading">
      {it.state === "failed" ? "Upload stopped" : `Uploading ${Math.round(it.progress * 100)}%`}
    </span>
  );
}

/** Media: a small upload box and "My Assets", every video uploaded to this computer. */
/** The picture under the pointer while a file is dragged: a small card that sits above the pointer. */
function dragChip(name: string, thumb: string): HTMLElement {
  const old = document.getElementById("VDO-drag-chip");
  old?.remove();
  const el = document.createElement("div");
  el.id = "VDO-drag-chip";
  el.style.cssText =
    "position:fixed;top:-200px;left:-200px;display:flex;align-items:center;gap:6px;max-width:140px;padding:3px 8px 3px 3px;border-radius:6px;background:rgba(17,26,46,0.92);backdrop-filter:blur(6px);border:1px solid rgba(99,102,241,0.5);font:11px system-ui;color:#e7ebf3;box-shadow:0 4px 16px rgba(0,0,0,.45);pointer-events:none;z-index:99999;";
  const img = document.createElement("img");
  img.src = thumb;
  img.style.cssText =
    "display:block;width:32px;height:20px;object-fit:cover;border-radius:3px;flex-shrink:0";
  const label = document.createElement("div");
  label.textContent = name;
  label.style.cssText =
    "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500";
  el.append(img, label);
  document.body.append(el);
  setTimeout(() => el.remove(), 0);
  return el;
}

/** Record buttons: mode, icon, name, what it does. */
const RECORD = [
  ["camera", "camera", "Camera", "You on camera, with your microphone."],
  [
    "screen",
    "screen",
    "Screen",
    "A screen, window or browser tab, with your voice.",
  ],
  [
    "screenCamera",
    "layers",
    "Screen + cam",
    "Your screen with you in a small box (two clips).",
  ],
  ["voice", "mic", "Voice", "A voiceover, on an audio track at the playhead."],
] as const;

export type AssetSort = "date-desc" | "date-asc" | "name" | "duration" | "size";
export type AssetView = "grid" | "list";

export function MediaPanel(p: {
  assets: Asset[] | null;
  listError: string | null;
  /** Uploads the project uses now (on the timeline, as its backdrop or logo): marked with a small check. */
  inTimeline: Set<string>;
  upload: UploadState;
  onChoose: () => void;
  /** Open the recorder (camera, screen, both, or voice). */
  onRecord: (mode: "camera" | "screen" | "screenCamera" | "voice") => void;
  onCancelUpload: () => void;
  onDropFile?: (f: File) => void;
  onDropFiles?: (files: File[]) => void;
  onDropMeme?: (meme: MemeDragItem) => void;
  /** Add an upload to the timeline. */
  onAdd: (a: Asset) => void;
  onDelete: (a: Asset) => Promise<string | null>;
  /** The Import window (Pexels, Pixabay). */
  onImport: (tab: "pexels" | "pixabay") => void;
  onOpenLibrary?: () => void;
}) {
  useSyncExternalStore(subscribeLocal, localVersion, () => 0);
  const [dragging, setDragging] = useState(false);
  const [panelDragging, setPanelDragging] = useState(false);
  const dragDepthRef = useRef(0);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  // the asset chosen with one click (adding needs a double-click, + or a drag)
  const [picked, setPicked] = useState<string | null>(null);
  // the record button under the pointer (its tip shows under the row)
  const [recHint, setRecHint] = useState<number | null>(null);
  const hintId = useId();
  const busy = p.upload.kind === "uploading" || p.upload.kind === "checking";

  // View mode, sorting, and multi-selection
  const [view, setView] = useState<AssetView>("grid");
  const [sort, setSort] = useState<AssetSort>("date-desc");
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{
    asset: Asset;
    x: number;
    y: number;
  } | null>(null);
  const [deletingBatch, setDeletingBatch] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    action: () => Promise<void>;
  } | null>(null);
  const [deletingModal, setDeletingModal] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem("VDO:assets:view");
      if (v === "grid" || v === "list") setView(v);
      const s = localStorage.getItem("VDO:assets:sort");
      if (
        s === "date-desc" ||
        s === "date-asc" ||
        s === "name" ||
        s === "duration" ||
        s === "size"
      )
        setSort(s);
    } catch {
      // Ignore
    }
  }, []);

  const changeView = (next: AssetView) => {
    setView(next);
    try {
      localStorage.setItem("VDO:assets:view", next);
    } catch {
      // Ignore
    }
  };

  const changeSort = (next: AssetSort) => {
    setSort(next);
    try {
      localStorage.setItem("VDO:assets:sort", next);
    } catch {
      // Ignore
    }
  };

  const sortedAssets = useMemo(() => {
    if (!p.assets) return null;
    const list = [...p.assets];
    switch (sort) {
      case "date-asc":
        return list.sort((a, b) => a.createdAt - b.createdAt);
      case "name":
        return list.sort((a, b) => a.fileName.localeCompare(b.fileName));
      case "duration":
        return list.sort(
          (a, b) => (b.info?.duration || 0) - (a.info?.duration || 0),
        );
      case "size":
        return list.sort((a, b) => (b.info?.size || 0) - (a.info?.size || 0));
      case "date-desc":
      default:
        return list.sort((a, b) => b.createdAt - a.createdAt);
    }
  }, [p.assets, sort]);

  const toggleSelectAsset = (id: string) => {
    setSelectedAssets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllAssets = () => {
    if (!sortedAssets) return;
    if (selectedAssets.size === sortedAssets.length) {
      setSelectedAssets(new Set());
    } else {
      setSelectedAssets(new Set(sortedAssets.map((a) => a.id)));
    }
  };

  const del = (a: Asset) => {
    const isUsed = a.usedIn && a.usedIn.length > 0;
    const confirmMsg = isUsed
      ? `This file is used in ${a.usedIn.length > 1 ? `${a.usedIn.length} projects` : "1 project"} (${a.usedIn.map((p) => `“${p.name}”`).join(", ")}).\n\nRemoving it will hide it from My Assets, but existing projects and templates will continue to play and render smoothly.\n\nRemove “${a.fileName}” from My Assets?`
      : `Delete “${a.fileName}” from this computer?`;

    setConfirmDelete({
      title: isUsed ? "Remove Asset" : "Delete Asset",
      confirmLabel: isUsed ? "Remove" : "Delete",
      message: confirmMsg,
      action: async () => {
        setDeletingModal(true);
        setDeleting(a.id);
        const err = await p.onDelete(a);
        setDeleteError(err);
        setDeleting(null);
        setSelectedAssets((prev) => {
          const next = new Set(prev);
          next.delete(a.id);
          return next;
        });
        setDeletingModal(false);
        setConfirmDelete(null);
      },
    });
  };

  const deleteBatch = () => {
    if (!sortedAssets) return;
    const items = sortedAssets.filter((a) => selectedAssets.has(a.id));
    const count = items.length;
    if (!count) return;
    const usedItems = items.filter((a) => a.usedIn && a.usedIn.length > 0);
    const confirmMsg =
      usedItems.length > 0
        ? `Remove ${count} selected asset${count > 1 ? "s" : ""} from My Assets?\n\n(${usedItems.length} of them ${usedItems.length > 1 ? "are" : "is"} in use by projects and will remain accessible to those projects).`
        : `Delete ${count} selected asset${count > 1 ? "s" : ""} from this computer?`;

    setConfirmDelete({
      title: usedItems.length > 0 ? "Remove Selected Assets" : "Delete Selected Assets",
      confirmLabel: usedItems.length > 0 ? "Remove" : "Delete",
      message: confirmMsg,
      action: async () => {
        setDeletingModal(true);
        setDeletingBatch(true);
        let lastError: string | null = null;
        for (const a of items) {
          const err = await p.onDelete(a);
          if (err) lastError = err;
        }
        setDeleteError(lastError);
        setSelectedAssets(new Set());
        setDeletingBatch(false);
        setDeletingModal(false);
        setConfirmDelete(null);
      },
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedAssets.size > 0) {
          e.preventDefault();
          void deleteBatch();
        } else if (picked) {
          const asset = sortedAssets?.find((a) => a.id === picked);
          if (asset) {
            e.preventDefault();
            void del(asset);
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedAssets, picked, sortedAssets]);

  const add = (a: (typeof p.assets & object)[number]) => {
    setPicked(null);
    p.onAdd(a);
  };

  const totalAssets = sortedAssets?.length ?? 0;
  const allAssetsSelected =
    totalAssets > 0 && selectedAssets.size === totalAssets;

  const handleFilesOrMemeDrop = (dataTransfer: DataTransfer) => {
    const files = Array.from(dataTransfer.files || []);
    if (files.length > 0) {
      if (p.onDropFiles) p.onDropFiles(files);
      else if (p.onDropFile) p.onDropFile(files[0]);
      return;
    }
    const memeJson = dataTransfer.getData(MEME_DRAG);
    if (memeJson && p.onDropMeme) {
      try {
        const meme = JSON.parse(memeJson);
        p.onDropMeme(meme);
      } catch {
        // ignore parse failure
      }
    }
  };

  return (
    // a click outside the files (or Esc) unselects the picked one
    <div
      className="relative flex flex-col gap-3 min-h-full"
      data-testid="media-panel"
      onClick={(e) =>
        picked &&
        !(e.target as HTMLElement).closest("[data-asset]") &&
        setPicked(null)
      }
      onKeyDown={(e) => {
        if (e.key === "Escape" && picked) {
          e.stopPropagation();
          setPicked(null);
        }
      }}
      onDragEnter={(e) => {
        const types = Array.from(e.dataTransfer?.types || []);
        if (types.includes("Files") || types.includes(MEME_DRAG)) {
          e.preventDefault();
          dragDepthRef.current++;
          setPanelDragging(true);
        }
      }}
      onDragOver={(e) => {
        const types = Array.from(e.dataTransfer?.types || []);
        if (types.includes("Files") || types.includes(MEME_DRAG)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDragLeave={(e) => {
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) {
          setPanelDragging(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepthRef.current = 0;
        setPanelDragging(false);
        setDragging(false);
        if (!busy) {
          handleFilesOrMemeDrop(e.dataTransfer);
        }
      }}
    >
      {panelDragging && (
        <div
          data-testid="media-drop-overlay"
          className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-surface/92 backdrop-blur-md p-6 text-center shadow-xl animate-in fade-in duration-150 pointer-events-none"
        >
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-inner">
            <Icon name="upload" className="size-7 animate-bounce" />
          </div>
          <p className="text-sm font-semibold text-ink">
            Drop files or clips to import
          </p>
          <p className="text-xs text-muted max-w-[200px]">
            Add video, audio, photos or library clips to My Assets
          </p>
        </div>
      )}
      <div
        className={`flex flex-col items-center gap-1.5 rounded-lg border-2 border-dashed p-3 text-center ${dragging ? "border-primary bg-primary-soft" : "border-primary/60 bg-canvas"}`}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(false);
          setPanelDragging(false);
          dragDepthRef.current = 0;
          if (!busy) handleFilesOrMemeDrop(e.dataTransfer);
        }}
        aria-live="polite"
      >
        {p.upload.kind === "uploading" ? (
          <div className="w-full text-left">
            <p className="truncate text-sm font-medium">
              Uploading {p.upload.name}…
            </p>
            <progress
              className="w-full"
              aria-label="Uploading"
              value={p.upload.loaded}
              max={p.upload.total}
            />
            <p className="text-xs text-muted">
              {formatBytes(p.upload.loaded)} of {formatBytes(p.upload.total)}
            </p>
            <button
              type="button"
              className="btn btn-secondary mt-1 w-full"
              onClick={p.onCancelUpload}
            >
              Cancel
            </button>
          </div>
        ) : p.upload.kind === "checking" ? (
          <p className="text-sm font-medium">Checking the video…</p>
        ) : (
          <>
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <Icon name="upload" className="size-4 text-link" />
              Drop files here, or
            </p>
            <Tip
              text={`Videos, pictures and music · up to ${limitSizeLabel()} each`}
              side="bottom"
              className="w-full"
            >
              <button
                type="button"
                className="btn btn-primary w-full"
                onClick={p.onChoose}
              >
                Upload media
              </button>
            </Tip>
          </>
        )}
      </div>

      {/* record: four icons; the name and what it does show under the row (one tip as wide as the row: it always fits) */}
      <div className="relative">
        <ul
          className="grid grid-cols-4 gap-1.5"
          aria-label="Record"
          onMouseLeave={() => setRecHint(null)}
        >
          {RECORD.map(([mode, icon, label, hint], i) => (
            <li key={label} className="flex">
              <button
                type="button"
                onClick={() => p.onRecord(mode)}
                onMouseEnter={() => setRecHint(i)}
                onFocus={() => setRecHint(i)}
                onBlur={() => setRecHint(null)}
                aria-label={`Record ${label}`}
                aria-describedby={`${hintId}-${mode}`}
                className="flex h-9 w-full items-center justify-center rounded-lg border border-line bg-raised text-ink hover:border-primary hover:bg-primary-soft"
              >
                <Icon
                  name={icon}
                  className={`size-4 ${mode === "camera" ? "text-red-400" : "text-muted"}`}
                />
                <span id={`${hintId}-${mode}`} className="sr-only">
                  {hint}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {recHint !== null && (
          <p
            aria-hidden="true"
            data-testid="record-tip"
            className="pointer-events-none absolute inset-x-0 top-full z-50 mt-1.5 rounded-md border border-control bg-surface px-2 py-1 text-2xs leading-snug text-ink shadow-lg"
          >
            <strong>{RECORD[recHint][2]}</strong> · {RECORD[recHint][3]}
          </p>
        )}
      </div>

      <section
        aria-labelledby="assets-heading"
        className="@container flex flex-col gap-2"
      >
        <div className="flex items-center justify-between gap-1 border-b border-line pb-1.5">
          <div className="flex items-center gap-1.5">
            <h3
              id="assets-heading"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Assets
            </h3>
            {sortedAssets && sortedAssets.length > 0 && (
              <span className="rounded-full bg-raised px-1.0 py-0.2 text-2xs font-medium text-muted">
                {sortedAssets.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {/* View Mode Toggle */}
            <div
              className="flex items-center gap-0.5 rounded-md border border-line bg-raised/50 p-0.5"
              role="group"
              aria-label="Asset view mode"
            >
              <button
                type="button"
                className={`flex size-6 items-center justify-center rounded transition-colors ${view === "grid" ? "bg-primary text-white shadow-sm" : "text-muted hover:text-ink"}`}
                onClick={() => changeView("grid")}
                aria-label="Grid view"
                title="Grid view"
              >
                <Icon name="grid" className="size-3.5" />
              </button>
              <button
                type="button"
                className={`flex size-6 items-center justify-center rounded transition-colors ${view === "list" ? "bg-primary text-white shadow-sm" : "text-muted hover:text-ink"}`}
                onClick={() => changeView("list")}
                aria-label="List view"
                title="List view"
              >
                <Icon name="list" className="size-3.5" />
              </button>
            </div>

            {/* Sort Select */}
            <select
              value={sort}
              onChange={(e) => changeSort(e.target.value as AssetSort)}
              className="field h-6 min-h-0 w-auto py-0 pl-1 pr-2 text-2xs text-ink bg-raised cursor-pointer shrink-0"
              aria-label="Sort assets"
            >
              <option value="date-desc">Newest</option>
              <option value="date-asc">Oldest</option>
              <option value="name">Name</option>
              <option value="duration">Duration</option>
              <option value="size">Size</option>
            </select>

            <Tip
              text="Everything stays on this computer (only the Gemini features you click go online). Files not used in a project are removed after 24 hours; things Gemini made are kept."
              align="right"
              side="bottom"
            >
              <button
				                type="button"
                aria-label="About My Assets"
                className="flex size-5 items-center justify-center rounded text-muted hover:text-ink"
                data-testid="assets-about"
              >
                <Icon name="info" className="size-3.5" />
              </button>
            </Tip>
          </div>
        </div>

        {/* Batch Action Toolbar */}
        {totalAssets > 0 && (
          <div
            className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
              selectedAssets.size > 0
                ? "border-primary/50 bg-primary-soft/90 shadow-sm backdrop-blur"
                : "border-line/70 bg-raised/40 text-muted"
            }`}
            data-testid="assets-batch-bar"
          >
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allAssetsSelected}
                onChange={toggleSelectAllAssets}
                className="size-4 rounded border-line text-primary focus:ring-primary cursor-pointer"
                aria-label={
                  selectedAssets.size > 0
                    ? "Deselect all assets"
                    : "Select all assets"
                }
              />
              <span
                className={`font-medium ${selectedAssets.size > 0 ? "text-ink" : "text-muted"}`}
              >
                {selectedAssets.size > 0
                  ? `${selectedAssets.size} of ${totalAssets} selected`
                  : "Select all"}
              </span>
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="btn btn-secondary min-h-0 size-7 p-0 flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none"
                onClick={() => setSelectedAssets(new Set())}
                disabled={selectedAssets.size === 0}
                aria-label="Clear selection"
                title="Clear selection"
              >
                <Icon name="close" className="size-3.5" />
              </button>
              <button
                type="button"
                className={`btn min-h-0 size-7 p-0 flex items-center justify-center bg-danger text-white hover:bg-danger/90 disabled:pointer-events-none ${deletingBatch ? "disabled:opacity-80" : "disabled:opacity-30"}`}
                onClick={() => void deleteBatch()}
                disabled={selectedAssets.size === 0 || deletingBatch}
                aria-label={
                  selectedAssets.size > 0
                    ? `Delete (${selectedAssets.size})`
                    : "Delete selected"
                }
                title={
                  deletingBatch
                    ? "Deleting…"
                    : selectedAssets.size > 0
                      ? `Delete (${selectedAssets.size})`
                      : "Delete selected"
                }
                data-testid="delete-selected-assets"
              >
                {deletingBatch ? <Spinner size="xs" /> : <Icon name="trash" className="size-3.5" />}
              </button>
            </div>
          </div>
        )}

        {deleteError && (
          <Notice
            tone="error"
            role="alert"
            actions={
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteError(null)}
              >
                OK
              </button>
            }
          >
            {deleteError}
          </Notice>
        )}
        {p.listError && <Notice tone="error">{p.listError}</Notice>}
        {p.assets === null && !p.listError ? (
          <div aria-busy="true" data-testid="assets-loading">
            <span role="status" className="sr-only">
              Loading your media…
            </span>
            {view === "grid" ? <SkeletonGrid n={6} /> : <SkeletonRows n={5} thumb />}
          </div>
        ) : sortedAssets && sortedAssets.length === 0 ? (
          <div
            className="flex flex-col items-center gap-1 px-3 py-6 text-center"
            data-testid="assets-empty"
          >
            <Icon name="folderOpen" className="size-9 text-muted" />
            <p className="font-medium">No media yet</p>
            <p className="text-sm text-muted">Upload a video to get started.</p>
          </div>
        ) : view === "grid" ? (
          /* GRID VIEW */
          <ul
            className="grid grid-cols-2 gap-2 @sm:grid-cols-3 @lg:grid-cols-4"
            data-testid="assets"
          >
            {sortedAssets?.map((a) => {
              const current = p.inTimeline.has(a.id);
              const on = picked === a.id;
              const isChecked = selectedAssets.has(a.id);
              const isSelected = on || isChecked;
              const kind = a.kind ?? "video";
              return (
                <li
                  key={a.id}
                  data-asset
                  data-selected={isSelected ? "true" : undefined}
                  className={`group/asset relative flex min-w-0 flex-col overflow-hidden rounded-lg border bg-raised transition-all ${
                    isChecked
                      ? "border-primary bg-primary-soft/20"
                      : on
                        ? "border-link bg-surface"
                        : "border-line hover:border-line-hover"
                  }`}
                >
                  {/* Thumbnail Container */}
                  <div className="relative">
                    {/* Checkbox (visible on hover, or when checked) */}
                    <div
                      className={`absolute top-1 left-1 z-10 transition-opacity ${
                        isChecked
                          ? "opacity-100"
                          : "opacity-0 group-hover/asset:opacity-100 focus-within:opacity-100"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleSelectAsset(a.id);
                        }}
                        className="size-4 rounded border-line text-primary focus:ring-primary cursor-pointer drop-shadow-sm"
                        aria-label={`Select ${a.fileName}`}
                      />
                    </div>

                    {/* Options 3-dots button (visible on hover or focus) */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = (
                          e.currentTarget as HTMLElement
                        ).getBoundingClientRect();
                        setMenu({
                          asset: a,
                          x: rect.left,
                          y: rect.bottom + 4,
                        });
                      }}
                      title="More options"
                      aria-label={`Options for ${a.fileName}`}
                      className="absolute top-1 right-1 z-10 flex size-6 items-center justify-center rounded bg-black/60 text-white/90 hover:bg-black/80 hover:text-white opacity-0 group-hover/asset:opacity-100 focus:opacity-100 transition-opacity backdrop-blur-sm cursor-pointer"
                    >
                      <Icon name="more" className="size-3.5" />
                    </button>

                    <button
                      type="button"
                      className="relative block aspect-video w-full overflow-hidden bg-stage cursor-pointer focus:outline-none"
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey) {
                          toggleSelectAsset(a.id);
                        } else {
				                          setPicked(on ? null : a.id);
                        }
                      }}
                      onDoubleClick={() => add(a)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setMenu({ asset: a, x: e.clientX, y: e.clientY });
                      }}
                      aria-pressed={on}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(MEDIA_DRAG, a.id);
                        e.dataTransfer.setData("text/plain", a.id);
                        e.dataTransfer.effectAllowed = "copy";
                        setMediaDrag(mediaLiteOf(a));
                        const chip = dragChip(
                          a.fileName,
                          thumbOf(a.id),
                        );
                        e.dataTransfer.setDragImage(chip, 16, 40);
                      }}
                      onDragEnd={() => setMediaDrag(null)}
                      aria-label={a.fileName}
                      title={`${a.fileName}${a.credit ? ` · by ${a.credit.author} on ${a.credit.source === "pexels" ? "Pexels" : a.credit.source === "pixabay" ? "Pixabay" : "YouTube"}${a.credit.license === "cc" ? " (Creative Commons: credit them)" : ""}` : ""} · Double-click to add to timeline, drag to place, right-click for options`}
                    >
                      {kind === "audio" ? (
                        // (a sound has no picture: a music note on the timeline's sound color)
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-tl-audio">
                          <Icon name="audio" className="size-6 text-teal-500" />
                        </span>
                      ) : (
                        <Thumb src={thumbOf(a.id)} className="size-full object-cover pointer-events-none" />
                      )}
                      {/* just the picture, with its details on it: length · size bottom left, what it is bottom right;
                          the name on hover (and in the tip) */}
                      <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-1 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-1.5 pb-1 pt-4">
                        <span className="min-w-0 truncate text-2xs font-medium tabular-nums text-white" data-preserve-white>
                          {[
                            kind !== "image" && a.info.duration > 0 ? formatTime(a.info.duration) : null,
                            a.info.size ? formatBytes(a.info.size) : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        <span
                          className="flex size-4 shrink-0 items-center justify-center rounded bg-black/55 text-white"
                          data-preserve-white
                          title={kind === "image" ? "Image" : kind === "audio" ? "Audio" : "Video"}
                          data-testid="asset-kind"
                        >
                          <Icon name={kind === "image" ? "image" : kind === "audio" ? "audio" : "video"} className="size-2.5" />
                        </span>
                      </span>
                      <span
                        className="pointer-events-none absolute inset-x-0 top-0 truncate bg-gradient-to-b from-black/70 to-transparent pb-3 pl-7 pr-8 pt-1.5 text-left text-2xs font-medium text-white opacity-0 transition-opacity group-hover/asset:opacity-100 group-focus-within/asset:opacity-100"
                        data-preserve-white
                      >
                        {a.fileName}
                      </span>
                      <UploadBadge id={a.id} compact />
                    </button>
                    {/* on the timeline: a small check (the options button takes its place on hover) */}
                    {current && (
                      <span
                        data-testid="asset-used"
                        title="In use on the timeline"
                        aria-label="In use"
                        className="pointer-events-none absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-white transition-opacity group-hover/asset:opacity-0"
                        data-preserve-white
                      >
                        <Icon name="check" className="size-2.5" strokeWidth={3} />
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          /* LIST VIEW */
          <div
            className="flex flex-col gap-1 overflow-hidden"
            data-testid="assets-list"
          >
            {/* Table Header */}
            <div className="flex items-center gap-1.5 border-b border-line px-1.5 py-1 text-2xs font-semibold text-muted">
              <span className="w-3.5 shrink-0" />
              <span className="w-8 shrink-0">Item</span>
              <span className="min-w-0 flex-1">Name</span>
              <span className="w-10 shrink-0 text-right">Dur</span>
              <span className="w-11 shrink-0 text-center">Act</span>
            </div>

            <ul
              className="flex flex-col gap-0.5 divide-y divide-line/30"
              data-testid="assets"
            >
              {sortedAssets?.map((a) => {
                const current = p.inTimeline.has(a.id);
                const on = picked === a.id;
                const isChecked = selectedAssets.has(a.id);
                const isSelected = on || isChecked;
                const kind = a.kind ?? "video";
                return (
                  <li
                    key={a.id}
                    data-asset
                    data-selected={isSelected ? "true" : undefined}
                    className={`group/asset flex items-center gap-1.5 rounded px-1.5 py-1 text-xs transition-colors ${
                      isChecked
                        ? "border-primary bg-primary-soft/80"
                        : on
                          ? "border-link bg-surface"
                          : "hover:bg-raised"
                    }`}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu({ asset: a, x: e.clientX, y: e.clientY });
                    }}
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleSelectAsset(a.id)}
                      className="size-3.5 shrink-0 rounded border-line text-primary focus:ring-primary cursor-pointer"
                      aria-label={`Select ${a.fileName}`}
                    />

                    {/* Dense Thumbnail */}
                    <div
                      className="relative h-5 w-8 shrink-0 overflow-hidden rounded bg-stage cursor-pointer"
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey) {
                          toggleSelectAsset(a.id);
                        } else {
                          setPicked(on ? null : a.id);
                        }
                      }}
                      onDoubleClick={() => add(a)}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(MEDIA_DRAG, a.id);
                        e.dataTransfer.setData("text/plain", a.id);
                        e.dataTransfer.effectAllowed = "copy";
                        setMediaDrag(mediaLiteOf(a));
                        const chip = dragChip(
                          a.fileName,
                          thumbOf(a.id),
                        );
                        e.dataTransfer.setDragImage(chip, 16, 40);
                      }}
                      onDragEnd={() => setMediaDrag(null)}
                      title="Double-click to add to timeline, drag to place"
                    >
                      <Thumb src={thumbOf(a.id)} className="size-full object-cover pointer-events-none" />
                      <UploadBadge id={a.id} compact />
                    </div>

                    {/* Name */}
                    <div className="flex min-w-0 flex-1 items-center gap-1">
                      <span
                        className="truncate text-2xs font-medium text-ink"
                        title={`${a.fileName}${a.info.size ? ` · ${formatBytes(a.info.size)}` : ""}`}
                      >
                        {a.fileName}
                      </span>
                      {current && (
                        <span
                          title="On the timeline"
                          className="flex size-3 shrink-0 items-center justify-center rounded bg-primary text-white"
                        >
                          <Icon
                            name="check"
                            className="size-2"
                            strokeWidth={3}
                          />
                        </span>
                      )}
                    </div>

                    {/* Duration */}
                    <span className="w-10 shrink-0 text-right text-2xs text-muted">
                      {kind !== "image" && a.info.duration > 0
                        ? formatTime(a.info.duration)
                        : "—"}
                    </span>

                    {/* Actions */}
                    <div className="flex w-11 shrink-0 items-center justify-end gap-0.5">
                      <button
                        type="button"
                        onClick={() => add(a)}
                        title="Add to timeline"
                        aria-label={`Add ${a.fileName} to timeline`}
                        className="flex size-5 items-center justify-center rounded text-muted hover:bg-surface hover:text-ink transition-colors"
                      >
                        <Icon name="plus" className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenu({ asset: a, x: e.clientX, y: e.clientY });
                        }}
                        title="More options"
                        aria-label={`Options for ${a.fileName}`}
                        className="flex size-5 items-center justify-center rounded text-muted hover:bg-surface hover:text-ink transition-colors"
                      >
                        <Icon name="more" className="size-3" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {/* Context Menu for Media Assets */}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={`Options for ${menu.asset.fileName}`}
          onClose={() => setMenu(null)}
          items={[
            {
              label: "Add to timeline",
              shortcut: "Double-click",
              onSelect: () => add(menu.asset),
            },
            {
              label: selectedAssets.has(menu.asset.id) ? "Deselect" : "Select",
              checked: selectedAssets.has(menu.asset.id),
              onSelect: () => toggleSelectAsset(menu.asset.id),
            },
            "separator",
            {
              label: "Download original",
              onSelect: () => {
                const a = document.createElement("a");
                // (a file from this computer: saved from here, no download from the server)
                a.href = localSrc(menu.asset.id) ?? `/api/videos/${menu.asset.id}/source`;
                a.download = menu.asset.fileName;
                a.click();
              },
            },
            {
              label: `Delete ${menu.asset.fileName}`,
              shortcut: "Del",
              onSelect: () => void del(menu.asset),
            },
          ]}
        />
      )}

      {/* In-app confirm modal for safe, non-vanishing deletions */}
      <ConfirmDialog
        open={!!confirmDelete}
        title={confirmDelete?.title}
        message={confirmDelete?.message}
        confirmLabel={confirmDelete?.confirmLabel}
        busy={deletingModal}
        onClose={() => {
          if (!deletingModal) setConfirmDelete(null);
        }}
        onConfirm={async () => {
          if (confirmDelete) await confirmDelete.action();
        }}
      />
    </div>
  );
}
