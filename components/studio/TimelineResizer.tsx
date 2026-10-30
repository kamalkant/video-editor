"use client";

import { useRef, useState } from "react";
import { readLocal, writeLocal } from "@/lib/editor/localStore";
import { Icon } from "@/components/ui/Icon";

const KEY = "VDO:v1:timelineHeight";
const MIN = 150;
const maxHeight = () => Math.round(window.innerHeight * 0.65);

/** The timeline's height in px, remembered in this browser. */
export function useTimelineHeight(
  fallback: number,
): [number, (h: number) => void] {
  const [h, setH] = useState(() => {
    const saved = readLocal<number>(KEY);
    return typeof saved === "number"
      ? Math.min(maxHeight(), Math.max(MIN, saved))
      : fallback;
  });
  const set = (v: number) => {
    const c = Math.round(Math.min(maxHeight(), Math.max(MIN, v)));
    setH(c);
    writeLocal(KEY, c);
  };
  return [h, set];
}

/** Drag bar above the timeline: drag up for a taller timeline (the preview gets smaller). Arrow keys work too. */
export function TimelineResizer({
  height,
  onChange,
  rightOffset,
  onCollapse,
}: {
  height: number;
  onChange: (h: number) => void;
  rightOffset?: number;
  /** Fold the timeline away (a bar brings it back). */
  onCollapse?: () => void;
}) {
  const start = useRef<{ y: number; h: number } | null>(null);
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Timeline height"
      aria-valuenow={height}
      aria-valuemin={MIN}
      aria-valuemax={typeof window !== "undefined" ? maxHeight() : 600}
      aria-valuetext={`${height} pixels`}
      tabIndex={0}
      title="Drag to make the timeline taller or shorter"
      data-testid="timeline-resizer"
      className="group relative z-10 -my-2 flex h-2 shrink-0 cursor-row-resize items-center justify-center rounded focus-visible:outline-2"
      style={rightOffset ? { paddingRight: rightOffset } : undefined}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        start.current = { y: e.clientY, h: height };
      }}
      onPointerMove={(e) =>
        start.current &&
        onChange(start.current.h + (start.current.y - e.clientY))
      }
      onPointerUp={() => (start.current = null)}
      onPointerCancel={() => (start.current = null)}
      onDoubleClick={() => onChange(height < 300 ? 360 : 220)}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          onChange(height + (e.key === "ArrowUp" ? 24 : -24));
        }
      }}
    >
      {/* (Clipchamp-style: invisible until the pointer is on it; then a line and a grip in the primary colour) */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-3 top-1/2 h-px -translate-y-1/2 bg-transparent transition-colors group-hover:bg-primary/50 group-focus-visible:bg-primary" />
      <span aria-hidden="true" className="relative h-1.5 w-10 rounded-full bg-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
      {onCollapse && (
        <button
          type="button"
          aria-label="Hide the timeline"
          title="Hide the timeline (Ctrl+Alt+3)"
          className="relative ml-2 flex size-5 items-center justify-center rounded-full bg-overlay text-muted opacity-0 shadow-[var(--shadow-float)] transition-opacity hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onCollapse}
        >
          <Icon name="chevronDown" className="size-3" />
        </button>
      )}
    </div>
  );
}
