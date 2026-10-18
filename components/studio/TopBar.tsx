"use client";

import Link from "next/link";
import { useState, type ComponentProps, type ReactElement, type RefObject } from "react";
import { Icon } from "@/components/ui/Icon";
import { VoiceSearchMic } from "@/components/ui/VoiceSearchMic";
import { Tip } from "@/components/ui/Tip";
import { useModKey } from "@/lib/editor/platform";
import type { ExportPresetId, VideoPresetId } from "@/lib/export/presets";
import type { Job } from "@/lib/jobs/queue";
import { formatFps, formatTime } from "@/lib/format";
import type { ProjectRef, SaveState } from "@/lib/projects/useProjectSync";
import type { VideoMeta } from "@/lib/videos";
import { AiStatus } from "./AiStatus";
import { ExportMenu } from "./ExportMenu";
import { MoreMenu } from "./MoreMenu";
import { ProjectFacts } from "./ProjectFacts";
import { ProjectMenu } from "./ProjectMenu";
import { TasksButton } from "./TasksButton";
import { ThemeMenu } from "./ThemeMenu";
import { UserMenu } from "./UserMenu";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { VersionsMenu, type VersionsProps } from "./VersionsMenu";
import { useAuth } from "@/lib/auth/AuthContext";

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
  const running = p.job && (p.job.state === "queued" || p.job.state === "running");
  const step = p.job?.steps.find((s) => s.state === "running");
  const mod = useModKey();
  const { isAdmin } = useAuth();
  const iconBtn = "flex size-hit items-center justify-center rounded-md text-muted hover:bg-raised hover:text-ink disabled:opacity-35";
  const rename = () => {
    p.nameRef.current?.focus();
    p.nameRef.current?.select();
  };
  const menu = <ProjectMenu {...p.projectMenu} currentId={p.project?.id ?? null} onRename={rename} />;
  const tip = (text: string, el: ReactElement<{ "aria-describedby"?: string }>, align: "left" | "center" | "right" = "center") => (
    <Tip text={text} side="bottom" align={align}>
      {el}
    </Tip>
  );
  return (
    <header className="flex min-h-14 items-center gap-x-2 border-b border-line bg-surface px-3 py-1 sm:gap-x-3">
      <Link
        href="/"
        className="flex min-h-hit shrink-0 items-center gap-2.5 rounded-md pr-1 text-ink no-underline"
        title="New project with default settings"
        onClick={(e) => {
          // plain clicks reset in place; ⌘/Ctrl-click still opens a new tab
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          p.onHome();
        }}
      >
        <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center">
          <img src="/vdo-icon.png" alt="ViPlay Logo" className="size-full object-contain drop-shadow-[0_2px_6px_rgba(59,130,246,0.25)]" />
        </span>
        <span className="flex flex-col leading-tight max-[1439px]:sr-only">
          <span className="text-base font-bold tracking-tight">
            ViPlay <span className="font-semibold text-muted text-xs">Studio</span>
          </span>
          <span className="text-[0.625rem] text-muted max-md:hidden">Create • Generate • Edit • Compose</span>
        </span>
        <span className="sr-only"> — new project</span>
      </Link>
      <span aria-hidden="true" className="h-7 w-px bg-line max-sm:hidden" />
      {/* Ecosystem Switcher */}
      <nav aria-label="Ecosystem Portals" className="flex items-center gap-1 bg-surface-raised border border-line rounded-lg p-0.5 text-xs max-sm:hidden">
        <Link
          href="/editor"
          className="px-2 py-0.5 rounded-md bg-primary text-white font-medium text-[11px] shadow-xs"
          title="ViPlay Studio Editor"
        >
          Studio
        </Link>
        <Link
          href="/"
          className="px-2 py-0.5 rounded-md text-muted hover:text-ink hover:bg-raised font-medium text-[11px] transition"
          title="ViPlay 3D Website & Story"
        >
          Website
        </Link>
        {isAdmin && (
          <Link
            href="/admin"
            className="px-2 py-0.5 rounded-md text-purple-600 dark:text-purple-400 hover:bg-raised font-semibold text-[11px] transition"
            title="ViPlay Admin Suite"
          >
            Admin
          </Link>
        )}
      </nav>
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
        {p.facts && (
          <span className="flex max-lg:hidden">
            <ProjectFacts {...p.facts} className={iconBtn} />
          </span>
        )}
      </div>
      <div className="ml-auto flex items-center gap-1">
        {/* Search tools (a box on wide screens, an icon below; under ⋯ on phones and tablets) */}
        <span className="mr-1 flex items-center max-lg:hidden">
          <div
            role="button"
            tabIndex={0}
            onClick={() => p.onSearch()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                p.onSearch();
              }
            }}
            aria-label={`Search tools (${mod} K)`}
            className="group hidden h-8 w-48 items-center gap-1.5 rounded-md border border-line bg-canvas px-2.5 text-xs text-muted hover:border-control hover:text-ink min-[1440px]:flex cursor-pointer transition-colors select-none"
          >
            <Icon name="search" className="size-4 shrink-0 text-muted group-hover:text-ink transition-colors" />
            <span className="flex-1 text-left truncate">Search tools…</span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                p.onSearch(true);
              }}
              className="flex items-center"
              title="Search tools by voice"
            >
              <VoiceSearchMic
                size="xs"
                onTranscript={() => {}}
              />
            </span>
            <kbd className="text-[0.6875rem] shrink-0">{mod} K</kbd>
          </div>
          {tip(
            `Search tools (${mod} K)`,
            <button
              type="button"
              className={`${iconBtn} min-[1440px]:hidden`}
              onClick={p.onSearch}
              aria-label={`Search tools (${mod} K)`}
            >
              <Icon name="search" className="size-5" />
            </button>,
          )}
        </span>
        <span className="flex items-center gap-0.5 max-sm:hidden">
          <TasksButton className={iconBtn} />
        </span>
        <span className="flex items-center gap-0.5 max-lg:hidden">
          <AiStatus className={iconBtn} />
          <span aria-hidden="true" className="mx-1 h-6 w-px bg-line" />
        </span>
        <span className="flex items-center gap-0.5 max-lg:hidden">
          <VersionsMenu {...p.versions} className={iconBtn} />
          {p.focus !== null &&
            tip(
              p.focus ? "Show the side panels (F or Esc)" : "Focus mode: hide the side panels (F)",
              <button type="button" className={`${iconBtn} ${p.focus ? "bg-primary-soft text-ink" : ""}`} onClick={p.onFocus} aria-pressed={p.focus} aria-label="Focus mode" data-testid="focus-mode">
                <Icon name="focus" className="size-5" />
              </button>,
            )}
          {p.onToggleProxy &&
            tip(
              p.proxyMode
                ? "Proxy Mode: Active (720p). Playback & scrubbing are accelerated. Final export always uses 100% original master quality."
                : "Proxy Mode: Off. Click to enable 720p fast-seeking proxies for smooth editing.",
              <button
                type="button"
                className={`${iconBtn} ${p.proxyMode ? "bg-amber-500/20 text-amber-300 border border-amber-500/40" : ""}`}
                onClick={p.onToggleProxy}
                aria-pressed={p.proxyMode}
                aria-label="Toggle proxy editing (720p)"
                data-testid="topbar-proxy-toggle"
              >
                <span className="text-[0.6875rem] font-bold tracking-tight">⚡ 720p</span>
              </button>,
            )}
          <span aria-hidden="true" className="mx-1 h-6 w-px bg-line" />
        </span>
        <button type="button" className={iconBtn} onClick={p.onUndo} disabled={!p.canUndo} aria-label="Undo" title={`Undo (${mod} Z)`}>
          <Icon name="undo" className="size-5" />
        </button>
        {/* (on the smallest phones Redo makes room for the theme button; Undo stays) */}
        <button type="button" className={`${iconBtn} max-[379px]:hidden`} onClick={p.onRedo} disabled={!p.canRedo} aria-label="Redo" title={`Redo (${mod} Shift Z)`}>
          <Icon name="redo" className="size-5" />
        </button>
        <span className="flex items-center gap-0.5 max-lg:hidden">
          <button type="button" className={iconBtn} onClick={p.onHelp} aria-label="Help and keyboard shortcuts" title="Help (?)">
            <Icon name="help" className="size-5" />
          </button>
          <ThemeMenu className={iconBtn} />
        </span>
        {/* phones and tablets: search, add media, versions, API keys, help and the theme */}
        <span className="flex lg:hidden">
          <MoreMenu className={iconBtn} onSearch={p.onSearch} onAddMedia={p.uploading ? null : p.onChangeVideo} onVersions={p.project ? p.projectMenu.onVersions : null} onHelp={p.onHelp} />
        </span>
        {p.onShare && (
          <button
            type="button"
            onClick={p.onShare}
            className="flex h-8 items-center gap-1.5 rounded-md border border-line bg-canvas px-2.5 text-xs font-medium text-ink hover:border-control hover:bg-raised transition-colors mr-1 hidden"
            aria-label="Share project"
            title="Share a preview link"
            data-testid="topbar-share-button"
          >
            <Icon name="share" className="size-3.5 text-primary" />
            <span className="max-sm:hidden">Share</span>
          </button>
        )}
        <ExportMenu
          label={
            running
              ? `Exporting${typeof step?.percent === "number" ? `\u00A0${step.percent}%` : "…"}`
              : p.job?.state === "done"
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
