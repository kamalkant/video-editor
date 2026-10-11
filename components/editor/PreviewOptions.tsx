"use client";

import { BackgroundSwatches, type Bg, type BgMedia } from "./BackgroundSwatches";

export function PreviewOptions({ bg, onBg, custom, onCustom, highlight, onHighlight, media, onMedia, inline }: { bg: Bg; onBg: (b: Bg) => void; custom: string; onCustom: (c: string) => void; highlight: boolean; onHighlight: (v: boolean) => void; media: Partial<Record<"image" | "video", BgMedia>>; onMedia: (file: File, kind: "image" | "video") => void; inline?: boolean }) {
  return (
    <div className={inline ? "flex flex-wrap items-center justify-between gap-x-4 gap-y-1" : "flex flex-col gap-2"}>
      <BackgroundSwatches inline={inline} value={bg} onChange={onBg} custom={custom} onCustomChange={onCustom} media={media} onMedia={onMedia} />
      <label className="flex min-h-hit items-center gap-2 text-xs">
        <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={highlight} onChange={(e) => onHighlight(e.target.checked)} />
        Highlight see-through areas
      </label>
    </div>
  );
}
