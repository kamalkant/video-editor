"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { AudioClip, TimelineDoc } from "@/lib/edit/doc";
import { findClip } from "@/lib/edit/doc";

export type MobileAudioSheetProps = {
  doc: TimelineDoc;
  selectedId: string | null;
  onOpenLibraryAudio: () => void;
  onRecordVoiceover?: () => void;
  onPatchClip?: (clipId: string, patch: Partial<AudioClip>) => void;
  onDetachAudio?: (clipId: string) => void;
};

export function MobileAudioSheet({
  doc,
  selectedId,
  onOpenLibraryAudio,
  onRecordVoiceover,
  onPatchClip,
  onDetachAudio,
}: MobileAudioSheetProps) {
  const selectedClip = selectedId ? findClip(doc, selectedId)?.clip : null;
  const isAudio = selectedClip?.type === "audio";
  const currentAudio = isAudio ? (selectedClip as AudioClip) : null;
  const currentVol = currentAudio?.volume ?? 1;

  return (
    <div className="flex flex-col gap-3 py-1">
      {/* Quick Audio Actions Row */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={onOpenLibraryAudio}
          className="flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition-all shrink-0 active:scale-95"
        >
          <Icon name="audio" className="size-4" />
          <span>+ Add Music</span>
        </button>

        {onRecordVoiceover && (
          <button
            type="button"
            onClick={onRecordVoiceover}
            className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-medium text-ink hover:border-primary/50 transition-all shrink-0 active:scale-95"
          >
            <Icon name="mic" className="size-4 text-red-500" />
            <span>Voiceover</span>
          </button>
        )}

        {selectedClip?.type === "video" && onDetachAudio && (
          <button
            type="button"
            onClick={() => onDetachAudio(selectedClip.id)}
            className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-medium text-ink hover:border-primary/50 transition-all shrink-0 active:scale-95"
          >
            <Icon name="detachAudio" className="size-4 text-muted" />
            <span>Extract Audio</span>
          </button>
        )}
      </div>

      {/* Volume Slider if audio clip is selected */}
      {isAudio && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-line/60 bg-raised/30 p-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-ink">Volume</span>
            <span className="font-semibold text-primary tabular-nums">
              {Math.round(currentVol * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Icon name="mute" className="size-3.5 text-muted" />
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={currentVol}
              onChange={(e) => {
                if (selectedId && onPatchClip) {
                  onPatchClip(selectedId, { volume: parseFloat(e.target.value) });
                }
              }}
              className="w-full accent-primary h-1.5 cursor-pointer"
            />
            <Icon name="volume" className="size-3.5 text-muted" />
          </div>
        </div>
      )}
    </div>
  );
}
