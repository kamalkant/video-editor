"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { TimelineDoc, VideoClip } from "@/lib/edit/doc";
import { findClip } from "@/lib/edit/doc";

export type MobileFiltersSheetProps = {
  doc: TimelineDoc;
  selectedId: string | null;
  onPatchClip?: (clipId: string, patch: Partial<VideoClip>) => void;
};

const FILTER_PRESETS = [
  { id: "none", label: "Original", filter: "" },
  { id: "vibrant", label: "Vibrant", filter: "saturate(1.4) contrast(1.1)" },
  { id: "warm", label: "Warm", filter: "sepia(0.25) saturate(1.2)" },
  { id: "cool", label: "Cool", filter: "hue-rotate(180deg) saturate(0.9)" },
  { id: "cinematic", label: "Cinematic", filter: "contrast(1.2) brightness(0.95) saturate(1.1)" },
  { id: "bw", label: "B&W", filter: "grayscale(1)" },
  { id: "vintage", label: "Vintage", filter: "sepia(0.4) contrast(1.15) brightness(0.9)" },
  { id: "moody", label: "Moody", filter: "contrast(1.3) brightness(0.85)" },
];

export function MobileFiltersSheet({
  doc,
  selectedId,
  onPatchClip,
}: MobileFiltersSheetProps) {
  const [activeFilterId, setActiveFilterId] = useState<string>("none");
  const [activeTab, setActiveTab] = useState<"presets" | "adjust">("presets");

  // Adjustments state
  const [brightness, setBrightness] = useState<number>(100);
  const [contrast, setContrast] = useState<number>(100);
  const [saturation, setSaturation] = useState<number>(100);

  const selectedClip = selectedId ? findClip(doc, selectedId)?.clip : null;
  const isVideoOrImage = selectedClip?.type === "video" || selectedClip?.type === "image";

  const applyAdjustment = (b: number, c: number, s: number) => {
    if (selectedId && isVideoOrImage && onPatchClip) {
      const filterStr = `brightness(${b}%) contrast(${c}%) saturate(${s}%)`;
      onPatchClip(selectedId, {
        // apply filter
      });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Sub-tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab("presets")}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium shrink-0 transition-colors ${
            activeTab === "presets"
              ? "bg-primary text-white shadow-xs"
              : "bg-raised/70 text-muted hover:text-ink"
          }`}
        >
          Color Presets
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("adjust")}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium shrink-0 transition-colors ${
            activeTab === "adjust"
              ? "bg-primary text-white shadow-xs"
              : "bg-raised/70 text-muted hover:text-ink"
          }`}
        >
          Adjustments
        </button>
      </div>

      {activeTab === "presets" ? (
        <div className="flex items-center gap-2 overflow-x-auto py-1 no-scrollbar">
          {FILTER_PRESETS.map((p) => {
            const isSelected = activeFilterId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setActiveFilterId(p.id);
                  if (selectedId && isVideoOrImage && onPatchClip) {
                    // Apply preset
                  }
                }}
                className={`flex flex-col items-center justify-center gap-1 min-w-[65px] h-16 rounded-xl border p-1.5 transition-all shrink-0 active:scale-95 ${
                  isSelected
                    ? "border-primary bg-primary/15 text-primary font-semibold shadow-xs"
                    : "border-line bg-surface text-ink hover:bg-raised"
                }`}
              >
                <span className="flex size-7 items-center justify-center rounded-full bg-raised/80">
                  🎨
                </span>
                <span className="text-[10px] text-muted truncate max-w-full">{p.label}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-2 py-1">
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px] text-muted">
              <span>Brightness</span>
              <span className="tabular-nums font-semibold text-ink">{brightness}%</span>
            </div>
            <input
              type="range"
              min={50}
              max={150}
              value={brightness}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                setBrightness(val);
                applyAdjustment(val, contrast, saturation);
              }}
              className="w-full accent-primary h-1.5 cursor-pointer"
            />
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px] text-muted">
              <span>Contrast</span>
              <span className="tabular-nums font-semibold text-ink">{contrast}%</span>
            </div>
            <input
              type="range"
              min={50}
              max={150}
              value={contrast}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                setContrast(val);
                applyAdjustment(brightness, val, saturation);
              }}
              className="w-full accent-primary h-1.5 cursor-pointer"
            />
          </div>
        </div>
      )}
    </div>
  );
}
