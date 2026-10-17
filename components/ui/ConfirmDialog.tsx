"use client";

import { ReactNode } from "react";
import { Dialog } from "./Dialog";
import { Icon } from "./Icon";
import { Spinner } from "./Spinner";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  busy?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = "Confirm",
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  variant = "danger",
  busy = false,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={
        <div className="flex items-center gap-2.5">
          {variant === "danger" ? (
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger">
              <Icon name="trash" className="size-4" />
            </div>
          ) : (
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Icon name="info" className="size-4" />
            </div>
          )}
          <span className="font-semibold text-ink text-base">{title}</span>
        </div>
      }
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-2.5">
          <button
            type="button"
            className="btn btn-ghost px-3.5 py-1.5 text-xs font-medium text-muted hover:text-ink disabled:opacity-50"
            onClick={onClose}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn px-4 py-1.5 text-xs font-semibold shadow-sm transition-all ${
              variant === "danger"
                ? "bg-danger text-white hover:bg-danger/90 active:scale-95 disabled:opacity-50"
                : "bg-primary text-white hover:bg-primary/90 active:scale-95 disabled:opacity-50"
            }`}
            onClick={async () => {
              await onConfirm();
            }}
            disabled={busy}
            autoFocus
          >
            {busy ? (
              <div className="flex items-center gap-1.5">
                <Spinner size="xs" />
                <span>Deleting…</span>
              </div>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      }
    >
      <div className="py-2 text-sm leading-relaxed text-muted whitespace-pre-line">
        {message}
      </div>
    </Dialog>
  );
}
