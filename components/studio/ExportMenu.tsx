"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { EXPORT_PRESETS, VIDEO_PRESETS, type ExportPresetId, type VideoPresetId } from "@/lib/export/presets";

/** The qualities offered first (as in Clideo): the short side of the picture, in pixels. */
export type ExportQuality = 480 | 720 | 1080 | 2160 | "gif";
const QUALITIES: { id: ExportQuality; label: string; detail: string }[] = [
  { id: 480, label: "480p", detail: "Standard quality" },
  { id: 720, label: "720p", detail: "Standard quality, HD" },
  { id: 1080, label: "1080p", detail: "High quality, Full HD" },
  { id: 2160, label: "2160p", detail: "High quality, 4K" },
];

/**
 * The Export button: a small box to choose the quality, then Continue (as in Clideo). "More options" in it
 * lists the quick presets (social sizes, see-through website packs) and opens the dialog with every format.
 * While an export is running or ready, the button opens the dialog straight away.
 */
export function ExportMenu({
  label,
  onOpen,
  onQuick,
  quickDisabled,
  onVideo,
  videoDisabled,
  onThumbnail,
  onQuality,
  gifDisabled,
  canvas,
  hasJob,
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
  /** Make an MP4 with this short side (the shape stays the project's), or a GIF. */
  onQuality?: (q: ExportQuality) => void;
  gifDisabled?: string | null;
  /** The project's size (the tiles show the size each quality gives; the nearest one starts selected). */
  canvas?: { width: number; height: number };
  /** An export is running or ready: the button opens the dialog. */
  hasJob?: boolean;
}) {
  // (the box: the quality tiles first; "more": the list of quick presets)
  const [box, setBox] = useState<null | "quality" | "more">(null);
  const open = box === "more";
  const setOpen = (o: boolean | ((x: boolean) => boolean)) => setBox((b) => ((typeof o === "function" ? o(b === "more") : o) ? "more" : null));
  const short = canvas ? Math.min(canvas.width, canvas.height) : 1080;
  const nearest = ([...QUALITIES].reverse().find((q) => (q.id as number) <= short)?.id ?? 480) as ExportQuality;
  const [quality, setQuality] = useState<ExportQuality | null>(null);
  const chosen = quality ?? nearest;
  const sizeOf = (q: number) => {
    if (!canvas) return "";
    const k = q / short;
    const even = (n: number) => Math.max(2, Math.round((n * k) / 2) * 2);
    return `${even(canvas.width)} × ${even(canvas.height)}`;
  };
  const wrap = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!box) return;
    if (box === "more") items.current[0]?.focus();
    const outside = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setBox(null);
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, [box]);

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
    <div ref={wrap} className="relative ml-1 flex shrink-0">
      <button
        ref={toggle}
        type="button"
        data-testid="export-button"
        className="btn btn-primary shrink-0 whitespace-nowrap px-3.5 max-sm:px-2.5"
        aria-haspopup={hasJob || !onQuality ? undefined : "dialog"}
        aria-expanded={hasJob || !onQuality ? undefined : !!box}
        onClick={() => (hasJob || !onQuality ? onOpen() : setBox((b) => (b ? null : "quality")))}
      >
        <Icon name="export" className="size-4 shrink-0" />
        <span className="whitespace-nowrap max-sm:sr-only">{label}</span>
      </button>
      {box === "quality" && onQuality && (
        <div
          role="dialog"
          aria-label="Export settings"
          data-testid="export-quality"
          className="anim-rise absolute right-0 top-full z-50 mt-1 w-80 rounded-xl border border-control bg-surface p-4 shadow-2xl"
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopPropagation();
            close();
          }}
        >
          <p className="mb-3 text-center text-sm font-medium text-muted">Export settings</p>
          <div role="radiogroup" aria-label="Quality" className="grid grid-cols-2 gap-2">
            {QUALITIES.map((q) => {
              const on = chosen === q.id;
              return (
                <button
                  key={q.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={`${q.label}. ${q.detail}`}
                  title={sizeOf(q.id as number)}
                  onClick={() => setQuality(q.id)}
                  className={`flex flex-col items-center gap-0.5 rounded-lg border px-2 py-3 ${on ? "border-primary bg-primary-soft text-ink" : "border-transparent bg-raised text-muted hover:text-ink"}`}
                >
                  <span className="text-sm font-semibold">{q.label}</span>
                  <span className="text-2xs">{q.detail}</span>
                </button>
              );
            })}
            <button
              type="button"
              role="radio"
              aria-checked={chosen === "gif"}
              aria-label="GIF. For projects up to 30 seconds"
              aria-disabled={!!gifDisabled}
              title={gifDisabled ?? undefined}
              onClick={() => !gifDisabled && setQuality("gif")}
              className={`col-span-2 flex flex-col items-center gap-0.5 rounded-lg border px-2 py-3 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ${chosen === "gif" ? "border-primary bg-primary-soft text-ink" : "border-transparent bg-raised text-muted hover:text-ink"}`}
            >
              <span className="text-sm font-semibold">GIF</span>
              <span className="text-2xs">For projects up to 30 seconds</span>
            </button>
          </div>
          {chosen !== "gif" && canvas && (
            <p className="mt-2 text-center text-2xs text-muted" data-testid="export-quality-size">
              MP4 · {sizeOf(chosen as number)}
            </p>
          )}
          <button
            type="button"
            className="btn btn-primary mt-3 w-full justify-center"
            aria-disabled={!!videoDisabled}
            title={videoDisabled ?? undefined}
            onClick={() => {
              if (videoDisabled) return;
              setBox(null);
              onQuality(chosen);
            }}
          >
            Continue
          </button>
          {videoDisabled && <p className="mt-1.5 text-center text-2xs text-muted">{videoDisabled}</p>}
          <button
            type="button"
            className="mt-2 w-full rounded-md py-1.5 text-center text-xs text-link hover:bg-raised"
            aria-label="Export options"
            aria-haspopup="menu"
            onClick={() => setBox("more")}
          >
            More options
          </button>
        </div>
      )}
      {open && (
        <div role="menu" aria-label="Export options" className="absolute right-0 top-full z-50 mt-1 max-h-[80dvh] w-80 overflow-y-auto rounded-lg border border-control bg-surface p-1 shadow-2xl" onKeyDown={onKey}>
          {onVideo && (
            <>
              <p className="px-3 pb-0.5 pt-1.5 text-2xs font-semibold uppercase tracking-wide text-muted">
                Video (MP4) <span className="ml-1 rounded bg-primary px-1 py-px text-2xs text-white">Recommended</span>
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
              <p className="px-3 pb-0.5 pt-2 text-2xs font-semibold uppercase tracking-wide text-muted">See-through video (alpha)</p>
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
