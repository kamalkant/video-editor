"use client";

import { useRef } from "react";

/**
 * Draggable split line between Original (left) and Removed (right).
 * Mouse/touch drag with pointer capture; ←/→ move 5%, Home/End jump to the ends.
 */
export function SplitHandle({ value, onChange, container }: { value: number; onChange: (v: number) => void; container: React.RefObject<HTMLElement | null> }) {
  const dragging = useRef(false);
  const set = (clientX: number) => {
    const r = container.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    onChange(Math.round(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100))));
  };
  return (
    <div
      className="absolute top-0 bottom-0 z-20 -ml-4 w-8 cursor-ew-resize touch-none"
      style={{ left: `${value}%` }}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => dragging.current && set(e.clientX)}
      onPointerUp={(e) => {
        dragging.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <span aria-hidden="true" className="absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.45)]" />
      <span aria-hidden="true" className="absolute left-1/2 top-2 -translate-x-full -ml-2 rounded bg-black/75 px-1.5 py-0.5 text-xs font-semibold text-white">
        Original
      </span>
      <span aria-hidden="true" className="absolute left-1/2 top-2 ml-2 rounded bg-black/75 px-1.5 py-0.5 text-xs font-semibold text-white">
        Removed
      </span>
      <button
        type="button"
        role="slider"
        aria-label="Split between original and removed"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={`${value} percent original`}
        className="absolute left-1/2 top-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-primary bg-white text-link shadow-lg"
        onKeyDown={(e) => {
          const step = e.shiftKey ? 20 : 5;
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange(Math.max(0, value - step));
          else if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange(Math.min(100, value + step));
          else if (e.key === "Home") onChange(0);
          else if (e.key === "End") onChange(100);
          else return;
          e.preventDefault();
        }}
      >
        <span aria-hidden="true">⟷</span>
      </button>
    </div>
  );
}
