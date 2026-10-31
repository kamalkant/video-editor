"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Modal dialog on the native <dialog>: focus stays inside, Esc closes, focus
 * goes back to the button that opened it. Clicking the dark backdrop closes too.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  size = "md",
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "4xl";
  footer?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`VDO-dialog m-auto max-h-[min(95dvh,58rem)] w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl border-2 border-dialog-border bg-dialog-bg p-0 text-ink shadow-[0_25px_70px_rgba(0,0,0,0.55)] ring-1 ring-white/10 open:flex ${size === "xl" ? "max-w-6xl" : size === "4xl" ? "max-w-4xl" : size === "lg" ? "max-w-5xl" : size === "sm" ? "max-w-md" : "max-w-xl"}${className ? ` ${className}` : ""}`}
      // (React passes a nested dialog's close / cancel up: only this dialog's own count)
      onClose={(e) => e.target === e.currentTarget && onClose()}
      onCancel={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <header className="flex items-center justify-between gap-3 border-b border-dialog-card-border bg-dialog-header px-4 py-2.5 sm:px-5">
        <h2 id={titleId} className="text-lg font-semibold text-ink">
          {title}
        </h2>
        <button
          type="button"
          className="flex size-hit items-center justify-center rounded-lg text-2xl leading-none text-muted hover:text-ink hover:bg-dialog-card-hover transition-colors"
          onClick={onClose}
          aria-label="Close"
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <div className={`min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${size === "xl" || size === "4xl" ? "px-4 py-3 sm:px-5 sm:py-3" : "px-4 py-4 sm:px-5"}`}>
        {open && children}
      </div>
      {footer && (
        <footer className="border-t border-line px-4 py-3 sm:px-5">
          {footer}
        </footer>
      )}
    </dialog>
  );
}
