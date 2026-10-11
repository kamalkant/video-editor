"use client";

import { useState } from "react";

/** A panel width that the user can drag, remembered in this browser. */
export function usePanelWidth(key: string, fallback: () => number, min: number, max: number): [number, (w: number) => void] {
  const [w, setW] = useState(() => {
    try {
      const v = Number(localStorage.getItem(key));
      if (v >= min && v <= max) return v;
    } catch {
      /* private window */
    }
    return Math.round(Math.min(max, Math.max(min, fallback())));
  });
  const set = (next: number) => {
    const v = Math.round(Math.min(max, Math.max(min, next)));
    setW(v);
    try {
      localStorage.setItem(key, String(v));
    } catch {
      /* private window */
    }
  };
  return [w, set];
}

/**
 * A draggable line between two panels. `side`: which panel it sizes — the one
 * on its left (dragging right makes it wider) or the one on its right.
 * Arrow keys move it too; double-click puts it back.
 */
export function PanelSplitter({ label, value, onChange, side, min, max, reset }: { label: string; value: number; onChange: (w: number) => void; side: "left" | "right"; min: number; max: number; reset: number }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      title={`${label} — drag to resize, double-click to reset`}
      data-testid={`splitter-${side}`}
      className="group relative z-10 -mx-2 w-2 shrink-0 cursor-col-resize select-none focus-visible:outline-none"
      onPointerDown={(e) => {
        e.preventDefault();
        const x0 = e.clientX;
        const w0 = value;
        setDragging(true);
        const move = (ev: PointerEvent) => onChange(w0 + (side === "left" ? ev.clientX - x0 : x0 - ev.clientX));
        const up = () => {
          setDragging(false);
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
      onDoubleClick={() => onChange(reset)}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        e.stopPropagation();
        const d = (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 64 : 16);
        onChange(value + (side === "left" ? d : -d));
      }}
    >
      <span aria-hidden="true" className={`absolute inset-y-8 left-1/2 w-0.5 -translate-x-1/2 rounded-full transition-colors ${dragging ? "bg-primary" : "bg-transparent group-hover:bg-primary/60 group-focus-visible:bg-primary"}`} />
    </div>
  );
}
