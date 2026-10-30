"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/lib/auth/AuthContext";

export type MissingItem = {
  id: string;
  name?: string;
  kind?: string;
};

export function MissingMediaModal({
  missingItems,
  onRelink,
  onClose,
}: {
  missingItems: MissingItem[];
  onRelink: (oldId: string, newFile: File) => Promise<void>;
  onClose: () => void;
}) {
  const { workspace } = useAuth();
  const [relinkingId, setRelinkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChosen = async (oldId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !workspace) return;

    setRelinkingId(oldId);
    setError(null);
    try {
      await onRelink(oldId, file);
    } catch (err) {
      setError((err as Error).message || "Failed to relink file.");
    } finally {
      setRelinkingId(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="missing-media-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-line bg-surface shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5 text-amber-500">
            <Icon name="alert" className="size-5" />
            <h2 id="missing-media-title" className="text-sm font-bold text-ink">
              Missing Media Files
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-ink transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          <p className="text-muted leading-relaxed">
            The project references {missingItems.length} media file(s) that are not currently in your local workspace.
            You can locate them on your disk to relink them, or skip to continue editing.
          </p>

          {error && (
            <div className="rounded-lg bg-danger/10 p-3 text-danger border border-danger/20 font-medium">
              {error}
            </div>
          )}

          <div className="space-y-2">
            {missingItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-raised/30 p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-ink">
                    {item.name || `Asset ${item.id.slice(0, 8)}…`}
                  </div>
                  <div className="text-2xs text-muted font-mono truncate">ID: {item.id}</div>
                </div>

                <label className="relative shrink-0 cursor-pointer">
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink shadow-xs hover:bg-raised transition-colors">
                    {relinkingId === item.id ? "Relinking…" : "Locate File…"}
                  </span>
                  <input
                    type="file"
                    className="sr-only"
                    disabled={relinkingId === item.id}
                    onChange={(e) => void handleFileChosen(item.id, e)}
                  />
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-line bg-surface/50 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-muted hover:bg-raised hover:text-ink transition-colors"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
