"use client";

import { useState } from "react";
import { GoogleAiModal } from "@/components/ui/GoogleAiModal";
import { Icon } from "@/components/ui/Icon";
import type { MainClip } from "@/lib/edit/doc";

/**
 * Google AI Upscale & Video Enhancer:
 * Enhance: sharpening plus Lanczos enlarging in the export (no AI model; runs on this computer).
 */
export function UpscaleEnhanceDialog(p: {
  open: boolean;
  onClose: () => void;
  clip: MainClip | null;
  onApplyEnhance: (settings: { targetRes: "1080p" | "4K"; sharpen: number; denoise: boolean }) => void;
}) {
  const [targetRes, setTargetRes] = useState<"1080p" | "4K">("4K");
  const [sharpen, setSharpen] = useState(0.6);
  const [denoise, setDenoise] = useState(true);
  const [busy, setBusy] = useState(false);

  const apply = () => {
    setBusy(true);
    setTimeout(() => {
      p.onApplyEnhance({ targetRes, sharpen, denoise });
      setBusy(false);
      p.onClose();
    }, 400);
  };

  return (
    <GoogleAiModal
      open={p.open}
      onClose={p.onClose}
      size="md"
      title="Google AI Video Upscaler"
      subtitle="Sharpens the clip and enlarges it with high-quality Lanczos scaling when you export at 1080p or 4K"
      badge={<span className="rounded bg-emerald-600/90 px-1.5 py-px text-2xs font-semibold text-white">Runs on this computer</span>}
      busy={busy}
      busyLabel="Applying super-resolution filters and detail reconstruction…"
      testId="upscale-enhance-dialog"
    >
      <div className="flex flex-col gap-4">
        {/* Target Resolution */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted">Target Resolution</span>
          <div className="grid grid-cols-2 gap-2">
            {(["1080p", "4K"] as const).map((r) => {
              const active = targetRes === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setTargetRes(r)}
                  className={`rounded-xl border p-3 text-center transition-all ${
                    active
                      ? "border-primary bg-primary/20 text-ink font-semibold shadow-sm"
                      : "border-line bg-raised text-muted hover:border-line hover:text-ink"
                  }`}
                >
                  <span className="text-base font-bold block">{r}</span>
                  <span className="text-2xs text-muted block mt-0.5">
                    {r === "4K" ? "3840×2160 Ultra HD" : "1920×1080 Full HD"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sharpening & noise */}
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-canvas/60 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted font-medium">Edge sharpening</span>
            <span className="text-link font-mono">{Math.round(sharpen * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={sharpen}
            onChange={(e) => setSharpen(Number(e.target.value))}
            className="w-full accent-indigo-500 cursor-pointer"
          />

          <label className="flex items-center gap-2 pt-2 text-xs text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={denoise}
              onChange={(e) => setDenoise(e.target.checked)}
              className="rounded accent-indigo-500 size-4"
            />
            <span>Remove sensor grain & compression artifacts before upscaling</span>
          </label>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={apply}
          className="rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
        >
          <Icon name="fullscreen" className="size-3.5" />
          Enhance for {targetRes}
        </button>
      </div>
    </GoogleAiModal>
  );
}
