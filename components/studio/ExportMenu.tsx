"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { EXPORT_PRESETS, VIDEO_PRESETS, type ExportPresetId, type VideoPresetId } from "@/lib/export/presets";

/** The Export button plus a ▾ menu of quick presets (they start right away). */
export function ExportMenu({
  label,
  onOpen,
  onQuick,
  quickDisabled,
  onVideo,
  videoDisabled,
  onThumbnail,
}: {
  label: string;
  onOpen: () => void;
  onQuick: (id: ExportPresetId) => void;
  quickDisabled: string | null;
  /** An MP4 at the project size, or at a social-media size (the project stays as it is). */
  onVideo?: (id: VideoPresetId | "project" | "social-set") => void;
  videoDisabled?: string | null;
  /** Open the thumbnail maker (YouTube 16:9 / Shorts cover). */
  onThumbnail?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    items.current[0]?.focus();
    const outside = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, [open]);

  const close = (focus = true) => {
    setOpen(false);
    if (focus) toggle.current?.focus();
  };
  const onKey = (e: React.KeyboardEvent) => {
    const list = items.current.filter(Boolean) as HTMLButtonElement[];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      list[(i + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      list[e.key === "Home" ? 0 : list.length - 1]?.focus();
    } else if (e.key === "Tab") close(false);
  };

  const item = "flex w-full flex-col items-start rounded-md px-3 py-2 text-left text-sm hover:bg-raised focus:bg-raised aria-disabled:cursor-not-allowed aria-disabled:opacity-50";
  return (
    <div ref={wrap} className="relative ml-1 flex">
      <button type="button" data-testid="export-button" className="btn btn-primary rounded-r-none px-3.5 max-sm:px-2.5" onClick={onOpen}>
        <Icon name="export" className="size-4" />
        <span className="max-sm:sr-only">{label}</span>
      </button>
      <button
        ref={toggle}
        type="button"
        className="btn btn-primary rounded-l-none border-l border-white/40 px-2"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Export options"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="chevronDown" className="size-4" />
      </button>
      {open && (
        <div role="menu" aria-label="Export options" className="absolute right-0 top-full z-50 mt-1 max-h-[80dvh] w-80 overflow-y-auto rounded-lg border border-control bg-surface p-1 shadow-2xl" onKeyDown={onKey}>
          {onVideo && (
            <>
              <p className="px-3 pb-0.5 pt-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">
                Video (MP4) <span className="ml-1 rounded bg-primary px-1 py-px text-[0.5625rem] text-white">Recommended</span>
              </p>
              {[
                { id: "project" as const, label: "MP4 · project size", detail: "H.264 + sound. Plays everywhere" },
                ...VIDEO_PRESETS,
                { id: "social-set" as const, label: "All 3 sizes · 16:9 + 9:16 + 1:1", detail: "YouTube, Shorts / Reels and square, queued together" },
              ].map((x, i) => (
                <button
                  key={x.id}
                  ref={(el) => {
                    items.current[i] = el;
                  }}
                  type="button"
                  role="menuitem"
                  className={item}
                  aria-disabled={!!videoDisabled}
                  title={videoDisabled ?? undefined}
                  onClick={() => {
                    if (videoDisabled) return;
                    close();
                    onVideo(x.id);
                  }}
                >
                  <span className="font-medium">{x.label}</span>
                  <span className="text-xs text-muted">{videoDisabled ?? x.detail}</span>
                </button>
              ))}
              <p className="px-3 pb-0.5 pt-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">See-through video (alpha)</p>
            </>
          )}
          {EXPORT_PRESETS.map((x, j) => (
            <button
              key={x.id}
              ref={(el) => {
                items.current[(onVideo ? VIDEO_PRESETS.length + 2 : 0) + j] = el;
              }}
              type="button"
              role="menuitem"
              className={item}
              aria-disabled={!!quickDisabled}
              title={quickDisabled ?? undefined}
              onClick={() => {
                if (quickDisabled) return;
                close();
                onQuick(x.id);
              }}
            >
              <span className="font-medium">{x.label}</span>
              <span className="text-xs text-muted">{quickDisabled ?? x.detail}</span>
            </button>
          ))}
          <div role="separator" className="my-1 h-px bg-line" />
          <button
            ref={(el) => {
              items.current[(onVideo ? VIDEO_PRESETS.length + 2 : 0) + EXPORT_PRESETS.length] = el;
            }}
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              close();
              onOpen();
            }}
          >
            <span className="font-medium">All formats &amp; settings…</span>
            <span className="text-xs text-muted">HEVC, AV1, WebM, ProRes, GIF, PNG, JPG, MP3, M4A, WAV · size, quality</span>
          </button>
          {onThumbnail && (
            <button
              ref={(el) => {
                items.current[(onVideo ? VIDEO_PRESETS.length + 2 : 0) + EXPORT_PRESETS.length + 1] = el;
              }}
              type="button"
              role="menuitem"
              className={item}
              onClick={() => {
                close();
                onThumbnail();
              }}
            >
              <span className="font-medium">Thumbnail maker…</span>
              <span className="text-xs text-muted">YouTube thumbnail or Shorts cover from the frame at the playhead</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
