"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import type { ProjectRef, SaveState } from "@/lib/projects/useProjectSync";

export type MobileTopBarProps = {
  projectName?: string;
  project?: ProjectRef | null;
  saveState?: SaveState;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onHome: () => void;
  onExport: () => void;
  onOpenProjects?: () => void;
  className?: string;
};

export function MobileTopBar({
  projectName = "Untitled project",
  saveState = "saved",
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onHome,
  onExport,
  onOpenProjects,
  className = "",
}: MobileTopBarProps) {
  return (
    <header
      className={`sticky top-0 z-40 flex h-11 w-full shrink-0 items-center justify-between border-b border-line bg-surface/98 backdrop-blur-md px-2.5 pt-[env(safe-area-inset-top)] shadow-xs select-none ${className}`}
    >
      {/* Left: Back / Home and Project Name */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <button
          type="button"
          onClick={onHome}
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-ink active:scale-95 transition-all"
          title="Home / Back"
          aria-label="Home"
        >
          <Icon name="chevronLeft" className="size-4" />
        </button>

        <button
          type="button"
          onClick={onOpenProjects}
          className="flex items-center gap-1 min-w-0 rounded-md px-1.5 py-0.5 hover:bg-raised transition-colors text-left"
          title="Project settings / switch project"
        >
          <span className="truncate text-xs font-semibold text-ink max-w-[130px] sm:max-w-[200px]">
            {projectName}
          </span>
          <Icon name="chevronDown" className="size-3 text-muted shrink-0" />
        </button>

        {/* Save status icon */}
        {saveState === "saving" && (
          <span
            className="size-1.5 rounded-full bg-amber-500 animate-pulse shrink-0"
            title="Saving changes…"
          />
        )}
        {saveState === "saved" && (
          <span className="text-[10px] text-muted shrink-0 hidden sm:inline" title="All changes saved">
            ✓
          </span>
        )}
      </div>

      {/* Right: Undo, Redo, Export */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className="flex size-7 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-ink disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition-all"
          title="Undo"
          aria-label="Undo"
        >
          <Icon name="undo" className="size-3.5" />
        </button>

        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          className="flex size-7 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-ink disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition-all"
          title="Redo"
          aria-label="Redo"
        >
          <Icon name="redo" className="size-3.5" />
        </button>

        <button
          type="button"
          onClick={onExport}
          className="flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white shadow-xs hover:bg-primary/90 active:scale-95 transition-all"
          title="Export video"
        >
          <span>Export</span>
        </button>
      </div>
    </header>
  );
}
