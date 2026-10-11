"use client";

import { ContextMenu, useMenuButton, type MenuItem } from "@/components/ui/ContextMenu";
import { Icon } from "@/components/ui/Icon";
import { Tip } from "@/components/ui/Tip";
import { formatAgo, formatTime } from "@/lib/format";
import type { ProjectSummary } from "@/lib/projects/model";

/** Projects listed to switch to. */
export const RECENT_PROJECTS = 8;

/**
 * ▾ next to the project name: rename, duplicate, versions, new project, and
 * your saved projects to switch to. With no project open yet: "Open a project ▾".
 */
export function ProjectMenu(p: {
  currentId: string | null;
  projects: ProjectSummary[];
  onOpen: (id: string) => void;
  onNew: () => void;
  /** A new project that starts with a blank scene. */
  onNewBlank: () => void;
  onDuplicate: () => void;
  onRename: () => void;
  onVersions: () => void;
  onChooseFolder?: () => void;
  deviceFolderName?: string | null;
  onExportVDO?: (portable: boolean) => void;
  onAll: () => void;
  /** read the list again when the menu opens */
  onRefresh: () => void;
}) {
  const { at, close, buttonProps } = useMenuButton(p.onRefresh);
  const getAutosaveDetail = (name?: string | null) => {
    const clean = (name || "").toLowerCase().trim();
    if (!name || clean === "vdo" || clean === "vido" || clean.includes("vdo") || clean.includes("vido") || clean.includes("documents")) {
      return "Autosaving to Documents/vdo";
    }
    return `Autosaving to ${name}`;
  };
  const recent = p.projects.slice(0, RECENT_PROJECTS);
  const switchTo: MenuItem[] = recent.map((x) => ({
    label: x.name,
    detail: `${x.id === p.currentId ? "Open now" : `Edited ${formatAgo(x.updatedAt)}`} · ${formatTime(x.duration)}${x.missing ? " · a video is missing" : ""}`,
    image: x.coverId ? `/api/videos/${x.coverId}/thumb` : null,
    checked: x.id === p.currentId,
    disabled: x.id === p.currentId,
    onSelect: () => p.onOpen(x.id),
  }));
  const items: MenuItem[] = p.currentId
    ? [
        { label: "Rename…", onSelect: p.onRename },
        { label: "Duplicate", detail: "Make a copy and open it", onSelect: p.onDuplicate },
        { label: "Save a version…", onSelect: p.onVersions },
        ...(p.onChooseFolder
          ? [
              {
                label: "Choose Mac Folder…",
                detail: getAutosaveDetail(p.deviceFolderName),
                onSelect: p.onChooseFolder,
              },
            ]
          : []),
        ...(p.onExportVDO
          ? [
              "separator" as const,
              { heading: "ViPlay Package" },
              { label: "Export Project (.VDO)", detail: "Saves project metadata and references", onSelect: () => p.onExportVDO?.(false) },
              { label: "Export Portable (.VDO)", detail: "Self-contained package with all media files", onSelect: () => p.onExportVDO?.(true) },
            ]
          : []),
        "separator" as const,
        { label: "New project", onSelect: p.onNew },
        { label: "New project with a blank", detail: "Starts with a 3-second blank scene", onSelect: p.onNewBlank },
        "separator" as const,
        { heading: "Switch project" },
        ...switchTo,
        { label: "All projects…", onSelect: p.onAll },
      ]
    : [
        { heading: "Open a project" },
        ...switchTo,
        { label: "All projects…", onSelect: p.onAll },
        ...(p.onChooseFolder
          ? [
              "separator" as const,
              {
                label: "Choose Mac Folder…",
                detail: getAutosaveDetail(p.deviceFolderName),
                onSelect: p.onChooseFolder,
              },
            ]
          : []),
      ];
  if (!p.currentId && !p.projects.length) return null;
  return (
    <>
      {p.currentId ? (
        <Tip text="Project menu: rename, duplicate, versions, switch project" side="bottom" off={!!at}>
          <button type="button" aria-label="Project menu" {...buttonProps} className={`flex size-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-ink ${at ? "bg-raised text-ink" : ""}`}>
            <Icon name="chevronDown" className="size-4" />
          </button>
        </Tip>
      ) : (
        <button type="button" {...buttonProps} className="flex min-h-8 shrink-0 items-center gap-1 rounded-md border border-line px-2 text-xs text-muted hover:border-control hover:text-ink">
          <Icon name="projects" className="size-4" />
          Open a project
          <Icon name="chevronDown" className="size-3" />
        </button>
      )}
      {at && <ContextMenu x={at.x} y={at.y} width={288} items={items} label="Project menu" onClose={close} />}
    </>
  );
}
