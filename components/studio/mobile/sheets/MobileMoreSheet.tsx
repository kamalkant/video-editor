"use client";

import { Icon, type IconName } from "@/components/ui/Icon";
import type { TimelineDoc } from "@/lib/edit/doc";

export type MobileMoreSheetProps = {
  doc: TimelineDoc;
  onSetAspectRatio?: (ratio: "16:9" | "9:16" | "1:1" | "4:5" | "21:9") => void;
  onOpenPanel: (panel: "library" | "media" | "templates" | "brand" | "background" | "subtitles") => void;
};

const ASPECT_RATIOS: { id: "16:9" | "9:16" | "1:1" | "4:5" | "21:9"; label: string; desc: string }[] = [
  { id: "16:9", label: "16:9", desc: "YouTube" },
  { id: "9:16", label: "9:16", desc: "Shorts / Reels" },
  { id: "1:1", label: "1:1", desc: "Square" },
  { id: "4:5", label: "4:5", desc: "Portrait" },
  { id: "21:9", label: "21:9", desc: "Cinema" },
];

const MORE_TOOLS: { id: "library" | "media" | "templates" | "brand" | "background" | "subtitles"; label: string; icon: IconName }[] = [
  { id: "media", label: "My Assets", icon: "media" },
  { id: "library", label: "Stock Library", icon: "library" },
  { id: "templates", label: "Templates", icon: "templates" },
  { id: "brand", label: "Brand Kit", icon: "brand" },
  { id: "background", label: "Background", icon: "background" },
  { id: "subtitles", label: "Subtitles", icon: "subtitles" },
];

export function MobileMoreSheet({
  doc,
  onSetAspectRatio,
  onOpenPanel,
}: MobileMoreSheetProps) {
  const currentRatio =
    doc.canvas.width === 1920 && doc.canvas.height === 1080
      ? "16:9"
      : doc.canvas.width === 1080 && doc.canvas.height === 1920
      ? "9:16"
      : doc.canvas.width === 1080 && doc.canvas.height === 1080
      ? "1:1"
      : "16:9";

  return (
    <div className="flex flex-col gap-3 py-1">
      {/* Canvas Aspect Ratio Row */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold text-muted">Canvas Aspect Ratio</span>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {ASPECT_RATIOS.map((ar) => {
            const isSelected = currentRatio === ar.id;
            return (
              <button
                key={ar.id}
                type="button"
                onClick={() => onSetAspectRatio?.(ar.id)}
                className={`flex flex-col items-center justify-center min-w-[65px] h-14 rounded-xl border p-1 transition-all shrink-0 active:scale-95 ${
                  isSelected
                    ? "border-primary bg-primary/15 text-primary font-semibold shadow-xs"
                    : "border-line bg-surface text-ink hover:bg-raised"
                }`}
              >
                <span className="text-xs font-semibold">{ar.label}</span>
                <span className="text-[9px] text-muted truncate">{ar.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid of secondary studio modules */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold text-muted">Studio Panels</span>
        <div className="grid grid-cols-3 gap-2">
          {MORE_TOOLS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={() => onOpenPanel(tool.id)}
              className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-line bg-surface p-2.5 hover:border-primary/50 transition-all active:scale-95 text-center"
            >
              <Icon name={tool.icon} className="size-4.5 text-primary" />
              <span className="text-[11px] font-medium text-ink truncate max-w-full">
                {tool.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
