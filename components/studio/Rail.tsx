"use client";

import { Icon, type IconName } from "@/components/ui/Icon";
import { useAuth } from "@/lib/auth/AuthContext";

export type PanelId = "media" | "library" | "projects" | "edit" | "output" | "text" | "templates" | "ai" | "background" | "elements" | "audio" | "subtitles" | "brand" | "effects" | "transitions";

export type RailItem = { id: PanelId | null; label: string; icon: IconName };
type Item = RailItem;

/** Desktop rail: Media, Library, Projects, Brand Kit first, then the tools. Items without an id are not built yet. */
export const DESKTOP: Item[] = [
  { id: "media", label: "Media", icon: "media" },
  { id: "projects", label: "Projects", icon: "projects" },
  { id: "brand", label: "Brand Kit", icon: "brand" },
  { id: "edit", label: "Edit", icon: "edit" },
  { id: "background", label: "Background", icon: "background" },
  { id: "ai", label: "AI Tools", icon: "ai" },
  { id: "elements", label: "Elements", icon: "elements" },
  { id: "text", label: "Text", icon: "text" },
  { id: "effects", label: "Effects", icon: "effects" },
  { id: "transitions", label: "Transitions", icon: "transitions" },
  { id: "audio", label: "Audio", icon: "audio" },
  { id: "subtitles", label: "Subtitles", icon: "subtitles" },
  { id: "templates", label: "Templates", icon: "templates" },
  { id: "library", label: "Library", icon: "library" },
];

/** Phones: a tab bar under the preview. */
const PHONE: Item[] = [
  { id: "media", label: "Media", icon: "media" },
  { id: "text", label: "Text", icon: "text" },
  { id: "edit", label: "Edit", icon: "edit" },
  { id: "ai", label: "AI", icon: "ai" },
  { id: "output", label: "Output", icon: "settings" },
  { id: "projects", label: "Projects", icon: "projects" },
  { id: "library", label: "Library", icon: "library" },
];

export function Rail({ active, onSelect, wide }: { active: PanelId | null; onSelect: (id: PanelId) => void; wide: boolean }) {
  const { hasFeature } = useAuth();
  const items = wide ? DESKTOP : PHONE;
  return (
    <nav aria-label="Panels" className={wide ? "panel flex w-[4.5rem] shrink-0 flex-col overflow-y-auto py-1.5" : "border-y border-line bg-surface"}>
      <ul className={wide ? "flex flex-col gap-0.5 px-1.5" : "flex gap-1 p-1"}>
        {items.map((t) => {
          const isAllowed = t.id ? hasFeature(t.id) : false;
          const on = t.id !== null && active === t.id && isAllowed;
          const isDisabled = !t.id || !isAllowed;
          const tooltip = !t.id
            ? `${t.label} · coming soon`
            : !isAllowed
            ? `${t.label} · Disabled by administrator`
            : undefined;

          return (
            <li key={t.label} className={wide ? "" : "flex-1"}>
              <button
                type="button"
                aria-pressed={t.id && isAllowed ? on : undefined}
                aria-controls={t.id ? `panel-${t.id}` : undefined}
                disabled={isDisabled}
                title={tooltip}
                onClick={() => t.id && isAllowed && onSelect(t.id)}
                className={`relative flex w-full flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[0.6875rem] leading-tight disabled:cursor-not-allowed disabled:opacity-35 ${
                  on ? "bg-primary-soft font-semibold text-ink" : "text-muted hover:bg-raised hover:text-ink"
                }`}
              >
                {on && wide && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" />}
                <div className="relative">
                  <Icon name={t.icon} className={`size-5 ${on ? "text-link" : ""}`} />
                  {!isAllowed && t.id && (
                    <span className="absolute -top-1 -right-1 flex size-3 items-center justify-center rounded-full bg-neutral-800 text-[8px] text-white">
                      ✕
                    </span>
                  )}
                </div>
                <span className="text-center text-[8px]">{t.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
