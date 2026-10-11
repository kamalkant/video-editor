"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Popover } from "@/components/ui/Popover";
import { CANVAS_PRESETS, type Canvas } from "@/lib/edit/doc";

const QUICK = ["16:9", "9:16", "1:1", "4:3", "3:4", "4:5", "21:9"] as const;
const even = (v: number) => Math.max(64, Math.min(3840, Math.round(v / 2) * 2));

/** The shape of a frame, drawn small (16 px on its long side). */
export function Shape({ w, h }: { w: number; h: number }) {
  const k = 16 / Math.max(w, h);
  return <span aria-hidden="true" className="inline-block rounded-[2px] border-[1.5px] border-current" style={{ width: Math.max(5, w * k), height: Math.max(5, h * k) }} />;
}

/** "16:9", "9:16"… for the preset sizes, else "1000×1002". */
export const ratioName = (c: Pick<Canvas, "width" | "height">) => CANVAS_PRESETS.find((p) => p.width === c.width && p.height === c.height)?.id.replace("-720", "") ?? `${c.width}×${c.height}`;

type SizeProps = { canvas: Canvas; onCanvas: (size: Partial<Canvas>) => void };

/** The ratio buttons and a custom width × height (Ratio ▾ and the top bar's project settings). */
export function CanvasSizeFields({ canvas, onCanvas }: SizeProps) {
  const [w, setW] = useState(String(canvas.width));
  const [h, setH] = useState(String(canvas.height));
  const [seen, setSeen] = useState(`${canvas.width}x${canvas.height}`);
  const now = `${canvas.width}x${canvas.height}`;
  if (seen !== now) {
    setSeen(now);
    setW(String(canvas.width));
    setH(String(canvas.height));
  }
  return (
    <>
      <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Aspect ratio">
        {QUICK.map((id) => {
          const p = CANVAS_PRESETS.find((x) => x.id === id)!;
          const on = p.width === canvas.width && p.height === canvas.height;
          const isVertical = p.height > p.width;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              title={p.label}
              onClick={() => onCanvas({ width: p.width, height: p.height, ...(isVertical ? { fit: "fill" } : {}) })}
              className={`flex flex-col items-center gap-1 rounded-md border px-1 py-1.5 text-[0.6875rem] ${on ? "border-primary bg-primary-soft text-ink" : "border-line text-muted hover:border-control hover:text-ink"}`}
            >
              <Shape w={p.width} h={p.height} />
              {id}
            </button>
          );
        })}
      </div>
      <form
        className="mt-3 flex items-end gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const W = even(Number(w) || canvas.width);
          const H = even(Number(h) || canvas.height);
          const isVertical = H > W;
          onCanvas({ width: W, height: H, ...(isVertical ? { fit: "fill" } : {}) });
        }}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-[0.6875rem] text-muted">
          Width
          <input className="field h-8 min-h-0 px-2 text-sm" inputMode="numeric" value={w} onChange={(e) => setW(e.target.value.replace(/\D/g, ""))} aria-label="Custom width" />
        </label>
        <span className="pb-2 text-muted">×</span>
        <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-[0.6875rem] text-muted">
          Height
          <input className="field h-8 min-h-0 px-2 text-sm" inputMode="numeric" value={h} onChange={(e) => setH(e.target.value.replace(/\D/g, ""))} aria-label="Custom height" />
        </label>
        <button type="submit" className="btn btn-primary min-h-8 px-3 text-xs">
          Set
        </button>
      </form>
      <p className="mt-2 text-[0.6875rem] text-muted">Any size from 64 to 3840 pixels (even numbers). Clips are fitted to the new frame; move them on the preview.</p>
    </>
  );
}

/**
 * Ratio ▾ in the preview toolbar: switch the project between 16:9, 9:16,
 * 1:1, 4:3… or any size. Clips keep their place (fitted to the new frame).
 */
export function RatioMenu({ canvas, onCanvas }: SizeProps) {
  return (
    <Popover
      size="sm"
      label="Aspect ratio"
      buttonLabel={`Aspect ratio: ${ratioName(canvas)}`}
      button={
        <>
          <Shape w={canvas.width} h={canvas.height} />
          <span data-testid="ratio-label">{ratioName(canvas)}</span>
          <Icon name="chevronDown" className="size-3" />
        </>
      }
    >
      <p className="mb-2 text-xs font-semibold">Aspect ratio (project size)</p>
      <CanvasSizeFields canvas={canvas} onCanvas={onCanvas} />
    </Popover>
  );
}
