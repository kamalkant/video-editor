"use client";

import { useState } from "react";
import { Popover } from "@/components/ui/Popover";
import type { Canvas } from "@/lib/edit/doc";
import { formatFps, formatTime } from "@/lib/format";
import { CanvasSizeFields, ratioName, Shape } from "./RatioMenu";

const RATES = [24, 25, 30, 50, 60];

/**
 * Top bar: the project's frame as a small icon (its shape). Hover: size · ratio ·
 * fps · length · clips; a click opens its settings (size, the export's frame rate).
 */
export function ProjectFacts(p: { canvas: Canvas; duration: number; clips: number; tracks: number; onSize: (size: Partial<Canvas>) => void; onFps: (fps: number) => void; className: string }) {
  const [open, setOpen] = useState(false);
  const { width, height, fps } = p.canvas;
  const ratio = ratioName(p.canvas);
  const clips = `${p.clips} ${p.clips === 1 ? "clip" : "clips"}`;
  const facts = `${width}×${height}${ratio.includes(":") ? ` · ${ratio}` : ""} · ${formatFps(fps)} fps · ${formatTime(p.duration)} · ${clips}`;
  const rates = RATES.includes(fps) ? RATES : [...RATES, fps].sort((a, b) => a - b);
  return (
    <Popover
      label="Project settings"
      open={open}
      onOpenChange={setOpen}
      buttonLabel={`Project settings: ${facts}`}
      tip={
        <>
          <span className="tabular-nums">{facts}</span>
          <span className="block text-muted">Click to change the size or frame rate</span>
        </>
      }
      buttonClassName={`${p.className} ${open ? "bg-raised text-ink" : ""}`}
      panelClassName="w-[18.5rem] p-3"
      button={
        <span data-testid="project-facts" data-facts={facts} className="flex size-5 items-center justify-center">
          <Shape w={width} h={height} />
        </span>
      }
    >
      <p className="mb-3 rounded-md bg-canvas px-2 py-1.5 text-xs tabular-nums" data-testid="project-facts-line">
        {facts}
      </p>
      <p className="mb-2 text-xs font-semibold">Project size</p>
      <CanvasSizeFields canvas={p.canvas} onCanvas={p.onSize} />
      <fieldset className="mt-3">
        <legend className="mb-1.5 text-xs font-semibold">Frame rate</legend>
        <div className="flex gap-1" role="group" aria-label="Frame rate">
          {rates.map((r) => (
            <button key={r} type="button" aria-pressed={r === fps} onClick={() => p.onFps(r)} className={`flex-1 rounded-md border px-1 py-1 text-xs tabular-nums ${r === fps ? "border-primary bg-primary-soft text-ink" : "border-line text-muted hover:border-control hover:text-ink"}`}>
              {formatFps(r)}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[0.6875rem] text-muted">Frames per second in the exported file. 30 suits most videos; 24 looks like film; 50 / 60 for fast motion.</p>
      </fieldset>
      <p className="mt-3 border-t border-line pt-2 text-xs text-muted">
        Length {formatTime(p.duration)} · {clips} on {p.tracks} {p.tracks === 1 ? "track" : "tracks"}
      </p>
    </Popover>
  );
}
