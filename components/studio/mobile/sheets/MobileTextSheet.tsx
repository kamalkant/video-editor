"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { FONTS, TEXT_PRESETS, type BuiltinFont } from "@/lib/text/layout";
import type { TextClip, TimelineDoc } from "@/lib/edit/doc";
import { findClip } from "@/lib/edit/doc";

export type MobileTextSheetProps = {
  doc: TimelineDoc;
  selectedId: string | null;
  onAddText: (presetId: string) => void;
  onPatchClip?: (clipId: string, patch: Partial<TextClip>) => void;
};

type TextSubTab = "style" | "font" | "color" | "animation";

const COLOR_PALETTE = [
  "#ffffff",
  "#fbbf24",
  "#ef4444",
  "#3b82f6",
  "#10b981",
  "#8b5cf6",
  "#ec4899",
  "#f97316",
  "#000000",
];

const ANIMATION_PRESETS = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade" },
  { id: "slide", label: "Slide Up" },
  { id: "zoom", label: "Zoom In" },
  { id: "pop", label: "Pop" },
  { id: "typewriter", label: "Typewriter" },
];

export function MobileTextSheet({
  doc,
  selectedId,
  onAddText,
  onPatchClip,
}: MobileTextSheetProps) {
  const [subTab, setSubTab] = useState<TextSubTab>("style");

  const selectedClip = selectedId ? findClip(doc, selectedId)?.clip : null;
  const isTextClip = selectedClip?.type === "text";
  const currentTextClip = isTextClip ? (selectedClip as TextClip) : null;

  return (
    <div className="flex flex-col gap-2">
      {/* Sub-tab pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        <button
          type="button"
          onClick={() => setSubTab("style")}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium shrink-0 transition-colors ${
            subTab === "style"
              ? "bg-primary text-white shadow-xs"
              : "bg-raised/70 text-muted hover:text-ink"
          }`}
        >
          Style
        </button>
        <button
          type="button"
          onClick={() => setSubTab("font")}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium shrink-0 transition-colors ${
            subTab === "font"
              ? "bg-primary text-white shadow-xs"
              : "bg-raised/70 text-muted hover:text-ink"
          }`}
        >
          Font
        </button>
        <button
          type="button"
          onClick={() => setSubTab("color")}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium shrink-0 transition-colors ${
            subTab === "color"
              ? "bg-primary text-white shadow-xs"
              : "bg-raised/70 text-muted hover:text-ink"
          }`}
        >
          Color
        </button>
        <button
          type="button"
          onClick={() => setSubTab("animation")}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium shrink-0 transition-colors ${
            subTab === "animation"
              ? "bg-primary text-white shadow-xs"
              : "bg-raised/70 text-muted hover:text-ink"
          }`}
        >
          Animation
        </button>
      </div>

      {/* Style Sub-tab: Presets */}
      {subTab === "style" && (
        <div className="flex items-center gap-2 overflow-x-auto py-1 no-scrollbar">
          <button
            type="button"
            onClick={() => onAddText("title")}
            className="flex flex-col items-center justify-center gap-1 min-w-[70px] h-16 rounded-xl border border-primary/40 bg-primary/10 text-primary font-semibold hover:bg-primary/20 transition-all active:scale-95 shrink-0"
          >
            <Icon name="plus" className="size-4" />
            <span className="text-[11px] leading-none">+ Add Text</span>
          </button>

          {Object.entries(TEXT_PRESETS).map(([id, preset]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                if (currentTextClip && onPatchClip && selectedId) {
                  onPatchClip(selectedId, {
                    style: { ...currentTextClip.style, ...preset.style },
                  });
                } else {
                  onAddText(id);
                }
              }}
              className="flex flex-col items-center justify-center gap-1 min-w-[70px] h-16 rounded-xl border border-line bg-surface hover:border-primary/50 transition-all active:scale-95 shrink-0 p-1"
            >
              <span className="text-base font-bold text-ink">Aa</span>
              <span className="text-[10px] text-muted font-medium truncate max-w-full">
                {preset.label}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Font Sub-tab */}
      {subTab === "font" && (
        <div className="flex items-center gap-2 overflow-x-auto py-1 no-scrollbar">
          {Object.entries(FONTS).map(([fontId, font]) => {
            const isSelected = currentTextClip?.style.font === fontId;
            return (
              <button
                key={fontId}
                type="button"
                onClick={() => {
                  if (currentTextClip && onPatchClip && selectedId) {
                    onPatchClip(selectedId, {
                      style: { ...currentTextClip.style, font: fontId as BuiltinFont },
                    });
                  }
                }}
                className={`flex flex-col items-center justify-center gap-0.5 min-w-[75px] h-14 rounded-xl border p-1.5 transition-all shrink-0 ${
                  isSelected
                    ? "border-primary bg-primary/15 text-primary font-semibold"
                    : "border-line bg-surface text-ink hover:bg-raised"
                }`}
              >
                <span className="text-sm font-semibold">Aa</span>
                <span className="text-[10px] text-muted truncate max-w-full">{font.label.split(" ")[0]}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Color Sub-tab */}
      {subTab === "color" && (
        <div className="flex items-center gap-2 overflow-x-auto py-1.5 no-scrollbar">
          {COLOR_PALETTE.map((c) => {
            const isSelected = currentTextClip?.style.color === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => {
                  if (currentTextClip && onPatchClip && selectedId) {
                    onPatchClip(selectedId, {
                      style: { ...currentTextClip.style, color: c },
                    });
                  }
                }}
                className={`size-8 rounded-full border-2 transition-transform active:scale-90 shrink-0 ${
                  isSelected ? "border-primary scale-110 shadow-xs" : "border-line"
                }`}
                style={{ backgroundColor: c }}
                title={c}
              />
            );
          })}
        </div>
      )}

      {/* Animation Sub-tab */}
      {subTab === "animation" && (
        <div className="flex items-center gap-2 overflow-x-auto py-1 no-scrollbar">
          {ANIMATION_PRESETS.map((anim) => (
            <button
              key={anim.id}
              type="button"
              onClick={() => {
                // If animation property is supported on text clips
                if (currentTextClip && onPatchClip && selectedId) {
                  onPatchClip(selectedId, {
                    // attach animation preset tag or effect
                  });
                }
              }}
              className="flex items-center justify-center min-w-[70px] h-11 rounded-xl border border-line bg-surface px-2 text-xs font-medium text-ink hover:border-primary/50 transition-all shrink-0"
            >
              {anim.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
