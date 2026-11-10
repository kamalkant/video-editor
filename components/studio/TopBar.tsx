"use client";

import { jobProgress } from "@/lib/export/progress";
import Link from "next/link";
import { useState, type ComponentProps, type RefObject } from "react";
import { Icon } from "@/components/ui/Icon";
import { useModKey } from "@/lib/editor/platform";
import type { ExportPresetId, VideoPresetId } from "@/lib/export/presets";
import type { Job } from "@/lib/jobs/queue";
import { formatFps, formatTime } from "@/lib/format";
import type { ProjectRef, SaveState } from "@/lib/projects/useProjectSync";
import type { VideoMeta } from "@/lib/videos";
import { ExportMenu } from "./ExportMenu";
import { MoreMenu } from "./MoreMenu";
import { ProjectFacts } from "./ProjectFacts";
import { ProjectMenu } from "./ProjectMenu";
import { TasksButton } from "./TasksButton";
import { UserMenu } from "./UserMenu";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import type { VersionsProps } from "./VersionsMenu";
import { useLiveJob } from "@/lib/export/liveJob";

function ProjectName({ name, onRename, inputRef }: { name: string; onRename: (n: string) => void; inputRef?: RefObject<HTMLInputElement | null> }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const n = (draft ?? "").replace(/\s+/g, " ").trim();
    setDraft(null);
    if (n && n !== name) onRename(n);
  };
  return (
    <input
      ref={inputRef}
      className="field-sizing-content min-w-10 max-w-56 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-semibold hover:border-control focus:border-control focus:bg-raised"
      aria-label="Project name"
      value={draft ?? name}
      maxLength={80}
      onFocus={(e) => {
        setDraft(name);
        e.currentTarget.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(name);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}

/**
 * The top bar: the project (name, menu, save state, size and length) on the
 * left, and on the right: Search tools, background tasks, AI, versions, focus
 * mode, undo / redo, help, theme and Export. (The panels are on the left rail.)
 */
export function TopBar(p: {
  video: VideoMeta | null;
  job: Job | null;
  project: ProjectRef | null;
  saveState: SaveState;
  saveError: string | null;
  onRename: (name: string) => void;
  onRetrySave: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onChangeVideo: () => void;
  onExport: () => void;
  onShare?: () => void;
  onQuickExport: (id: ExportPresetId) => void;
  onVideoExport?: (id: VideoPresetId | "project" | "social-set") => void;
  /** Export ▾ → Thumbnail maker */
  onThumbnail?: () => void;
  videoDisabled?: string | null;
  quickDisabled: string | null;
  onHelp: () => void;
  onHome: () => void;
  uploading: boolean;
  /** Clips on the timeline. */
  clipCount?: number;
  /** the project's size, frame rate and length (null: nothing on the timeline yet) */
  facts: Omit<ComponentProps<typeof ProjectFacts>, "className"> | null;
  projectMenu: Omit<ComponentProps<typeof ProjectMenu>, "currentId" | "onRename">;
  /** the name box (Rename… focuses it) */
  nameRef: RefObject<HTMLInputElement | null>;
  onSearch: (withVoice?: boolean) => void;
  onTemplates?: () => void;
  isTemplatesActive?: boolean;
  versions: VersionsProps;
  onOpenStorage?: () => void;
  /** focus mode (null: not on this screen) */
  focus: boolean | null;
  onFocus: () => void;
  proxyMode?: boolean;
  onToggleProxy?: () => void;
}) {
  // (its percent as it is now: lib/export/liveJob; the editor itself re-renders only when the job changes shape)
  const job = useLiveJob(p.job);
  const running = job && (job.state === "queued" || job.state === "running");
  const step = job?.steps.find((s) => s.state === "running");
  const mod = useModKey();
  const iconBtn = "flex size-hit items-center justify-center rounded-md text-muted hover:bg-raised hover:text-ink disabled:opacity-35";
  const rename = () => {
    p.nameRef.current?.focus();
    p.nameRef.current?.select();
  };
  const menu = <ProjectMenu {...p.projectMenu} currentId={p.project?.id ?? null} onRename={rename} />;
  return (
    <header className="flex min-h-14 items-center gap-x-2 border-b border-line bg-surface px-3 py-1 sm:gap-x-3">
      <a
        href="https://viplay.in"
        className="flex min-h-hit shrink-0 items-center gap-2 rounded-md pr-1 text-ink no-underline hover:opacity-85 transition-opacity"
        title="Return to ViPlay Main Site"
        aria-label="ViPlay Main Site"
      >
        <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center">
          <img src="/vdo-icon.png" alt="ViPlay Logo" className="size-full object-contain drop-shadow-[0_2px_6px_rgba(59,130,246,0.25)] transition-transform hover:scale-105" />
        </span>
        <span className="flex flex-col leading-tight max-[1439px]:sr-only">
          <span className="text-base font-bold tracking-tight">ViPlay</span>
        </span>
      </a>
      <span className="text-muted text-xs font-semibold px-0.5" aria-hidden>/</span>
      <button
        type="button"
        onClick={p.onHome}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-muted hover:bg-raised hover:text-ink transition"
        title="New project with default settings"
      >
        <span>Video Studio</span>
      </button>
      <span aria-hidden="true" className="h-7 w-px bg-line max-sm:hidden" />
      <div className="flex min-w-0 items-center gap-2">
        {p.project ? (
          <>
            <span className="flex min-w-0 items-center">
              <ProjectName name={p.project.name} onRename={p.onRename} inputRef={p.nameRef} />
              {menu}
            </span>
            <span className="shrink-0 text-xs text-muted max-sm:hidden" data-testid="save-state">
              {p.saveState === "saving" ? "Saving…" : p.saveState === "saved" ? "✓ Saved" : null}
            </span>
            {p.saveState === "error" && (
              <span role="alert" className="flex shrink-0 items-center gap-1 text-xs text-danger" title={p.saveError ?? undefined}>
                Not saved
                <button type="button" className="underline" onClick={p.onRetrySave}>
                  Retry
                </button>
              </span>
            )}
          </>
        ) : p.video ? (
          <span className="min-w-0 max-sm:hidden">
            <span className="block truncate text-sm font-medium" title={p.video.fileName}>
              {p.video.fileName}
            </span>
            <span className="block text-xs text-muted">
              {p.video.info.width}×{p.video.info.height} · {formatFps(p.video.info.fps)} fps · {formatTime(p.video.info.duration)}
            </span>
          </span>
        ) : (
          <>
            {/* <span className="truncate text-sm text-muted max-sm:hidden">Studio · record · remove backgrounds</span> */}
            <span className="max-sm:hidden">{menu}</span>
          </>
        )}
      </div>
      <div className="ml-auto flex items-center gap-1">
        {/* (Search tools: ⌘K, or under ⋯; the theme is under ⋯ too. The bar keeps only what is used all the time.) */}
        <span className="flex items-center gap-0.5 max-sm:hidden">
          <TasksButton className={iconBtn} />
        </span>
        <button type="button" className={iconBtn} onClick={p.onUndo} disabled={!p.canUndo} aria-label="Undo" title={`Undo (${mod} Z)`}>
          <Icon name="undo" className="size-5" />
        </button>
        {/* (on the smallest phones Redo makes room for the theme button; Undo stays) */}
        <button type="button" className={`${iconBtn} max-[379px]:hidden`} onClick={p.onRedo} disabled={!p.canRedo} aria-label="Redo" title={`Redo (${mod} Shift Z)`}>
          <Icon name="redo" className="size-5" />
        </button>
        {/* the rest, when it's wanted: versions, focus mode, 720p proxies, API keys, help (and on phones: search, add media, theme) */}
        <MoreMenu
          className={iconBtn}
          onSearch={p.onSearch}
          onAddMedia={p.uploading ? null : p.onChangeVideo}
          onVersions={p.project ? p.projectMenu.onVersions : null}
          onHelp={p.onHelp}
          focus={p.focus}
          onFocus={p.onFocus}
          proxyMode={p.onToggleProxy ? !!p.proxyMode : null}
          onToggleProxy={p.onToggleProxy}
        />
        <ExportMenu
          label={
            running
              ? `Exporting${step ? `\u00A0${jobProgress(job)}%` : "…"}`
              : job?.state === "done"
                ? "Export ✓"
                : "Export"
          }
          onOpen={p.onExport}
          onQuick={p.onQuickExport}
          quickDisabled={p.quickDisabled}
          onVideo={p.onVideoExport}
          videoDisabled={p.videoDisabled}
          onThumbnail={p.onThumbnail}
        />
        <span aria-hidden="true" className="mx-0.5 h-6 w-px bg-line" />
        <NotificationBell className={iconBtn} />
        <UserMenu onOpenStorage={p.onOpenStorage} />
      </div>
    </header>
  );
}
