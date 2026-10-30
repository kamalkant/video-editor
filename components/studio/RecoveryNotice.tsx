"use client";

import { Icon } from "@/components/ui/Icon";
import { formatAgo } from "@/lib/format";
import type { RecoverySnapshot } from "@/lib/storage/types";
import type { TimelineDoc } from "@/lib/edit/doc";

export function RecoveryNotice({
  recovery,
  onRecover,
  onDismiss,
}: {
  recovery: RecoverySnapshot;
  onRecover: (doc: TimelineDoc) => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      className="fixed bottom-6 right-6 z-50 flex max-w-md items-start gap-3 rounded-xl border border-primary/40 bg-surface/95 p-4 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-4"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon name="history" className="size-5" />
      </div>

      <div className="flex-1 space-y-1">
        <div className="text-xs font-bold text-ink">Newer Recovery Version Found</div>
        <p className="text-2xs text-muted leading-relaxed">
          We found an uncommitted recovery snapshot from{" "}
          <span className="font-semibold text-ink">{formatAgo(recovery.savedAt)}</span> for{" "}
          <span className="font-semibold text-ink">“{recovery.projectName}”</span>. Would you like to restore it?
        </p>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onRecover(recovery.doc)}
            className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-primary-hover active:scale-95 transition-all"
          >
            Recover Version
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-muted hover:bg-raised hover:text-ink transition-colors"
          >
            Keep Saved
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss recovery notice"
        className="rounded text-muted hover:text-ink p-0.5"
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}
