"use client";

import { useRef, useState } from "react";
import { readLocal, writeLocal } from "@/lib/editor/localStore";

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
}: {
  height: number;
  onChange: (h: number) => void;
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
      <span
        aria-hidden="true"
        className="h-1 w-14 rounded-full bg-line transition-colors group-hover:bg-control group-focus-visible:bg-link"
      />
    </div>
  );
}
