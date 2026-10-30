"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { TEXT_PRESETS } from "@/lib/text/layout";
import type { Anim, TextClip, TimelineDoc } from "@/lib/edit/doc";
import { findClip } from "@/lib/edit/doc";
import { useBrandKit } from "@/lib/editor/useBrand";
import { FontPicker } from "../../FontPicker";
import { RichTextField } from "../../RichTextField";

export type MobileTextSheetProps = {
  doc: TimelineDoc;
  selectedId: string | null;
  onAddText: (presetId: string) => void;
  onPatchClip?: (clipId: string, patch: Partial<TextClip>) => void;
};

type TextSubTab = "words" | "style" | "font" | "color" | "animation";

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

// how the text comes in (it goes out with a fade; lib/player/anim, the export makes them too)
const ANIMATION_PRESETS: { id: Anim["in"]; label: string }[] = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade" },
  { id: "rise", label: "Slide Up" },
  { id: "slide", label: "Slide In" },
  { id: "zoom", label: "Zoom In" },
  { id: "pop", label: "Pop" },
  { id: "bounce", label: "Bounce" },
  { id: "typewriter", label: "Typewriter" },
];

export function MobileTextSheet({
  doc,
  selectedId,
  onAddText,
  onPatchClip,
}: MobileTextSheetProps) {
  const [subTab, setSubTab] = useState<TextSubTab>("style");
  const brandFonts = useBrandKit()?.fonts ?? [];

  const selectedClip = selectedId ? findClip(doc, selectedId)?.clip : null;
  const isTextClip = selectedClip?.type === "text";
  const currentTextClip = isTextClip ? (selectedClip as TextClip) : null;

  return (
    <div className="flex flex-col gap-2">
      {/* Sub-tab pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {currentTextClip && (
          <button
            type="button"
            onClick={() => setSubTab("words")}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium shrink-0 transition-colors ${
              subTab === "words"
                ? "bg-primary text-white shadow-xs"
                : "bg-raised/70 text-muted hover:text-ink"
            }`}
          >
            Words
          </button>
        )}
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

      {/* Words: type, select letters and style them (size, color, font…) */}
      {subTab === "words" && currentTextClip && onPatchClip && (
        <RichTextField
          id="text-content-mobile"
          clip={currentTextClip}
          onPatch={(p) => onPatchClip(currentTextClip.id, p as Partial<TextClip>)}
          brandFonts={brandFonts}
          rows={2}
        />
      )}

      {/* Style Sub-tab: Presets */}
      {subTab === "style" && (
        <div className="flex items-center gap-2 overflow-x-auto py-1 no-scrollbar">
          <button
            type="button"
            onClick={() => onAddText("title")}
            className="flex flex-col items-center justify-center gap-1 min-w-[70px] h-16 rounded-xl border border-primary/40 bg-primary/10 text-primary font-semibold hover:bg-primary/20 transition-all active:scale-95 shrink-0"
          >
            <Icon name="plus" className="size-4" />
            <span className="text-2xs leading-none">+ Add Text</span>
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
              <span className="text-2xs text-muted font-medium truncate max-w-full">
                {preset.label}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Font Sub-tab: the whole Google Fonts library (Hindi too) and your Brand Kit fonts */}
      {subTab === "font" && (
        <div className="py-1">
          {currentTextClip && onPatchClip && selectedId ? (
            <FontPicker value={currentTextClip.style.font} onChange={(f) => onPatchClip(selectedId, { style: { ...currentTextClip.style, font: f } })} brandFonts={brandFonts} label="Font" />
          ) : (
            <p className="text-xs text-muted">Select a text on the timeline to change its font.</p>
          )}
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
                if (currentTextClip && onPatchClip && selectedId) {
                  onPatchClip(selectedId, { anim: { in: anim.id, out: anim.id === "none" ? "none" : anim.id === "typewriter" ? "typewriter" : "fade" } });
                }
              }}
              aria-pressed={currentTextClip?.anim.in === anim.id}
              className={`flex items-center justify-center min-w-[70px] h-11 rounded-xl border px-2 text-xs font-medium transition-all shrink-0 ${currentTextClip?.anim.in === anim.id ? "border-primary bg-primary/15 text-primary" : "border-line bg-surface text-ink hover:border-primary/50"}`}
            >
              {anim.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
