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
  className?: string;
};

const TABS: { id: MobileTab; label: string; icon: IconName }[] = [
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
  className = "",
}: MobileBottomToolbarProps) {
  return (
    <nav
      aria-label="Mobile Editing Tools"
      className={`sticky bottom-0 z-40 flex w-full shrink-0 items-center justify-around border-t border-line bg-surface/98 backdrop-blur-md px-1 py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] shadow-lg select-none ${className}`}
    >
      {TABS.map((tab) => {
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
