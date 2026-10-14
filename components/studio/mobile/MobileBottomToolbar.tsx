"use client";

import { Icon, type IconName } from "@/components/ui/Icon";

export type MobileTab =
  | "edit"
  | "audio"
  | "text"
  | "effects"
  | "filters"
  | "ai"
  | "more";

export type MobileBottomToolbarProps = {
  activeTab: MobileTab | null;
  onSelectTab: (tab: MobileTab) => void;
  selectedId?: string | null;
  onDeselectClip?: () => void;
  onAddMedia?: () => void;
  onSplit?: () => void;
  onCrop?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onBgRemoval?: () => void;
  className?: string;
};

const CREATION_TABS: { id: MobileTab; label: string; icon: IconName }[] = [
  { id: "edit", label: "Edit", icon: "cut" },
  { id: "audio", label: "Audio", icon: "audio" },
  { id: "text", label: "Text", icon: "text" },
  { id: "effects", label: "Effects", icon: "effects" },
  { id: "filters", label: "Filters", icon: "palette" },
  { id: "ai", label: "AI", icon: "ai" },
  { id: "more", label: "More", icon: "elements" },
];

export function MobileBottomToolbar({
  activeTab,
  onSelectTab,
  selectedId,
  onDeselectClip,
  onAddMedia,
  onSplit,
  onCrop,
  onDuplicate,
  onDelete,
  onBgRemoval,
  className = "",
}: MobileBottomToolbarProps) {
  const isClipSelected = !!selectedId;

  if (isClipSelected) {
    // Mode 2: YouTube Create Contextual Clip Action Bar
    return (
      <nav
        aria-label="Clip Editing Tools"
        className={`sticky bottom-0 z-40 flex w-full shrink-0 items-center gap-1 border-t border-line/60 bg-[#0f0f0f]/98 backdrop-blur-xl px-2 py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] shadow-2xl select-none overflow-x-auto no-scrollbar ${className}`}
      >
        {/* Deselect / Done Button */}
        {onDeselectClip && (
          <button
            type="button"
            onClick={onDeselectClip}
            className="flex flex-col items-center justify-center gap-0.5 rounded-xl border border-line/60 bg-surface px-2.5 py-1 text-ink active:scale-95 transition-all shrink-0 cursor-pointer min-w-[48px]"
            title="Done editing clip"
            aria-label="Done editing clip"
          >
            <Icon name="check" className="size-4 text-primary" />
            <span className="text-[10px] font-semibold">Done</span>
          </button>
        )}

        <div className="h-6 w-px bg-line/60 shrink-0 mx-0.5" />

        {/* Split */}
        {onSplit && (
          <button
            type="button"
            onClick={onSplit}
            className="flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-muted hover:text-ink hover:bg-raised/40 active:scale-95 transition-all shrink-0 cursor-pointer min-w-[48px]"
            title="Split clip at playhead"
            aria-label="Split"
          >
            <Icon name="split" className="size-4 text-ink" />
            <span className="text-[10px] leading-tight">Split</span>
          </button>
        )}

        {/* Edit / Adjust Sheet (Speed, Volume, Trim details) */}
        <button
          type="button"
          onClick={() => onSelectTab("edit")}
          className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 transition-all shrink-0 cursor-pointer min-w-[48px] ${
            activeTab === "edit"
              ? "bg-primary text-white shadow-xs font-semibold"
              : "text-muted hover:text-ink hover:bg-raised/40"
          }`}
          title="Adjust Speed, Volume, Trim"
          aria-label="Edit"
        >
          <Icon name="cut" className={`size-4 ${activeTab === "edit" ? "text-white" : "text-ink"}`} />
          <span className="text-[10px] leading-tight">Edit</span>
        </button>

        {/* Filters */}
        <button
          type="button"
          onClick={() => onSelectTab("filters")}
          className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 transition-all shrink-0 cursor-pointer min-w-[48px] ${
            activeTab === "filters"
              ? "bg-primary text-white shadow-xs font-semibold"
              : "text-muted hover:text-ink hover:bg-raised/40"
          }`}
          title="Color filters & LUTs"
          aria-label="Filters"
        >
          <Icon name="palette" className={`size-4 ${activeTab === "filters" ? "text-white" : "text-ink"}`} />
          <span className="text-[10px] leading-tight">Filters</span>
        </button>

        {/* Effects */}
        <button
          type="button"
          onClick={() => onSelectTab("effects")}
          className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 transition-all shrink-0 cursor-pointer min-w-[48px] ${
            activeTab === "effects"
              ? "bg-primary text-white shadow-xs font-semibold"
              : "text-muted hover:text-ink hover:bg-raised/40"
          }`}
          title="Transitions & Visual effects"
          aria-label="Effects"
        >
          <Icon name="effects" className={`size-4 ${activeTab === "effects" ? "text-white" : "text-ink"}`} />
          <span className="text-[10px] leading-tight">Effects</span>
        </button>

        {/* Crop */}
        {onCrop && (
          <button
            type="button"
            onClick={onCrop}
            className="flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-muted hover:text-ink hover:bg-raised/40 active:scale-95 transition-all shrink-0 cursor-pointer min-w-[48px]"
            title="Crop clip"
            aria-label="Crop"
          >
            <Icon name="crop" className="size-4 text-ink" />
            <span className="text-[10px] leading-tight">Crop</span>
          </button>
        )}

        {/* BG Removal / Cutout */}
        {onBgRemoval && (
          <button
            type="button"
            onClick={onBgRemoval}
            className="flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-muted hover:text-ink hover:bg-raised/40 active:scale-95 transition-all shrink-0 cursor-pointer min-w-[48px]"
            title="Remove background / Cutout"
            aria-label="Cutout"
          >
            <Icon name="wand" className="size-4 text-ink" />
            <span className="text-[10px] leading-tight">Cutout</span>
          </button>
        )}

        {/* Duplicate */}
        {onDuplicate && (
          <button
            type="button"
            onClick={onDuplicate}
            className="flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-muted hover:text-ink hover:bg-raised/40 active:scale-95 transition-all shrink-0 cursor-pointer min-w-[48px]"
            title="Duplicate clip"
            aria-label="Duplicate"
          >
            <Icon name="copy" className="size-4 text-ink" />
            <span className="text-[10px] leading-tight">Duplicate</span>
          </button>
        )}

        {/* Delete */}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-rose-500 hover:bg-rose-500/10 active:scale-95 transition-all shrink-0 cursor-pointer min-w-[48px]"
            title="Delete clip"
            aria-label="Delete"
          >
            <Icon name="trash" className="size-4 text-rose-500" />
            <span className="text-[10px] leading-tight">Delete</span>
          </button>
        )}
      </nav>
    );
  }

  // Mode 1: YouTube Create Minimalist Creation Toolbar (No clip selected)
  return (
    <nav
      aria-label="Mobile Editing Tools"
      className={`sticky bottom-0 z-40 flex w-full shrink-0 items-center justify-around border-t border-line/60 bg-[#0f0f0f]/98 backdrop-blur-xl px-1 py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] shadow-2xl select-none ${className}`}
    >
      {/* Optional Quick Add Media button */}
      {onAddMedia && (
        <button
          type="button"
          onClick={onAddMedia}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1 px-0.5 transition-all active:scale-95 cursor-pointer min-w-0 text-primary hover:bg-primary/10"
          title="Add video, photo or audio file"
          aria-label="Add Media"
        >
          <div className="flex size-5 items-center justify-center rounded-full bg-primary text-white shadow-xs">
            <Icon name="plus" className="size-3" />
          </div>
          <span className="truncate text-[10px] font-semibold leading-tight tracking-tight">
            Add
          </span>
        </button>
      )}

      {/* Primary Creation Tools */}
      {CREATION_TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelectTab(tab.id)}
            aria-label={tab.label}
            aria-pressed={isActive}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1 px-0.5 transition-all active:scale-95 cursor-pointer min-w-0 ${
              isActive
                ? "bg-primary text-white shadow-xs font-semibold"
                : "text-muted hover:text-ink hover:bg-raised/40"
            }`}
          >
            <Icon
              name={tab.icon}
              className={`size-4.5 shrink-0 ${isActive ? "text-white" : "text-muted"}`}
            />
            <span className="truncate text-[10px] leading-tight tracking-tight">
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
