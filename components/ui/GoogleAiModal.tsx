"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";

export interface GoogleAiModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  size?: "md" | "lg" | "xl";
  busy?: boolean;
  busyLabel?: string;
  footer?: ReactNode;
  testId?: string;
}

/**
 * Google AI Studio & Google Flow Modal:
 * Obsidian dark glassmorphism, ambient Google 4-color aurora glow,
 * animated gradient thinking border when busy, and clean responsive frame.
 */
export function GoogleAiModal({
  open,
  onClose,
  title,
  subtitle,
  badge,
  children,
  size = "lg",
  busy = false,
  busyLabel,
  footer,
  testId,
}: GoogleAiModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  const maxW =
    size === "xl" ? "max-w-5xl" : size === "lg" ? "max-w-3xl" : "max-w-xl";

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      data-testid={testId}
      className={`VDO-dialog m-auto max-h-[min(94dvh,58rem)] w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#090d16] p-0 text-slate-100 shadow-[0_30px_70px_-15px_rgba(0,0,0,0.8)] backdrop-blur-2xl open:flex ${maxW}`}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Google 4-color ambient aurora top light bar */}
      <div className="relative h-1 w-full overflow-hidden bg-gradient-to-r from-blue-500 via-indigo-500 via-purple-500 via-pink-500 to-amber-400">
        {busy && (
          <div className="absolute inset-0 h-full w-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/80 to-transparent" />
        )}
      </div>

      {/* Header */}
      <header className="relative flex items-start justify-between gap-3 border-b border-white/10 px-5 py-3.5 bg-white/[0.02]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-500 via-indigo-500 to-fuchsia-500 text-white shadow-md shadow-indigo-500/20">
            {/* Google Gemini 4-pointed Sparkle */}
            <svg viewBox="0 0 24 24" className="size-4 fill-current">
              <path d="M12 0C12 6.627 6.627 12 0 12c6.627 0 12 5.627 12 12 0-6.627 5.627-12 12-12-6.627 0-12-5.627-12-12z" />
            </svg>
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id={titleId}
                className="text-base font-semibold tracking-tight text-white flex items-center gap-2"
              >
                {title}
              </h2>
              {badge}
            </div>
            {subtitle && (
              <p className="text-xs text-slate-400 mt-0.5 leading-snug">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
          aria-label="Close"
        >
          <Icon name="close" className="size-4" />
        </button>
      </header>

      {/* Status bar if busy */}
      {busy && busyLabel && (
        <div className="flex items-center gap-2 bg-gradient-to-r from-blue-950/40 via-purple-950/40 to-slate-900/40 border-b border-indigo-500/20 px-5 py-2 text-xs text-indigo-300">
          <span className="size-3.5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
          <span>{busyLabel}</span>
        </div>
      )}

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm leading-relaxed text-slate-200">
        {open && children}
      </div>

      {/* Footer */}
      {footer && (
        <footer className="border-t border-white/10 bg-white/[0.02] px-5 py-3 flex flex-wrap items-center justify-between gap-3">
          {footer}
        </footer>
      )}
    </dialog>
  );
}
