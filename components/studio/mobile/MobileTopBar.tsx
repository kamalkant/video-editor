"use client";

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
      className={`sticky top-0 z-40 flex h-12 w-full shrink-0 items-center justify-between border-b border-line/60 bg-[#0f0f0f]/98 backdrop-blur-xl px-2.5 pt-[env(safe-area-inset-top)] shadow-xs select-none ${className}`}
    >
      {/* Left: Back / Home and Project Name Dropdown */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <button
          type="button"
          onClick={onHome}
          className="flex size-8 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-raised hover:text-ink active:scale-95 transition-all"
          title="Home / Back"
          aria-label="Home"
        >
          <Icon name="chevronLeft" className="size-4.5" />
        </button>

        <button
          type="button"
          onClick={onOpenProjects}
          className="flex items-center gap-1.5 min-w-0 rounded-xl px-2 py-1 hover:bg-raised/60 active:scale-98 transition-all text-left cursor-pointer border border-transparent hover:border-line/40"
          title="Switch project / Project menu"
          aria-label="Switch project"
        >
          <span className="truncate text-xs font-semibold text-ink max-w-[140px] sm:max-w-[220px]">
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
          <span className="text-2xs text-muted/70 shrink-0 hidden sm:inline" title="All changes saved">
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
          className="flex size-8 items-center justify-center rounded-xl text-muted hover:bg-raised hover:text-ink disabled:opacity-25 disabled:pointer-events-none active:scale-95 transition-all cursor-pointer"
          title="Undo"
          aria-label="Undo"
        >
          <Icon name="undo" className="size-4" />
        </button>

        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          className="flex size-8 items-center justify-center rounded-xl text-muted hover:bg-raised hover:text-ink disabled:opacity-25 disabled:pointer-events-none active:scale-95 transition-all cursor-pointer"
          title="Redo"
          aria-label="Redo"
        >
          <Icon name="redo" className="size-4" />
        </button>

        <button
          type="button"
          onClick={onExport}
          className="flex items-center gap-1 rounded-full bg-primary px-3.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-primary/90 active:scale-95 transition-all cursor-pointer ml-1"
          title="Export video"
        >
          <span>Export</span>
        </button>
      </div>
    </header>
  );
}
