"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { LabeledSlider } from "@/components/ui/LabeledSlider";
import { ColorSection } from "./LookSections";
import { LooksStrip } from "./LooksStrip";
import type { AnyClip, ColorAdjust, TimelineDoc, VideoClip, ImageClip, TextClip, ElementClip } from "@/lib/edit/doc";
import { LOOKS, NEUTRAL } from "@/lib/player/look";

export type EffectsTab = "looks" | "color" | "vfx" | "style";

interface EffectsPanelProps {
  doc: TimelineDoc;
  selectedClip: AnyClip | null;
  targetClip: AnyClip | null;
  thumb: string | null;
  onChangeColor: (clipId: string, color: ColorAdjust | undefined, group?: string) => void;
  onApplyAllLooks: (color: ColorAdjust | undefined) => void;
  onAutoColor?: () => Promise<ColorAdjust | null>;
  onPatchClip?: (clipId: string, patch: Record<string, unknown>, group?: string) => void;
}

export function EffectsPanel({
  selectedClip,
  targetClip,
  thumb,
  onChangeColor,
  onApplyAllLooks,
  onAutoColor,
  onPatchClip,
}: EffectsPanelProps) {
  const [tab, setTab] = useState<EffectsTab>("looks");

  // Prefer selected clip if visual, else targetClip (the clip on Video 1 under playhead)
  const clip = (selectedClip && selectedClip.type !== "audio" && selectedClip.type !== "blank")
    ? selectedClip
    : targetClip;

  const isVisual = clip && (clip.type === "video" || clip.type === "image");
  const isText = clip?.type === "text";
  const isElement = clip?.type === "element";

  const color = (clip && "color" in clip) ? (clip as VideoClip | ImageClip).color : undefined;

  const clipLabel = useMemo(() => {
    if (!clip) return "No clip active at playhead";
    if (clip.type === "text") return `Text: “${(clip as TextClip).text.split("\n")[0].slice(0, 24)}”`;
    if (clip.type === "element") return "Selected Graphic Element";
    if (clip.type === "image") return "Picture Clip";
    return "Video Clip";
  }, [clip]);

  const applyVfxPreset = (preset: "glow" | "noir" | "vintage" | "cyberpunk" | "matte" | "night") => {
    if (!clip || !isVisual) return;
    let next: ColorAdjust;
    switch (preset) {
      case "glow":
        next = { brightness: 0.1, contrast: 1.15, saturation: 1.25, temperature: 0.2, look: "vivid", vignette: 0.15 };
        break;
      case "noir":
        next = { brightness: -0.05, contrast: 1.35, saturation: 0, temperature: 0, look: "bw", vignette: 0.45 };
        break;
      case "vintage":
        next = { brightness: 0.05, contrast: 0.95, saturation: 0.85, temperature: 0.4, look: "vintage", vignette: 0.4 };
        break;
      case "cyberpunk":
        next = { brightness: 0.05, contrast: 1.25, saturation: 1.45, temperature: -0.2, look: "cyberpunk", vignette: 0.3 };
        break;
      case "matte":
        next = { brightness: 0.08, contrast: 0.85, saturation: 0.8, temperature: 0.1, look: "fade", vignette: 0.1 };
        break;
      case "night":
        next = { brightness: -0.15, contrast: 1.1, saturation: 0.7, temperature: -0.6, look: "night", vignette: 0.35 };
        break;
    }
    onChangeColor(clip.id, next, "clip:vfx");
  };

  return (
    <div className="flex flex-col gap-3" data-testid="effects-panel">
      {/* Active Clip Status Header */}
      <div className="flex items-center justify-between rounded-lg border border-line bg-raised/50 px-2.5 py-1.5 text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon name="effects" className="size-4 shrink-0 text-primary" />
          <span className="truncate font-medium text-ink">{clipLabel}</span>
        </div>
        {clip && isVisual && color && (
          <button
            type="button"
            className="text-[0.6875rem] text-link underline shrink-0"
            onClick={() => onChangeColor(clip.id, undefined, "clip:color-reset")}
          >
            Reset
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-4 gap-1 rounded-lg border border-line bg-raised/30 p-1">
        <button
          type="button"
          className={`rounded px-1.5 py-1 text-xs font-medium transition-colors ${tab === "looks" ? "bg-primary text-white shadow-sm" : "text-muted hover:text-ink"}`}
          onClick={() => setTab("looks")}
        >
          Filters
        </button>
        <button
          type="button"
          className={`rounded px-1.5 py-1 text-xs font-medium transition-colors ${tab === "color" ? "bg-primary text-white shadow-sm" : "text-muted hover:text-ink"}`}
          onClick={() => setTab("color")}
        >
          Color
        </button>
        <button
          type="button"
          className={`rounded px-1.5 py-1 text-xs font-medium transition-colors ${tab === "vfx" ? "bg-primary text-white shadow-sm" : "text-muted hover:text-ink"}`}
          onClick={() => setTab("vfx")}
        >
          VFX
        </button>
        <button
          type="button"
          className={`rounded px-1.5 py-1 text-xs font-medium transition-colors ${tab === "style" ? "bg-primary text-white shadow-sm" : "text-muted hover:text-ink"}`}
          onClick={() => setTab("style")}
        >
          Stylize
        </button>
      </div>

      {/* Tab 1: Filters & Looks */}
      {tab === "looks" && (
        <div className="flex flex-col gap-3">
          {clip && isVisual ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted">Cinematic Looks ({Object.keys(LOOKS).length})</span>
                <span className="text-[0.6875rem] text-muted">Click to apply</span>
              </div>
              <LooksStrip
                color={color}
                thumb={thumb}
                onChange={(c, g) => onChangeColor(clip.id, c, g ? `${g}:${clip.id}` : undefined)}
                onAll={() => onApplyAllLooks(color)}
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line p-6 text-center">
              <Icon name="effects" className="size-8 text-muted" />
              <p className="text-xs text-muted">Select a video or picture clip on the timeline or canvas to apply cinematic filters.</p>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Color Grading */}
      {tab === "color" && (
        <div className="flex flex-col gap-3">
          {clip && isVisual ? (
            <ColorSection
              open
              color={color}
              onChange={(c, g) => onChangeColor(clip.id, c, g ? `${g}:${clip.id}` : undefined)}
              onAuto={onAutoColor}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line p-6 text-center">
              <Icon name="sun" className="size-8 text-muted" />
              <p className="text-xs text-muted">Select a video or picture clip to adjust brightness, contrast, saturation, and temperature.</p>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Stylistic VFX Presets & Custom Sliders */}
      {tab === "vfx" && (
        <div className="flex flex-col gap-3">
          {clip && isVisual ? (
            <>
              {/* Sliders for fine-tuning */}
              <div className="flex flex-col gap-2 rounded-lg border border-line bg-raised/30 p-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">VFX Controls</span>
                <LabeledSlider
                  label="Glow / Bloom"
                  value={Math.round((color?.glow ?? 0) * 100)}
                  min={0}
                  max={100}
                  step={1}
                  unit={{ short: "%", spoken: "percent" }}
                  valueText={(v) => `${v}%`}
                  onChange={(v) => {
                    const next = { ...(color ?? NEUTRAL), glow: v > 0 ? v / 100 : undefined };
                    onChangeColor(clip.id, next, "clip:vfx-glow");
                  }}
                />
                <LabeledSlider
                  label="Film Grain"
                  value={Math.round((color?.grain ?? 0) * 100)}
                  min={0}
                  max={100}
                  step={1}
                  unit={{ short: "%", spoken: "percent" }}
                  valueText={(v) => `${v}%`}
                  onChange={(v) => {
                    const next = { ...(color ?? NEUTRAL), grain: v > 0 ? v / 100 : undefined };
                    onChangeColor(clip.id, next, "clip:vfx-grain");
                  }}
                />
                <LabeledSlider
                  label="Soft Blur"
                  value={Math.round((color?.blur ?? 0) * 100)}
                  min={0}
                  max={100}
                  step={1}
                  unit={{ short: "%", spoken: "percent" }}
                  valueText={(v) => `${v}%`}
                  onChange={(v) => {
                    const next = { ...(color ?? NEUTRAL), blur: v > 0 ? v / 100 : undefined };
                    onChangeColor(clip.id, next, "clip:vfx-blur");
                  }}
                />
                <LabeledSlider
                  label="Retro Pixelate"
                  value={Math.round((color?.pixelate ?? 0) * 100)}
                  min={0}
                  max={100}
                  step={1}
                  unit={{ short: "%", spoken: "percent" }}
                  valueText={(v) => `${v}%`}
                  onChange={(v) => {
                    const next = { ...(color ?? NEUTRAL), pixelate: v > 0 ? v / 100 : undefined };
                    onChangeColor(clip.id, next, "clip:vfx-pixelate");
                  }}
                />
              </div>

              {/* Quick Presets */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">VFX Presets</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="flex flex-col items-start gap-1 rounded-lg border border-line bg-raised/40 p-2 text-left hover:border-primary hover:bg-primary-soft transition-colors"
                    onClick={() => {
                      const next: ColorAdjust = { ...(color ?? NEUTRAL), glow: 0.65, brightness: 0.1, contrast: 1.15, saturation: 1.25 };
                      onChangeColor(clip.id, next, "clip:vfx");
                    }}
                  >
                    <div className="flex size-7 items-center justify-center rounded-md bg-amber-500/20 text-amber-400">
                      <Icon name="sun" className="size-4" />
                    </div>
                    <span className="text-xs font-medium text-ink">Glow & Bloom</span>
                    <span className="text-[0.625rem] text-muted leading-tight">Warm highlights and luminous radiance</span>
                  </button>

                  <button
                    type="button"
                    className="flex flex-col items-start gap-1 rounded-lg border border-line bg-raised/40 p-2 text-left hover:border-primary hover:bg-primary-soft transition-colors"
                    onClick={() => {
                      const next: ColorAdjust = { ...(color ?? NEUTRAL), grain: 0.5, vignette: 0.35, look: "vintage", temperature: 0.3 };
                      onChangeColor(clip.id, next, "clip:vfx");
                    }}
                  >
                    <div className="flex size-7 items-center justify-center rounded-md bg-orange-500/20 text-orange-400">
                      <Icon name="film" className="size-4" />
                    </div>
                    <span className="text-xs font-medium text-ink">Vintage 8mm</span>
                    <span className="text-[0.625rem] text-muted leading-tight">Analog film grain & warm vignette</span>
                  </button>

                  <button
                    type="button"
                    className="flex flex-col items-start gap-1 rounded-lg border border-line bg-raised/40 p-2 text-left hover:border-primary hover:bg-primary-soft transition-colors"
                    onClick={() => {
                      const next: ColorAdjust = { ...(color ?? NEUTRAL), grain: 0.35, vignette: 0.45, look: "bw", contrast: 1.35 };
                      onChangeColor(clip.id, next, "clip:vfx");
                    }}
                  >
                    <div className="flex size-7 items-center justify-center rounded-md bg-slate-500/20 text-slate-300">
                      <Icon name="moon" className="size-4" />
                    </div>
                    <span className="text-xs font-medium text-ink">Dramatic Noir</span>
                    <span className="text-[0.625rem] text-muted leading-tight">High-contrast monochrome & texture</span>
                  </button>

                  <button
                    type="button"
                    className="flex flex-col items-start gap-1 rounded-lg border border-line bg-raised/40 p-2 text-left hover:border-primary hover:bg-primary-soft transition-colors"
                    onClick={() => {
                      const next: ColorAdjust = { ...(color ?? NEUTRAL), glow: 0.5, look: "cyberpunk", saturation: 1.4, contrast: 1.25 };
                      onChangeColor(clip.id, next, "clip:vfx");
                    }}
                  >
                    <div className="flex size-7 items-center justify-center rounded-md bg-fuchsia-500/20 text-fuchsia-400">
                      <Icon name="magic" className="size-4" />
                    </div>
                    <span className="text-xs font-medium text-ink">Cyberpunk</span>
                    <span className="text-[0.625rem] text-muted leading-tight">Neon saturation with edge glow</span>
                  </button>

                  <button
                    type="button"
                    className="flex flex-col items-start gap-1 rounded-lg border border-line bg-raised/40 p-2 text-left hover:border-primary hover:bg-primary-soft transition-colors"
                    onClick={() => {
                      const next: ColorAdjust = { ...(color ?? NEUTRAL), blur: 0.6 };
                      onChangeColor(clip.id, next, "clip:vfx");
                    }}
                  >
                    <div className="flex size-7 items-center justify-center rounded-md bg-indigo-500/20 text-indigo-400">
                      <Icon name="blur" className="size-4" />
                    </div>
                    <span className="text-xs font-medium text-ink">Dreamy Blur</span>
                    <span className="text-[0.625rem] text-muted leading-tight">Soft atmospheric Gaussian blur</span>
                  </button>

                  <button
                    type="button"
                    className="flex flex-col items-start gap-1 rounded-lg border border-line bg-raised/40 p-2 text-left hover:border-primary hover:bg-primary-soft transition-colors"
                    onClick={() => {
                      const next: ColorAdjust = { ...(color ?? NEUTRAL), pixelate: 0.5 };
                      onChangeColor(clip.id, next, "clip:vfx");
                    }}
                  >
                    <div className="flex size-7 items-center justify-center rounded-md bg-emerald-500/20 text-emerald-400">
                      <Icon name="grid" className="size-4" />
                    </div>
                    <span className="text-xs font-medium text-ink">8-Bit Pixelate</span>
                    <span className="text-[0.625rem] text-muted leading-tight">Retro arcade pixel grid mosaic</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line p-6 text-center">
              <Icon name="magic" className="size-8 text-muted" />
              <p className="text-xs text-muted">Select a video or picture to adjust Glow, Film Grain, Blur, Pixelate and VFX presets.</p>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Text & Element Stylization */}
      {tab === "style" && (
        <div className="flex flex-col gap-3">
          {isText && clip && onPatchClip && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-ink">Text Effect Presets</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-line bg-raised/40 p-2 text-left hover:border-primary"
                  onClick={() => {
                    const st = (clip as TextClip).style;
                    onPatchClip(clip.id, {
                      style: { ...st, shadow: true, shadowStyle: "glow", accent: "#38bdf8", color: "#ffffff" },
                    }, "text:style-preset");
                  }}
                >
                  <span className="text-xs font-bold text-sky-400 drop-shadow-[0_0_8px_#38bdf8]">Neon Glow</span>
                  <p className="text-[0.625rem] text-muted">Vibrant electric aura</p>
                </button>

                <button
                  type="button"
                  className="rounded-lg border border-line bg-raised/40 p-2 text-left hover:border-primary"
                  onClick={() => {
                    const st = (clip as TextClip).style;
                    onPatchClip(clip.id, {
                      style: { ...st, outline: { color: "#000000", width: 0.08 }, shadow: true, shadowStyle: "strong", color: "#fbbf24" },
                    }, "text:style-preset");
                  }}
                >
                  <span className="text-xs font-bold text-amber-400">Outline & Shadow</span>
                  <p className="text-[0.625rem] text-muted">Punchy comic style</p>
                </button>

                <button
                  type="button"
                  className="rounded-lg border border-line bg-raised/40 p-2 text-left hover:border-primary"
                  onClick={() => {
                    const st = (clip as TextClip).style;
                    onPatchClip(clip.id, {
                      style: { ...st, box: "pill", shape: "pill", color: "#ffffff" },
                    }, "text:style-preset");
                  }}
                >
                  <span className="text-xs font-bold text-ink">Pill Badge</span>
                  <p className="text-[0.625rem] text-muted">Contained backdrop</p>
                </button>

                <button
                  type="button"
                  className="rounded-lg border border-line bg-raised/40 p-2 text-left hover:border-primary"
                  onClick={() => {
                    const st = (clip as TextClip).style;
                    onPatchClip(clip.id, {
                      style: { ...st, gradient: "#f43f5e", color: "#fef08a" },
                    }, "text:style-preset");
                  }}
                >
                  <span className="text-xs font-bold text-rose-400">Gradient Duo</span>
                  <p className="text-[0.625rem] text-muted">Warm sunset gradient</p>
                </button>
              </div>
            </div>
          )}

          {isElement && clip && onPatchClip && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-ink">Element Stylization</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-line bg-raised/40 p-2 text-left hover:border-primary"
                  onClick={() => {
                    const el = (clip as ElementClip).el;
                    onPatchClip(clip.id, {
                      el: { ...el, stroke: "#ffffff", strokeWidth: 0.06 },
                    }, "element:style-preset");
                  }}
                >
                  <span className="text-xs font-medium text-ink">Thick Outline</span>
                  <p className="text-[0.625rem] text-muted">High-contrast white border</p>
                </button>

                <button
                  type="button"
                  className="rounded-lg border border-line bg-raised/40 p-2 text-left hover:border-primary"
                  onClick={() => {
                    const el = (clip as ElementClip).el;
                    onPatchClip(clip.id, {
                      el: { ...el, fill: "none", stroke: "#38bdf8", strokeWidth: 0.05 },
                    }, "element:style-preset");
                  }}
                >
                  <span className="text-xs font-medium text-sky-400">Hollow Wireframe</span>
                  <p className="text-[0.625rem] text-muted">Neon stroke, see-through fill</p>
                </button>
              </div>
            </div>
          )}

          {!isText && !isElement && (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line p-6 text-center">
              <Icon name="text" className="size-8 text-muted" />
              <p className="text-xs text-muted">Select a Text or Element clip to apply glowing neon, 3D outlines, gradients, or pill badges.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
