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
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  footer?: ReactNode;
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
      className={`VDO-dialog m-auto max-h-[min(92dvh,56rem)] w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-xl border border-line bg-surface p-0 text-ink shadow-2xl open:flex ${size === "lg" ? "max-w-5xl" : size === "sm" ? "max-w-md" : "max-w-xl"}`}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2 sm:px-5">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <button
          type="button"
          className="flex size-hit items-center justify-center rounded-md text-2xl leading-none hover:bg-canvas"
          onClick={onClose}
          aria-label="Close"
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
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
