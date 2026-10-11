"use client";

import { useEffect, useEffectEvent, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Tip } from "./Tip";

/** A small button that opens a panel under it. Esc or a click elsewhere closes it. */
export function Popover({
  label,
  button,
  children,
  align = "left",
  className = "",
  buttonLabel,
  buttonClassName,
  panelClassName = "w-[17.5rem] p-3",
  open: openProp,
  onOpenChange,
  disabled,
  tip,
  tipAlign = "center",
  size = "md",
}: {
  label: string;
  button: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
  /** the button's name for screen readers (default: its text) */
  buttonLabel?: string;
  /** replaces the button's look (default: a small outlined button) */
  buttonClassName?: string;
  panelClassName?: string;
  /** open it from outside (with onOpenChange); default: it opens and closes itself */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  /** a tooltip on the button (hidden while open) */
  tip?: ReactNode;
  tipAlign?: "left" | "center" | "right";
  size?: "sm" | "md";
}) {
  const [own, setOwn] = useState(false);
  const open = openProp ?? own;
  const setOpen = (o: boolean | ((o: boolean) => boolean)) => {
    const next = typeof o === "function" ? o(open) : o;
    setOwn(next);
    onOpenChange?.(next);
  };
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const wrapTip = (b: ReactElement<{ "aria-describedby"?: string }>) =>
    tip ? (
      <Tip text={tip} side="bottom" align={tipAlign} off={open}>
        {b}
      </Tip>
    ) : (
      b
    );
  const close = useEffectEvent(() => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && close();
    // Esc closes it even when the focus has left it (e.g. a button inside became disabled);
    // first (capture), so that Esc does only this (not also e.g. leave focus mode)
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector("dialog[open]")) return;
      e.preventDefault();
      close();
    };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", esc, true);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", esc, true);
    };
  }, [open]);
  return (
    <div
      ref={ref}
      className={`relative ${className}`}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
          ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
        }
      }}
    >
      {wrapTip(
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          aria-label={buttonLabel}
          title={tip ? undefined : label}
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className={buttonClassName ?? `flex ${size === "sm" ? "h-7 min-h-7" : "min-h-8"} items-center gap-1.5 rounded-md border px-2 text-xs ${open ? "border-primary bg-primary-soft text-ink" : "border-line text-muted hover:border-control hover:text-ink"}`}
        >
          {button}
        </button>,
      )}
      {open && (
        <div id={id} role="dialog" aria-label={label} className={`absolute top-full z-50 mt-1 rounded-lg border border-control bg-surface shadow-2xl ${panelClassName} ${align === "right" ? "right-0" : "left-0"}`}>
          {children}
        </div>
      )}
    </div>
  );
}
