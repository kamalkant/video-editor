"use client";

import { useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { TimelineDoc } from "@/lib/edit/doc";
import type { Clock } from "@/lib/editor/clock";
import { getEditingTools } from "@/lib/editor/editingTools";

export type MobileEditSheetProps = {
  doc: TimelineDoc;
  selectedId: string | null;
  clock: Clock;
  media?: Record<string, { hasAudio?: boolean; fileName?: string }>;
  onSplit?: (clipId: string, t: number) => void;
  onTrim?: (clipId: string, edge: "in" | "out", t: number) => void;
  onDelete?: (clipId: string) => void;
  onDuplicate?: (clipId: string) => void;
  onCrop?: (clipId: string) => void;
  onSpeed?: (clipId: string) => void;
  onReverse?: (clipId: string) => void;
  onFreeze?: (clipId: string, t: number) => void;
  onDetachAudio?: (clipId: string) => void;
  onVolumeChange?: (clipId: string, volume: number) => void;
};

export function MobileEditSheet({
  doc,
  selectedId,
  clock,
  media = {},
  onSplit,
  onTrim,
  onDelete,
  onDuplicate,
  onCrop,
  onSpeed,
  onReverse,
  onFreeze,
  onDetachAudio,
  onVolumeChange,
}: MobileEditSheetProps) {
  const [activeSubMode, setActiveSubMode] = useState<"actions" | "volume" | "speed">("actions");
  const clockT = clock.get();
  const tools = getEditingTools(doc, selectedId, clockT, media, doc.canvas?.fps ?? 30);
  const targetClipId = tools.target?.clip.id || selectedId;

  // Selected clip info
  const selectedClip = tools.selected?.clip;
  const currentSpeed = (selectedClip && "speed" in selectedClip ? selectedClip.speed : 1) ?? 1;
  const currentVolume = (selectedClip && "volume" in selectedClip ? selectedClip.volume : 1) ?? 1;

  if (activeSubMode === "volume") {
    return (
      <div className="flex flex-col gap-3 py-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-ink">Volume: {Math.round(currentVolume * 100)}%</span>
          <button
            type="button"
            onClick={() => setActiveSubMode("actions")}
            className="text-xs text-primary font-medium"
          >
            Done
          </button>
        </div>
        <div className="flex items-center gap-3">
          <Icon name="mute" className="size-4 text-muted" />
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={currentVolume}
            onChange={(e) => {
              if (targetClipId && onVolumeChange) {
                onVolumeChange(targetClipId, parseFloat(e.target.value));
              }
            }}
            className="w-full accent-primary h-2 cursor-pointer"
          />
          <Icon name="volume" className="size-4 text-muted" />
        </div>
      </div>
    );
  }

  if (activeSubMode === "speed") {
    return (
      <div className="flex flex-col gap-3 py-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-ink">Speed: {currentSpeed}x</span>
          <button
            type="button"
            onClick={() => setActiveSubMode("actions")}
            className="text-xs text-primary font-medium"
          >
            Done
          </button>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto py-1 no-scrollbar">
          {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4].map((spd) => (
            <button
              key={spd}
              type="button"
              onClick={() => {
                if (targetClipId && onSpeed) {
                  onSpeed(targetClipId);
                }
              }}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium shrink-0 transition-colors ${
                currentSpeed === spd
                  ? "bg-primary text-white"
                  : "bg-raised text-muted hover:text-ink"
              }`}
            >
              {spd}x
            </button>
          ))}
        </div>
      </div>
    );
  }

  const actionButtons = [
    {
      id: "split",
      label: "Split",
      icon: "split" as IconName,
      disabled: !tools.canSplit,
      onClick: () => {
        if (targetClipId && onSplit) onSplit(targetClipId, clockT);
      },
    },
    {
      id: "trim-in",
      label: "Trim In",
      icon: "trim" as IconName,
      disabled: !tools.canTrimStart,
      onClick: () => {
        if (targetClipId && onTrim) onTrim(targetClipId, "in", clockT);
      },
    },
    {
      id: "trim-out",
      label: "Trim Out",
      icon: "trim" as IconName,
      disabled: !tools.canTrimEnd,
      onClick: () => {
        if (targetClipId && onTrim) onTrim(targetClipId, "out", clockT);
      },
    },
    {
      id: "speed",
      label: "Speed",
      icon: "clock" as IconName,
      disabled: !tools.canSpeed,
      onClick: () => setActiveSubMode("speed"),
    },
    {
      id: "volume",
      label: "Volume",
      icon: "volume" as IconName,
      disabled: !tools.selected,
      onClick: () => setActiveSubMode("volume"),
    },
    {
      id: "duplicate",
      label: "Duplicate",
      icon: "copy" as IconName,
      disabled: !tools.canDuplicate,
      onClick: () => {
        if (targetClipId && onDuplicate) onDuplicate(targetClipId);
      },
    },
    {
      id: "crop",
      label: "Crop",
      icon: "crop" as IconName,
      disabled: !tools.canCrop,
      onClick: () => {
        if (targetClipId && onCrop) onCrop(targetClipId);
      },
    },
    {
      id: "reverse",
      label: "Reverse",
      icon: "reverse" as IconName,
      disabled: !tools.canReverse,
      onClick: () => {
        if (targetClipId && onReverse) onReverse(targetClipId);
      },
    },
    {
      id: "freeze",
      label: "Freeze",
      icon: "freeze" as IconName,
      disabled: !tools.canFreeze,
      onClick: () => {
        if (targetClipId && onFreeze) onFreeze(targetClipId, clockT);
      },
    },
    {
      id: "detach",
      label: "Detach Sound",
      icon: "detach" as IconName,
      disabled: !tools.canDetachAudio,
      onClick: () => {
        if (targetClipId && onDetachAudio) onDetachAudio(targetClipId);
      },
    },
    {
      id: "delete",
      label: "Delete",
      icon: "trash" as IconName,
      disabled: !tools.canDelete,
      danger: true,
      onClick: () => {
        if (tools.selected && onDelete) onDelete(tools.selected.clip.id);
      },
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      {tools.targetInfo && (
        <div className="text-2xs text-muted truncate px-1">
          Editing: <span className="font-semibold text-ink">{tools.targetInfo.name}</span>
        </div>
      )}

      {/* Horizontal Touch Scroll Action Grid / Row */}
      <div className="flex items-center gap-2 overflow-x-auto py-1 no-scrollbar">
        {actionButtons.map((btn) => (
          <button
            key={btn.id}
            type="button"
            disabled={btn.disabled}
            onClick={btn.onClick}
            aria-label={btn.label}
            className={`flex flex-col items-center justify-center gap-1 min-w-[56px] h-14 rounded-xl border p-1.5 transition-all active:scale-95 shrink-0 ${
              btn.danger
                ? "border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/20 disabled:opacity-30 disabled:border-line disabled:bg-raised/40 disabled:text-muted"
                : "border-line bg-raised/50 text-ink hover:bg-raised hover:border-primary/40 disabled:opacity-30 disabled:text-muted"
            }`}
          >
            <Icon name={btn.icon} className="size-4 shrink-0" />
            <span className="text-2xs font-medium leading-none truncate max-w-full">
              {btn.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
