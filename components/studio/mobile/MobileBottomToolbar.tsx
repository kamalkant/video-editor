"use client";

import { Icon, type IconName } from "@/components/ui/Icon";

export type MobileTab =
  | "edit"
  | "audio"
  | "text"
  | "effects"
  | "filters"
  | "ai"
  | "more"
  | "settings";

type Panel = "library" | "media" | "templates" | "brand" | "background" | "subtitles" | "elements";

export type MobileBottomToolbarProps = {
  activeTab: MobileTab | null;
  onSelectTab: (tab: MobileTab) => void;
  selectedId?: string | null;
  onDeselectClip?: () => void;
  onAddMedia?: () => void;
  /** A full-screen panel (Media, Captions, Elements). */
  onOpenPanel?: (panel: Panel) => void;
  onSplit?: () => void;
  onCrop?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onBgRemoval?: () => void;
  className?: string;
};

type Tool = { label: string; icon: IconName; tab?: MobileTab; panel?: Panel };

/** Nothing selected: what you add (the desktop rail's items, in the same order, as in Clideo). */
const ADD_TOOLS: Tool[] = [
  { label: "Media", icon: "media", panel: "media" },
  { label: "Text", icon: "text", tab: "text" },
  { label: "Captions", icon: "subtitles", panel: "subtitles" },
  { label: "Elements", icon: "elements", panel: "elements" },
  { label: "Audio", icon: "audio", tab: "audio" },
  { label: "Effects", icon: "effects", tab: "effects" },
  { label: "Filters", icon: "palette", tab: "filters" },
  { label: "AI", icon: "ai", tab: "ai" },
  { label: "Canvas", icon: "background", tab: "more" },
];

const bar =
  "sticky bottom-0 z-40 flex w-full shrink-0 items-stretch gap-1 overflow-x-auto border-t border-line bg-surface px-2 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] scrollbar-none";
const item = (on: boolean, danger = false) =>
  `flex min-w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-xl px-2 py-1 text-2xs leading-tight transition-all active:scale-95 ${
    on ? "bg-primary-soft font-semibold text-ink" : danger ? "text-danger" : "text-muted hover:bg-raised/40 hover:text-ink"
  }`;

/** The strip at the bottom of the phone editor: add tools, or the selected clip's tools. It scrolls sideways. */
export function MobileBottomToolbar({
  activeTab,
  onSelectTab,
  selectedId,
  onDeselectClip,
  onAddMedia,
  onOpenPanel,
  onSplit,
  onCrop,
  onDuplicate,
  onDelete,
  onBgRemoval,
  className = "",
}: MobileBottomToolbarProps) {
  if (selectedId) {
    const clipTools: { label: string; icon: IconName; tab?: MobileTab; run?: () => void; danger?: boolean }[] = [
      { label: "Settings", icon: "settings", tab: "settings" },
      ...(onSplit ? [{ label: "Split", icon: "split" as IconName, run: onSplit }] : []),
      { label: "Edit", icon: "cut", tab: "edit" },
      ...(onCrop ? [{ label: "Crop", icon: "crop" as IconName, run: onCrop }] : []),
      ...(onBgRemoval ? [{ label: "Cutout", icon: "wand" as IconName, run: onBgRemoval }] : []),
      { label: "Filters", icon: "palette", tab: "filters" },
      { label: "Effects", icon: "effects", tab: "effects" },
      ...(onDuplicate ? [{ label: "Duplicate", icon: "copy" as IconName, run: onDuplicate }] : []),
      ...(onDelete ? [{ label: "Delete", icon: "trash" as IconName, run: onDelete, danger: true }] : []),
    ];
    return (
      <nav aria-label="Clip Editing Tools" className={`${bar} ${className}`}>
        {onDeselectClip && (
          <button type="button" onClick={onDeselectClip} className={`${item(false)} border border-line text-ink`} aria-label="Done editing clip">
            <Icon name="check" className="size-5 text-primary" />
            <span className="font-semibold">Done</span>
          </button>
        )}
        {clipTools.map((t) => {
          const on = !!t.tab && activeTab === t.tab;
          return (
            <button
              key={t.label}
              type="button"
              aria-label={t.label}
              aria-pressed={t.tab ? on : undefined}
              onClick={() => (t.tab ? onSelectTab(t.tab) : t.run?.())}
              className={item(on, t.danger)}
            >
              <Icon name={t.icon} className="size-5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <nav aria-label="Mobile Editing Tools" className={`${bar} ${className}`}>
      {onAddMedia && (
        <button
          type="button"
          onClick={onAddMedia}
          className="mr-1 flex size-11 shrink-0 items-center justify-center self-center rounded-full bg-primary text-white shadow-sm active:scale-95"
          title="Add video, photo or audio file"
          aria-label="Add Media"
        >
          <Icon name="plus" className="size-5" strokeWidth={2.5} />
        </button>
      )}
      {ADD_TOOLS.map((t) => {
        const on = !!t.tab && activeTab === t.tab;
        return (
          <button
            key={t.label}
            type="button"
            aria-label={t.label}
            aria-pressed={t.tab ? on : undefined}
            onClick={() => (t.tab ? onSelectTab(t.tab) : t.panel && onOpenPanel?.(t.panel))}
            className={item(on)}
          >
            <Icon name={t.icon} className="size-5" />
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
