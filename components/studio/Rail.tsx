"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ContextMenu, useMenuButton, type MenuItem } from "@/components/ui/ContextMenu";
import { useAuth } from "@/lib/auth/AuthContext";

export type PanelId =
  | "media"
  | "library"
  | "projects"
  | "edit"
  | "output"
  | "text"
  | "templates"
  | "ai"
  | "background"
  | "elements"
  | "audio"
  | "subtitles"
  | "brand"
  | "effects"
  | "transitions";

export type RailItem = { id: PanelId | null; label: string; icon: IconName };
type Item = RailItem;

/**
 * Desktop rail (arranged as in Clideo): a few things you add to the video, then Canvas and More.
 * A selected clip's settings open in the same panel beside the rail.
 */
export const DESKTOP: Item[] = [
  { id: "ai", label: "AI", icon: "ai" },
  { id: "media", label: "Media", icon: "media" },
  { id: "text", label: "Text", icon: "text" },
  { id: "subtitles", label: "Captions", icon: "subtitles" },
  { id: "elements", label: "Elements", icon: "elements" },
  { id: "audio", label: "Audio", icon: "audio" },
  { id: "templates", label: "Templates", icon: "templates" },
  { id: "background", label: "Canvas", icon: "background" },
];

/** Under "More" on the rail. */
export const RAIL_MORE: Item[] = [
  { id: "transitions", label: "Transitions", icon: "transitions" },
  { id: "effects", label: "Effects", icon: "effects" },
  { id: "brand", label: "Brand Kit", icon: "brand" },
  { id: "projects", label: "Projects", icon: "projects" },
  { id: "library", label: "Library", icon: "library" },
];

/** Panels that are not on the rail itself but still open (More, Search tools, the project menu). */
export const MORE_PANELS: Item[] = [
  ...RAIL_MORE,
  { id: "background", label: "Background", icon: "background" },
  { id: "edit", label: "Edit", icon: "edit" },
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

export function Rail({
  active,
  onSelect,
  wide,
  onDropOnTab,
  onAdd,
}: {
  active: PanelId | null;
  onSelect: (id: PanelId) => void;
  wide: boolean;
  onDropOnTab?: (id: PanelId, e: React.DragEvent) => void;
  /** The round + on top: add your own files. */
  onAdd?: () => void;
}) {
  const more = useMenuButton();
  const { hasFeature } = useAuth();
  const items = wide ? DESKTOP : PHONE;
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [dragHoverId, setDragHoverId] = useState<PanelId | null>(null);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  return (
    <nav
      aria-label="Panels"
      className={
        wide
          ? "flex w-[4.5rem] shrink-0 flex-col overflow-y-auto py-1"
          : "border-y border-line bg-surface"
      }
    >
      {wide && onAdd && (
        <button
          type="button"
          data-testid="rail-add"
          aria-label="Add media"
          title="Add your videos, pictures and sound"
          onClick={onAdd}
          className="mx-auto mb-2 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-sm transition-transform hover:scale-105"
        >
          <Icon name="plus" className="size-5" strokeWidth={2.5} />
        </button>
      )}
      <ul className={wide ? "flex flex-col gap-0.5 px-1.5" : "flex gap-1 p-1"}>
        {items.map((t) => {
          const isAllowed = t.id ? hasFeature(t.id) : false;
          const on = t.id !== null && active === t.id && isAllowed;
          const isDisabled = !t.id || !isAllowed;
          const isHoveredDrag = dragHoverId === t.id;
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
                onDragEnter={(e) => {
                  if (!t.id || !isAllowed) return;
                  const types = Array.from(e.dataTransfer?.types || []);
                  if (
                    types.includes("Files") ||
                    types.includes("application/x-vdo-meme") ||
                    types.includes("application/x-vdo-media")
                  ) {
                    e.preventDefault();
                    setDragHoverId(t.id);
                    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                    if (active !== t.id) {
                      hoverTimerRef.current = setTimeout(() => {
                        onSelect(t.id);
                      }, 300);
                    }
                  }
                }}
                onDragOver={(e) => {
                  if (!t.id || !isAllowed) return;
                  const types = Array.from(e.dataTransfer?.types || []);
                  if (
                    types.includes("Files") ||
                    types.includes("application/x-vdo-meme") ||
                    types.includes("application/x-vdo-media")
                  ) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                  }
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                  if (dragHoverId === t.id) setDragHoverId(null);
                  if (hoverTimerRef.current) {
                    clearTimeout(hoverTimerRef.current);
                    hoverTimerRef.current = null;
                  }
                }}
                onDrop={(e) => {
                  if (!t.id || !isAllowed) return;
                  if (hoverTimerRef.current) {
                    clearTimeout(hoverTimerRef.current);
                    hoverTimerRef.current = null;
                  }
                  setDragHoverId(null);
                  if (active !== t.id) {
                    onSelect(t.id);
                  }
                  if (onDropOnTab) {
                    onDropOnTab(t.id, e);
                  }
                }}
                className={`relative flex w-full flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-2xs leading-tight transition-all disabled:cursor-not-allowed disabled:opacity-35 ${
                  isHoveredDrag
                    ? "bg-primary-soft ring-2 ring-primary ring-offset-1 text-ink font-semibold"
                    : on
                    ? "bg-primary-soft font-semibold text-ink"
                    : "text-muted hover:bg-raised hover:text-ink"
                }`}
              >
                {on && wide && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary"
                  />
                )}
                <div className="relative">
                  <Icon
                    name={t.icon}
                    className={`size-5 ${on || isHoveredDrag ? "text-link" : ""}`}
                  />
                  {!isAllowed && t.id && (
                    <span className="absolute -top-1 -right-1 flex size-3 items-center justify-center rounded-full bg-neutral-800 text-[8px] text-white">
                      ✕
                    </span>
                  )}
                </div>
                <span className={`text-center ${wide ? "text-2xs" : "text-[8px]"}`}>{t.label}</span>
              </button>
            </li>
          );
        })}
        {wide && (
          <li>
            <button
              type="button"
              aria-label="More panels"
              {...more.buttonProps}
              className={`relative flex w-full flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-2xs leading-tight transition-all ${
                more.at || RAIL_MORE.some((m) => m.id === active)
                  ? "bg-primary-soft font-semibold text-ink"
                  : "text-muted hover:bg-raised hover:text-ink"
              }`}
            >
              <Icon name="more" className="size-5" strokeWidth={3} />
              <span className="text-center text-2xs">More</span>
            </button>
            {more.at && (
              <ContextMenu
                x={more.at.x}
                y={more.at.y}
                width={200}
                label="More panels"
                onClose={more.close}
                items={RAIL_MORE.filter((m) => m.id && hasFeature(m.id)).map(
                  (m): MenuItem => ({ label: m.label, checked: active === m.id, onSelect: () => m.id && onSelect(m.id) }),
                )}
              />
            )}
          </li>
        )}
      </ul>
    </nav>
  );
}
