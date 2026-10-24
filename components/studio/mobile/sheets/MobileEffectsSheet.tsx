"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { TimelineDoc } from "@/lib/edit/doc";
import { findClip } from "@/lib/edit/doc";
import { TRANSITIONS, TRANSITION_TYPES, type TransitionType } from "@/lib/player/transitions";

export type MobileEffectsSheetProps = {
  doc: TimelineDoc;
  selectedId: string | null;
  onApplyTransition?: (type: TransitionType) => void;
  onRemoveTransition?: () => void;
  onApplyEffect?: (effectName: string) => void;
  onOpenElements?: () => void;
  onOpenAiTools?: () => void;
};

type EffectsSubTab = "video" | "transitions" | "overlay" | "ai";

// the entrance / exit animations a picture, text or element can have (lib/player/anim: the export makes them too)
const VIDEO_EFFECTS = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade" },
  { id: "slide", label: "Slide" },
  { id: "rise", label: "Rise" },
  { id: "pop", label: "Pop" },
  { id: "zoom", label: "Zoom" },
  { id: "bounce", label: "Bounce" },
  { id: "blur", label: "Blur" },
];

export function MobileEffectsSheet({
  doc,
  selectedId,
  onApplyTransition,
  onRemoveTransition,
  onApplyEffect,
  onOpenElements,
  onOpenAiTools,
}: MobileEffectsSheetProps) {
  const [subTab, setSubTab] = useState<EffectsSubTab>("video");
  const [activeEffect, setActiveEffect] = useState<string>("none");

  return (
    <div className="flex flex-col gap-2">
      {/* Sub-tab pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        <button
          type="button"
          onClick={() => setSubTab("video")}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium shrink-0 transition-colors ${
            subTab === "video"
              ? "bg-primary text-white shadow-xs"
              : "bg-raised/70 text-muted hover:text-ink"
          }`}
        >
          Video Effects
        </button>
        <button
          type="button"
          onClick={() => setSubTab("transitions")}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium shrink-0 transition-colors ${
            subTab === "transitions"
              ? "bg-primary text-white shadow-xs"
              : "bg-raised/70 text-muted hover:text-ink"
          }`}
        >
          Transitions
        </button>
        <button
          type="button"
          onClick={() => setSubTab("overlay")}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium shrink-0 transition-colors ${
            subTab === "overlay"
              ? "bg-primary text-white shadow-xs"
              : "bg-raised/70 text-muted hover:text-ink"
          }`}
        >
          Overlay
        </button>
        <button
          type="button"
          onClick={() => setSubTab("ai")}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium shrink-0 transition-colors ${
            subTab === "ai"
              ? "bg-primary text-white shadow-xs"
              : "bg-raised/70 text-muted hover:text-ink"
          }`}
        >
          AI Effects
        </button>
      </div>

      {/* Video Effects Tab */}
      {subTab === "video" && (
        <div className="flex items-center gap-2 overflow-x-auto py-1 no-scrollbar">
          {VIDEO_EFFECTS.map((eff) => {
            const isSelected = activeEffect === eff.id;
            return (
              <button
                key={eff.id}
                type="button"
                onClick={() => {
                  setActiveEffect(eff.id);
                  if (onApplyEffect) onApplyEffect(eff.id);
                }}
                className={`flex flex-col items-center justify-center gap-1 min-w-[65px] h-16 rounded-xl border p-1.5 transition-all shrink-0 active:scale-95 ${
                  isSelected
                    ? "border-primary bg-primary/15 text-primary font-semibold shadow-xs"
                    : "border-line bg-surface text-ink hover:bg-raised"
                }`}
              >
                <span className="flex size-7 items-center justify-center rounded-full bg-raised/80">
                  {eff.id === "none" ? "⊘" : "✨"}
                </span>
                <span className="text-[10px] text-muted truncate max-w-full">{eff.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Transitions Tab */}
      {subTab === "transitions" && (
        <div className="flex items-center gap-2 overflow-x-auto py-1 no-scrollbar">
          <button
            type="button"
            onClick={onRemoveTransition}
            className="flex flex-col items-center justify-center gap-1 min-w-[65px] h-16 rounded-xl border border-line bg-surface p-1.5 transition-all shrink-0 active:scale-95"
          >
            <span className="text-sm font-semibold text-muted">None</span>
            <span className="text-[10px] text-muted">Cut</span>
          </button>
          {TRANSITION_TYPES.slice(0, 10).map((type) => {
            const tr = TRANSITIONS[type];
            return (
              <button
                key={type}
                type="button"
                onClick={() => onApplyTransition?.(type)}
                className="flex flex-col items-center justify-center gap-1 min-w-[65px] h-16 rounded-xl border border-line bg-surface p-1.5 transition-all shrink-0 hover:border-primary/50 active:scale-95"
              >
                <span className="text-xs font-semibold text-ink">↔</span>
                <span className="text-[10px] text-muted truncate max-w-full">{tr.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Overlay Tab */}
      {subTab === "overlay" && (
        <div className="flex items-center gap-2 py-1">
          <button
            type="button"
            onClick={onOpenElements}
            className="flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-xs font-semibold text-primary hover:bg-primary/20 transition-all"
          >
            <Icon name="elements" className="size-4" />
            <span>Open Elements & Stickers</span>
          </button>
        </div>
      )}

      {/* AI Effects Tab */}
      {subTab === "ai" && (
        <div className="flex items-center gap-2 py-1">
          <button
            type="button"
            onClick={onOpenAiTools}
            className="flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-xs font-semibold text-primary hover:bg-primary/20 transition-all"
          >
            <Icon name="ai" className="size-4" />
            <span>Open AI Cutout & Effects</span>
          </button>
        </div>
      )}
    </div>
  );
}
