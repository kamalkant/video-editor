"use client";

import { Icon } from "@/components/ui/Icon";
import type { TimelineDoc } from "@/lib/edit/doc";
import { findClip } from "@/lib/edit/doc";

export type MobileAiSheetProps = {
  doc: TimelineDoc;
  selectedId: string | null;
  onRemoveBackground?: (clipId: string) => void;
  onAutoSubtitles?: () => void;
  onGenerateScript?: () => void;
  onOpenAiTools?: () => void;
};

export function MobileAiSheet({
  doc,
  selectedId,
  onRemoveBackground,
  onAutoSubtitles,
  onGenerateScript,
  onOpenAiTools,
}: MobileAiSheetProps) {
  const selectedClip = selectedId ? findClip(doc, selectedId)?.clip : null;
  const isVideo = selectedClip?.type === "video";

  return (
    <div className="flex flex-col gap-2.5 py-1">
      <div className="grid grid-cols-2 gap-2">
        {isVideo && (
          <button
            type="button"
            onClick={() => {
              if (selectedId && onRemoveBackground) {
                onRemoveBackground(selectedId);
              }
            }}
            className="flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 p-2.5 text-left transition-all active:scale-95"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
              <Icon name="person" className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-ink">AI Cutout</div>
              <div className="text-2xs text-muted">Remove background</div>
            </div>
          </button>
        )}

        <button
          type="button"
          onClick={onAutoSubtitles}
          className="flex items-center gap-2 rounded-xl border border-line bg-surface p-2.5 text-left hover:border-primary/50 transition-all active:scale-95"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-raised text-primary">
            <Icon name="subtitles" className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-ink">Auto Subtitles</div>
            <div className="text-2xs text-muted">AI speech to text</div>
          </div>
        </button>

        <button
          type="button"
          onClick={onGenerateScript}
          className="flex items-center gap-2 rounded-xl border border-line bg-surface p-2.5 text-left hover:border-primary/50 transition-all active:scale-95"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-raised text-amber-500">
            <Icon name="sparkles" className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-ink">Smart Script</div>
            <div className="text-2xs text-muted">Generate viral hook</div>
          </div>
        </button>

        <button
          type="button"
          onClick={onOpenAiTools}
          className="flex items-center gap-2 rounded-xl border border-line bg-surface p-2.5 text-left hover:border-primary/50 transition-all active:scale-95"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-raised text-link">
            <Icon name="ai" className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-ink">All AI Tools</div>
            <div className="text-2xs text-muted">Browse full suite</div>
          </div>
        </button>
      </div>
    </div>
  );
}
