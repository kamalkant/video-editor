"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";

export type MenuItem =
  | {
      label: string;
      onSelect: () => void;
      disabled?: boolean;
      shortcut?: string;
      /** a second, smaller line */
      detail?: string;
      /** a small picture before the label (a thumbnail URL) */
      image?: string | null;
      /** ticked (the current choice) */
      checked?: boolean;
    }
  | { heading: string }
  | "separator";

/** A right-click menu at a screen position: arrow keys move, Enter picks, Esc or a click elsewhere closes. */
export function ContextMenu({ x, y, items, onClose, label, width = 216 }: { x: number; y: number; items: MenuItem[]; onClose: () => void; label: string; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  // (once, when it opens: a parent drawing again mustn't move the focus back to the top)
  const close = useEffectEvent(onClose);
  useEffect(() => {
    const el = ref.current;
    el?.querySelector<HTMLButtonElement>("button:not([aria-disabled=true])")?.focus();
    const outside = (e: PointerEvent) => !el?.contains(e.target as Node) && close();
    const scroll = () => close();
    window.addEventListener("pointerdown", outside);
    window.addEventListener("resize", scroll);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", scroll);
    };
  }, []);
  // keep the menu on screen
  const left = Math.max(8, Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 1e4) - width - 8));
  const tall = items.reduce((a, it) => a + (it === "separator" ? 8 : "heading" in it ? 22 : it.detail ? 42 : 30), 8);
  const top = Math.max(8, Math.min(y, (typeof window !== "undefined" ? window.innerHeight : 1e4) - tall));
  const onKey = (e: React.KeyboardEvent) => {
    const list = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button:not([aria-disabled=true])") ?? []);
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      list[(i + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length]?.focus();
    }
  };
  return (
    <div ref={ref} role="menu" aria-label={label} className="fixed z-50 max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-lg border border-control bg-surface p-1 text-[13px] shadow-2xl" style={{ left, top, width }} onKeyDown={onKey}>
      {items.map((it, i) =>
        it === "separator" ? (
          <div key={i} role="separator" className="my-1 h-px bg-line/60" />
        ) : "heading" in it ? (
          <div key={i} role="presentation" className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
            {it.heading}
          </div>
        ) : (
          <button
            key={`${i}:${it.label}`}
            type="button"
            role={it.checked === undefined ? "menuitem" : "menuitemradio"}
            aria-checked={it.checked}
            aria-disabled={it.disabled || undefined}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] leading-tight hover:bg-raised focus:bg-raised aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
            onClick={() => {
              if (it.disabled) return;
              onClose();
              it.onSelect();
            }}
          >
            {it.checked !== undefined && <span aria-hidden="true" className="w-3.5 shrink-0 text-xs text-link">{it.checked ? "✓" : ""}</span>}
            {it.image !== undefined &&
              (it.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.image} alt="" className="h-6 w-8 shrink-0 rounded bg-canvas object-cover" />
              ) : (
                <span aria-hidden="true" className="h-6 w-8 shrink-0 rounded bg-canvas" />
              ))}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate leading-tight text-ink">{it.label}</span>
              {it.detail && <span className="truncate text-[11px] leading-none text-muted">{it.detail}</span>}
            </span>
            {it.shortcut && (
              <kbd className="ml-auto shrink-0 border-0 bg-transparent p-0 min-w-0 font-sans text-xs tracking-tight leading-none text-muted shadow-none">
                {it.shortcut}
              </kbd>
            )}
          </button>
        ),
      )}
    </div>
  );
}

/**
 * A button that opens a ContextMenu under it (spread `buttonProps` on the
 * button, render the menu at `at`). A click toggles it; a press on the button
 * while it's open just closes it (the menu closes on the press, and that click
 * mustn't open it again). Closing gives the focus back to the button.
 */
export function useMenuButton(onOpen?: () => void) {
  const ref = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const pressedOpen = useRef(false);
  const close = useCallback(() => {
    setAt(null);
    requestAnimationFrame(() => document.activeElement === document.body && ref.current?.focus());
  }, []);
  const buttonProps = {
    ref,
    "aria-haspopup": "menu" as const,
    "aria-expanded": !!at,
    onPointerDown: () => {
      pressedOpen.current = !!at;
    },
    onClick: () => {
      if (pressedOpen.current) {
        pressedOpen.current = false;
        return;
      }
      if (at) return close();
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      onOpen?.();
      setAt({ x: r.left, y: r.bottom + 4 });
    },
  };
  return { at, close, buttonProps };
}
