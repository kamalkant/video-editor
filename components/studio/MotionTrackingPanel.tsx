"use client";

import { useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { LabeledSlider } from "@/components/ui/LabeledSlider";
import { formatTime } from "@/lib/format";
import type { VideoClip } from "@/lib/edit/doc";
import {
  TRACKING_COLORS,
  type Attachment,
  type BlurAttachment,
  type ClipAttachment,
  type TrackingAccuracy,
  type TrackingKeyframe,
  type TrackingPoint,
} from "@/lib/tracking/types";

export const EMOJI_DISGUISES = [
  { emoji: "😎", label: "Cool" },
  { emoji: "🤡", label: "Clown" },
  { emoji: "😃", label: "Smile" },
  { emoji: "🐱", label: "Cat" },
  { emoji: "🙈", label: "Monkey" },
  { emoji: "🎭", label: "Mask" },
  { emoji: "🤠", label: "Cowboy" },
  { emoji: "🤖", label: "Robot" },
  { emoji: "🥸", label: "Disguise" },
  { emoji: "👽", label: "Alien" },
  { emoji: "💩", label: "Poop" },
  { emoji: "🤫", label: "Shh" },
] as const;

export const COVERAGE_MARGINS = [
  { label: "Tight (105%)", value: 1.05, desc: "Close fit" },
  { label: "Standard (120%)", value: 1.2, desc: "Recommended · Never reveals face" },
  { label: "Full Head (140%)", value: 1.4, desc: "Full head & hair coverage" },
] as const;

export type MotionTrackingPanelProps = {
  clip: VideoClip;
  currentTime: number;
  duration: number;
  onClose: () => void;
  onAddPoint: (preset?: "ellipse" | "rect" | "point") => void;
  onSelectPoint: (pointId: string) => void;
  onUpdatePoint: (pointId: string, patch: Partial<TrackingPoint>) => void;
  onDeletePoint: (pointId: string) => void;
  onStartTracking: (
    pointId: string,
    direction: "forward" | "backward" | "both" | "stepForward" | "stepBackward",
    range: "full" | "playhead" | "custom",
    customBounds?: { startSec: number; endSec: number },
  ) => void;
  onCancelTracking: () => void;
  isTracking: boolean;
  trackingProgress?: { percent: number; frame: number; total: number; time: number } | null;
  lostTargetInfo?: { pointId: string; time: number; keyframe: TrackingKeyframe } | null;
  onRecoverTarget: (action: "reposition" | "keep" | "stop") => void;
  onAttach: (
    pointId: string,
    type: "blur" | "text" | "image" | "video" | "sticker" | "shape" | "logo" | "effect",
    existingClipId?: string,
  ) => void;
  onUpdateAttachment: (pointId: string, attachmentId: string, patch: Partial<Attachment>) => void;
  onDetach: (pointId: string, attachmentId: string) => void;
  onBakeKeyframes: (pointId: string, attachmentId?: string) => void;
  onSeek?: (t: number) => void;
  timelineClips?: { id: string; name: string; type: string }[];
  onAutoDetectFace?: () => void;
  onApplyDisguise?: (disguise: string, margin: number) => void;
  currentDisguise?: { type: "emoji" | "blur" | "pixelate"; value: string; margin: number } | null;
};

export function MotionTrackingPanel(props: MotionTrackingPanelProps) {
  const {
    clip,
    currentTime,
    duration,
    onClose,
    onAddPoint,
    onSelectPoint,
    onUpdatePoint,
    onDeletePoint,
    onStartTracking,
    onCancelTracking,
    isTracking,
    trackingProgress,
    lostTargetInfo,
    onRecoverTarget,
    onAttach,
    onUpdateAttachment,
    onDetach,
    onBakeKeyframes,
    timelineClips = [],
    onAutoDetectFace,
    onApplyDisguise,
    currentDisguise,
  } = props;

  const trackingData = clip.tracking;
  const points = trackingData?.points ?? [];
  const activePointId = trackingData?.activePointId ?? (points[0]?.id ?? null);
  const activePoint = points.find((p) => p.id === activePointId) ?? points[0] ?? null;

  // Single effect mode toggle: "censor" (blur/pixelate) vs "attach" (text/sticker/clip)
  const [effectTab, setEffectTab] = useState<"censor" | "attach">(
    activePoint?.attachments?.some((a) => a.type === "clip") ? "attach" : "censor"
  );

  const [selectedMargin, setSelectedMargin] = useState<number>(currentDisguise?.margin ?? 1.2);
  type RangeMode = "duration" | "full" | "custom";
  const [rangeMode, setRangeMode] = useState<RangeMode>("duration");
  const [presetSec, setPresetSec] = useState<number | "end">(4);
  const [customSec, setCustomSec] = useState<number>(4);
  const [customStart, setCustomStart] = useState<number>(() => Math.round(currentTime * 10) / 10);
  const [customEnd, setCustomEnd] = useState<number>(() => Math.min(duration, Math.round((currentTime + 4) * 10) / 10));

  let startSec = 0;
  let endSec = duration;

  if (rangeMode === "full") {
    startSec = 0;
    endSec = duration;
  } else if (rangeMode === "duration") {
    startSec = Math.max(0, Math.min(duration, currentTime));
    const span = presetSec === "end" ? duration - startSec : customSec;
    endSec = Math.min(duration, Math.max(startSec + 0.1, startSec + span));
  } else {
    startSec = Math.max(0, Math.min(duration, customStart));
    endSec = Math.max(startSec + 0.1, Math.min(duration, customEnd));
  }

  const activeDuration = Math.max(0, endSec - startSec);
  const [selectedLinkClipId, setSelectedLinkClipId] = useState("");
  const [activeAttDetailId, setActiveAttDetailId] = useState<string | null>(null);

  const blurAttachment = useMemo(() => {
    return (activePoint?.attachments?.find((a) => a.type === "blur") as BlurAttachment | undefined) ?? null;
  }, [activePoint]);

  const clipAttachments = useMemo(() => {
    return (activePoint?.attachments?.filter((a) => a.type === "clip") as ClipAttachment[] | undefined) ?? [];
  }, [activePoint]);

  const keyframeCount = activePoint?.keyframes?.length ?? 0;
  const isOval = activePoint ? (activePoint.type === "area" && blurAttachment?.shape !== "rect") : true;

  // If no point exists yet, ensure one is ready
  const ensurePoint = (shape: "ellipse" | "rect" = "ellipse") => {
    if (!activePoint) {
      onAddPoint(shape);
    }
  };

  const handleShapeChange = (shape: "ellipse" | "rect") => {
    if (!activePoint) {
      onAddPoint(shape);
      return;
    }
    onUpdatePoint(activePoint.id, {
      type: "area",
      initial: {
        ...activePoint.initial,
        box: shape === "ellipse" ? { w: 0.16, h: 0.22 } : { w: 0.18, h: 0.14 },
      },
    });
    if (blurAttachment) {
      onUpdateAttachment(activePoint.id, blurAttachment.id, { shape });
    }
  };

  const handleCensorModeSelect = (mode: "blur" | "pixelate") => {
    if (onApplyDisguise) {
      onApplyDisguise(mode, selectedMargin);
    } else if (activePoint) {
      if (blurAttachment) {
        onUpdateAttachment(activePoint.id, blurAttachment.id, { mode });
      } else {
        onAttach(activePoint.id, "blur");
      }
    } else {
      onAddPoint("ellipse");
    }
  };

  const handleMarginChange = (newMargin: number) => {
    setSelectedMargin(newMargin);
    if (currentDisguise && onApplyDisguise) {
      onApplyDisguise(currentDisguise.value, newMargin);
    }
  };

  const handleClearTracking = () => {
    if (!activePoint) return;
    onUpdatePoint(activePoint.id, {
      keyframes: [],
      status: "idle",
    });
  };

  return (
    <section
      aria-label="Motion Tracking & Censor"
      className="panel flex flex-col h-full overflow-hidden bg-surface select-none"
      data-testid="motion-tracking-panel"
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b border-line px-3.5 py-2.5 bg-surface/80 backdrop-blur-xs">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex size-7 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400 shadow-xs">
            <Icon name="motionTrack" className="size-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <h2 className="text-sm font-semibold text-ink leading-tight truncate">
              Motion Tracking & Censor
            </h2>
            <span className="text-[10px] text-muted truncate">
              {keyframeCount > 0
                ? `✓ Locked (${keyframeCount} frames)`
                : isTracking
                  ? "Tracking motion in video..."
                  : "Lock blur or objects to motion"}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-ink transition-colors"
          aria-label="Close motion tracking panel"
          title="Close panel"
        >
          <Icon name="close" className="size-4" />
        </button>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3.5">
        {/* Tracking In-Progress HUD */}
        {isTracking && trackingProgress && (
          <div className="rounded-xl border border-sky-500/40 bg-sky-500/10 p-3 space-y-2.5 shadow-sm animate-in fade-in">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-sky-400 flex items-center gap-2">
                <span className="size-2 rounded-full bg-sky-400 animate-ping" />
                Tracking Motion...
              </span>
              <span className="font-mono text-xs text-ink font-bold">
                {trackingProgress.percent}%
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-raised overflow-hidden">
              <div
                className="h-full bg-sky-500 transition-all duration-150 rounded-full"
                style={{ width: `${trackingProgress.percent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted font-mono">
              <span>Frame {trackingProgress.frame} / {trackingProgress.total}</span>
              <span>Time: {formatTime(trackingProgress.time)}</span>
            </div>
            <button
              type="button"
              onClick={onCancelTracking}
              className="w-full rounded-lg border border-red-500/30 bg-red-500/10 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition-colors"
            >
              Cancel Tracking
            </button>
          </div>
        )}

        {/* Target Lost Recovery Banner */}
        {lostTargetInfo && (
          <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-xs space-y-2 text-ink">
            <div className="flex items-center gap-1.5 text-amber-500 font-semibold">
              <Icon name="alert" className="size-4 shrink-0" />
              <span>Target occluded or turned at {formatTime(lostTargetInfo.time)}</span>
            </div>
            <div className="grid grid-cols-3 gap-1 pt-1">
              <button
                type="button"
                onClick={() => onRecoverTarget("keep")}
                className="rounded bg-amber-500 text-white font-medium py-1 text-[10px] hover:bg-amber-600 transition-colors shadow-xs"
              >
                Auto-Hold
              </button>
              <button
                type="button"
                onClick={() => onRecoverTarget("reposition")}
                className="rounded bg-surface border border-line py-1 text-[10px] font-medium hover:bg-raised transition-colors"
              >
                Reposition
              </button>
              <button
                type="button"
                onClick={() => onRecoverTarget("stop")}
                className="rounded bg-surface border border-line py-1 text-[10px] font-medium hover:bg-raised transition-colors"
              >
                Stop Here
              </button>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* STEP 1: TARGET (SHAPE & SNAP TO FACE)                     */}
        {/* ========================================================= */}
        <div className="rounded-xl border border-line bg-canvas/30 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink flex items-center gap-1.5">
              <span className="flex size-4 items-center justify-center rounded-full bg-sky-500 text-[10px] font-bold text-white leading-none">
                1
              </span>
              Target Object
            </span>
            <span className="text-[10px] text-muted">
              Drag box on video
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {/* Snap to Face Button */}
            <button
              type="button"
              onClick={() => {
                if (onAutoDetectFace) {
                  onAutoDetectFace();
                } else {
                  ensurePoint("ellipse");
                }
              }}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-sky-500 py-1.5 px-2 text-xs font-semibold text-white shadow-xs hover:bg-sky-600 active:scale-[0.99] transition-all col-span-2"
              title="Automatically detect face in current video frame and lock target box"
            >
              <Icon name="magic" className="size-3.5 fill-white" />
              Snap to Face (AI Detect)
            </button>

            {/* Shape Selectors */}
            <button
              type="button"
              onClick={() => handleShapeChange("ellipse")}
              className={`flex items-center justify-center gap-1.5 rounded-lg border py-1.5 px-2 text-xs font-medium transition-all ${
                isOval
                  ? "border-sky-500 bg-sky-500/15 text-sky-400 font-semibold shadow-xs"
                  : "border-line bg-surface hover:bg-raised text-ink"
              }`}
            >
              <span className="size-3 rounded-full border border-current" />
              Oval (Face / Head)
            </button>
            <button
              type="button"
              onClick={() => handleShapeChange("rect")}
              className={`flex items-center justify-center gap-1.5 rounded-lg border py-1.5 px-2 text-xs font-medium transition-all ${
                !isOval
                  ? "border-sky-500 bg-sky-500/15 text-sky-400 font-semibold shadow-xs"
                  : "border-line bg-surface hover:bg-raised text-ink"
              }`}
            >
              <span className="size-3 rounded-xs border border-current" />
              Box (Object / Plate)
            </button>
          </div>
        </div>

        {/* ========================================================= */}
        {/* STEP 2: EFFECT (CENSOR OR ATTACH)                         */}
        {/* ========================================================= */}
        <div className="rounded-xl border border-line bg-canvas/30 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink flex items-center gap-1.5">
              <span className="flex size-4 items-center justify-center rounded-full bg-sky-500 text-[10px] font-bold text-white leading-none">
                2
              </span>
              Effect to Apply
            </span>
          </div>

          {/* Toggle Censor vs Attach */}
          <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-surface border border-line text-xs font-medium">
            <button
              type="button"
              onClick={() => {
                setEffectTab("censor");
                if (activePoint && !blurAttachment) {
                  onAttach(activePoint.id, "blur");
                }
              }}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-all ${
                effectTab === "censor"
                  ? "bg-sky-500 text-white font-semibold shadow-xs"
                  : "text-muted hover:text-ink"
              }`}
            >
              <Icon name="blur" className="size-3.5" />
              <span>Censor (Blur)</span>
            </button>
            <button
              type="button"
              onClick={() => setEffectTab("attach")}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-all ${
                effectTab === "attach"
                  ? "bg-sky-500 text-white font-semibold shadow-xs"
                  : "text-muted hover:text-ink"
              }`}
            >
              <Icon name="target" className="size-3.5" />
              <span>Attach Layer</span>
            </button>
          </div>

          {/* SUB-VIEW A: CENSOR (BLUR / MOSAIC) */}
          {effectTab === "censor" && (
            <div className="space-y-3 pt-1">
              {/* Blur vs Pixelate */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleCensorModeSelect("blur")}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 px-2 text-xs font-medium transition-all ${
                    blurAttachment?.mode !== "pixelate"
                      ? "border-sky-500 bg-sky-500/15 text-sky-400 font-semibold shadow-xs"
                      : "border-line bg-surface hover:bg-raised text-ink"
                  }`}
                >
                  <Icon name="blur" className="size-3.5 text-sky-400" />
                  Gaussian Blur
                </button>
                <button
                  type="button"
                  onClick={() => handleCensorModeSelect("pixelate")}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 px-2 text-xs font-medium transition-all ${
                    blurAttachment?.mode === "pixelate"
                      ? "border-sky-500 bg-sky-500/15 text-sky-400 font-semibold shadow-xs"
                      : "border-line bg-surface hover:bg-raised text-ink"
                  }`}
                >
                  <span className="font-mono text-xs font-bold text-sky-400">#</span>
                  Mosaic Pixelate
                </button>
              </div>

              {/* Intensity Slider */}
              <div className="space-y-1.5">
                <LabeledSlider
                  label="Intensity"
                  value={blurAttachment?.intensity ?? 25}
                  min={1}
                  max={50}
                  step={1}
                  valueText={(v) => `${v}`}
                  onChange={(v) => {
                    ensurePoint();
                    if (activePoint && blurAttachment) {
                      onUpdateAttachment(activePoint.id, blurAttachment.id, { intensity: v });
                    } else if (onApplyDisguise) {
                      onApplyDisguise(blurAttachment?.mode === "pixelate" ? "pixelate" : "blur", selectedMargin);
                    }
                  }}
                />
              </div>

              {/* Coverage Margin */}
              <div className="space-y-1.5 pt-1 border-t border-line/60">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-semibold uppercase tracking-wider text-muted">
                    Coverage Margin
                  </span>
                  <span className="text-sky-400 font-medium">Full face guarantee</span>
                </div>
                <div className="grid grid-cols-3 gap-1 text-[10px]">
                  {COVERAGE_MARGINS.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => handleMarginChange(m.value)}
                      className={`py-1.5 px-1 rounded-lg border text-center font-medium transition-all ${
                        Math.abs(selectedMargin - m.value) < 0.05
                          ? "border-sky-500 bg-sky-500/15 text-sky-400 font-semibold shadow-xs"
                          : "border-line bg-surface text-muted hover:text-ink"
                      }`}
                      title={m.desc}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SUB-VIEW B: ATTACH OBJECT / LAYER */}
          {effectTab === "attach" && (
            <div className="space-y-3 pt-1">
              <span className="text-[11px] text-muted leading-tight block">
                Create new element or link existing timeline clip to follow this motion track:
              </span>

              {/* Quick Create Buttons */}
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    ensurePoint();
                    if (activePoint) onAttach(activePoint.id, "text");
                  }}
                  className="flex flex-col items-center justify-center gap-1 rounded-lg border border-line bg-surface p-2 text-center text-muted hover:border-sky-500 hover:bg-sky-500/10 hover:text-ink transition-all shadow-xs"
                >
                  <Icon name="text" className="size-4 text-sky-400" />
                  <span className="text-xs font-semibold">+ Text</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    ensurePoint();
                    if (activePoint) onAttach(activePoint.id, "sticker");
                  }}
                  className="flex flex-col items-center justify-center gap-1 rounded-lg border border-line bg-surface p-2 text-center text-muted hover:border-sky-500 hover:bg-sky-500/10 hover:text-ink transition-all shadow-xs"
                >
                  <Icon name="star" className="size-4 text-sky-400" />
                  <span className="text-xs font-semibold">+ Sticker</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    ensurePoint();
                    if (activePoint) onAttach(activePoint.id, "shape");
                  }}
                  className="flex flex-col items-center justify-center gap-1 rounded-lg border border-line bg-surface p-2 text-center text-muted hover:border-sky-500 hover:bg-sky-500/10 hover:text-ink transition-all shadow-xs"
                >
                  <Icon name="elements" className="size-4 text-sky-400" />
                  <span className="text-xs font-semibold">+ Element</span>
                </button>
              </div>

              {/* Link Existing Clip */}
              {timelineClips.length > 0 && (
                <div className="pt-1 space-y-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted block">
                    Or Link Timeline Clip:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={selectedLinkClipId}
                      onChange={(e) => setSelectedLinkClipId(e.target.value)}
                      className="field h-7 text-xs flex-1 px-2 rounded bg-surface border-line truncate"
                    >
                      <option value="">Choose clip to link...</option>
                      {timelineClips.map((c) => (
                        <option key={c.id} value={c.id}>
                          [{c.type.toUpperCase()}] {c.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!selectedLinkClipId}
                      onClick={() => {
                        ensurePoint();
                        if (!selectedLinkClipId || !activePoint) return;
                        const found = timelineClips.find((c) => c.id === selectedLinkClipId);
                        const linkType =
                          found?.type === "text" || found?.type === "image" || found?.type === "video"
                            ? found.type
                            : "shape";
                        onAttach(activePoint.id, linkType, selectedLinkClipId);
                        setSelectedLinkClipId("");
                      }}
                      className="h-7 px-2.5 rounded bg-sky-500 text-white text-xs font-semibold hover:bg-sky-600 disabled:opacity-40 transition-colors shrink-0 shadow-xs flex items-center gap-1"
                    >
                      <Icon name="plus" className="size-3" />
                      Link
                    </button>
                  </div>
                </div>
              )}

              {/* Attached Clips List */}
              {clipAttachments.length > 0 && (
                <div className="space-y-1.5 pt-1 border-t border-line/60">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted block">
                    Attached ({clipAttachments.length})
                  </span>
                  {clipAttachments.map((att) => {
                    const isDetailOpen = activeAttDetailId === att.id;
                    return (
                      <div
                        key={att.id}
                        className="rounded-lg border border-line bg-surface p-2 space-y-2 shadow-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-ink truncate">
                            {att.name || `Clip ${att.clipId.slice(0, 8)}`}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setActiveAttDetailId(isDetailOpen ? null : att.id)}
                              className="flex size-6 items-center justify-center rounded hover:bg-raised text-muted hover:text-ink transition-colors"
                              title="Adjust position & scale"
                            >
                              <Icon name={isDetailOpen ? "chevronDown" : "chevronRight"} className="size-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => activePoint && onDetach(activePoint.id, att.id)}
                              className="flex size-6 items-center justify-center rounded hover:bg-red-500/15 text-muted hover:text-red-400 transition-colors"
                              title="Detach"
                            >
                              <Icon name="trash" className="size-3" />
                            </button>
                          </div>
                        </div>

                        {isDetailOpen && activePoint && (
                          <div className="pt-1.5 border-t border-line/60 space-y-2 text-xs">
                            <LabeledSlider
                              label="Scale"
                              value={att.offset?.scale ?? 1}
                              min={0.1}
                              max={3}
                              step={0.05}
                              valueText={(v) => `${v.toFixed(2)}x`}
                              onChange={(v) =>
                                onUpdateAttachment(activePoint.id, att.id, {
                                  offset: { ...att.offset, scale: v },
                                })
                              }
                            />
                            <LabeledSlider
                              label="Offset X"
                              value={att.offset?.x ?? 0}
                              min={-0.5}
                              max={0.5}
                              step={0.01}
                              valueText={(v) => `${(v * 100).toFixed(0)}%`}
                              onChange={(v) =>
                                onUpdateAttachment(activePoint.id, att.id, {
                                  offset: { ...att.offset, x: v },
                                })
                              }
                            />
                            <LabeledSlider
                              label="Offset Y"
                              value={att.offset?.y ?? 0}
                              min={-0.5}
                              max={0.5}
                              step={0.01}
                              valueText={(v) => `${(v * 100).toFixed(0)}%`}
                              onChange={(v) =>
                                onUpdateAttachment(activePoint.id, att.id, {
                                  offset: { ...att.offset, y: v },
                                })
                              }
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* STEP 3: ACTION (TRACK MOTION)                             */}
        {/* ========================================================= */}
        <div className="rounded-xl border border-line bg-canvas/30 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink flex items-center gap-1.5">
              <span className="flex size-4 items-center justify-center rounded-full bg-sky-500 text-[10px] font-bold text-white leading-none">
                3
              </span>
              Tracking Range & Execution
            </span>
            {keyframeCount > 0 && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                ✓ {keyframeCount} kfs
              </span>
            )}
          </div>

          {/* Range Mode Selector */}
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-1 text-[11px] font-medium">
              <button
                type="button"
                onClick={() => setRangeMode("duration")}
                className={`py-1.5 px-1 rounded-lg border text-center transition-all ${
                  rangeMode === "duration"
                    ? "border-sky-500 bg-sky-500/15 text-sky-400 font-semibold shadow-xs"
                    : "border-line bg-surface text-muted hover:text-ink"
                }`}
                title="Track for a specific duration starting from the playhead"
              >
                From Playhead
              </button>
              <button
                type="button"
                onClick={() => setRangeMode("full")}
                className={`py-1.5 px-1 rounded-lg border text-center transition-all ${
                  rangeMode === "full"
                    ? "border-sky-500 bg-sky-500/15 text-sky-400 font-semibold shadow-xs"
                    : "border-line bg-surface text-muted hover:text-ink"
                }`}
                title="Track entire video clip from start to finish"
              >
                Full Clip
              </button>
              <button
                type="button"
                onClick={() => {
                  setRangeMode("custom");
                  setCustomStart(Math.round(currentTime * 10) / 10);
                  setCustomEnd(Math.min(duration, Math.round((currentTime + 4) * 10) / 10));
                }}
                className={`py-1.5 px-1 rounded-lg border text-center transition-all ${
                  rangeMode === "custom"
                    ? "border-sky-500 bg-sky-500/15 text-sky-400 font-semibold shadow-xs"
                    : "border-line bg-surface text-muted hover:text-ink"
                }`}
                title="Specify exact start and end times"
              >
                Custom Range
              </button>
            </div>

            {/* Sub-controls for "From Playhead" Mode */}
            {rangeMode === "duration" && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted">Duration presets:</span>
                  <span className="text-[10px] text-sky-400 font-medium">
                    from {startSec.toFixed(1)}s
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 text-xs font-semibold">
                  {[2, 4, 10].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setPresetSec(s);
                        setCustomSec(s);
                      }}
                      className={`py-1 px-1 rounded-md border text-center transition-all ${
                        presetSec === s
                          ? "border-sky-500 bg-sky-500 text-white shadow-xs"
                          : "border-line bg-surface/80 text-muted hover:text-ink hover:border-line/80"
                      }`}
                    >
                      {s}s
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPresetSec("end")}
                    className={`py-1 px-1 rounded-md border text-center transition-all ${
                      presetSec === "end"
                        ? "border-sky-500 bg-sky-500 text-white shadow-xs"
                        : "border-line bg-surface/80 text-muted hover:text-ink hover:border-line/80"
                    }`}
                  >
                    To End
                  </button>
                </div>

                {presetSec !== "end" && (
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[11px] text-muted">Custom seconds:</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0.5}
                        max={duration}
                        step={0.5}
                        value={customSec}
                        onChange={(e) => {
                          const val = Math.max(0.2, parseFloat(e.target.value) || 1);
                          setCustomSec(val);
                          setPresetSec(val);
                        }}
                        className="field h-6 w-16 text-center text-xs px-1 rounded bg-surface border-line"
                      />
                      <span className="text-[10px] text-muted">sec</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sub-controls for "Custom Range" Mode */}
            {rangeMode === "custom" && (
              <div className="space-y-2 pt-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted text-[11px]">Start:</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={customEnd}
                      step={0.5}
                      value={customStart}
                      onChange={(e) => setCustomStart(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="field h-6 w-16 text-center text-xs px-1 rounded bg-surface border-line"
                    />
                    <span className="text-[10px] text-muted">s</span>
                    <button
                      type="button"
                      onClick={() => setCustomStart(Math.round(currentTime * 10) / 10)}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-line bg-surface text-muted hover:text-ink hover:border-sky-500/50"
                      title="Set start to current playhead"
                    >
                      Playhead
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted text-[11px]">End:</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={customStart}
                      max={duration}
                      step={0.5}
                      value={customEnd}
                      onChange={(e) => setCustomEnd(Math.min(duration, parseFloat(e.target.value) || duration))}
                      className="field h-6 w-16 text-center text-xs px-1 rounded bg-surface border-line"
                    />
                    <span className="text-[10px] text-muted">s</span>
                    <button
                      type="button"
                      onClick={() => setCustomEnd(Math.round(currentTime * 10) / 10)}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-line bg-surface text-muted hover:text-ink hover:border-sky-500/50"
                      title="Set end to current playhead"
                    >
                      Playhead
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Visual Duration Range Bar */}
            <div className="space-y-1 pt-1.5">
              <div className="relative h-2 w-full rounded-full bg-slate-800 overflow-hidden border border-line/60">
                {/* Active Tracking Range Highlight */}
                <div
                  className="absolute top-0 bottom-0 bg-gradient-to-r from-sky-500 to-blue-600 rounded-full transition-all"
                  style={{
                    left: `${(startSec / Math.max(0.1, duration)) * 100}%`,
                    width: `${(activeDuration / Math.max(0.1, duration)) * 100}%`,
                  }}
                />
                {/* Playhead Marker */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10 pointer-events-none"
                  style={{
                    left: `${Math.max(0, Math.min(100, (currentTime / Math.max(0.1, duration)) * 100))}%`,
                  }}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] text-muted">
                <span>0.0s</span>
                <span className="font-semibold text-sky-400">
                  {startSec.toFixed(1)}s → {endSec.toFixed(1)}s ({activeDuration.toFixed(1)}s)
                </span>
                <span>{duration.toFixed(1)}s</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-1">
            {keyframeCount > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (activePoint) {
                      onStartTracking(
                        activePoint.id,
                        rangeMode === "full" ? "both" : "forward",
                        rangeMode === "full" ? "full" : "custom",
                        { startSec, endSec },
                      );
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-sky-500 py-2 px-2 text-xs font-semibold text-white shadow-xs hover:bg-sky-600 active:scale-[0.99] transition-all"
                >
                  <Icon name="play" className="size-3.5 fill-white" />
                  Re-Track {rangeMode === "full" ? "Clip" : `${activeDuration.toFixed(1)}s`}
                </button>
                <button
                  type="button"
                  onClick={handleClearTracking}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-line bg-surface py-2 px-2 text-xs font-medium text-muted hover:text-red-400 hover:border-red-500/30 transition-all"
                >
                  <Icon name="trash" className="size-3.5" />
                  Clear All
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  ensurePoint();
                  const ptId = activePoint?.id || points[0]?.id;
                  if (ptId) {
                    onStartTracking(
                      ptId,
                      rangeMode === "full" ? "both" : "forward",
                      rangeMode === "full" ? "full" : "custom",
                      { startSec, endSec },
                    );
                  } else {
                    onAddPoint("ellipse");
                  }
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-600 active:scale-[0.99] transition-all"
              >
                <Icon name="play" className="size-3.5 fill-white" />
                Track {rangeMode === "full" ? "Full Clip" : `${activeDuration.toFixed(1)}s Range`}
              </button>
            )}
            <p className="text-[11px] text-muted text-center leading-tight">
              {rangeMode === "full"
                ? "Tracks automatically across the entire video clip with subpixel precision."
                : `Tracks only for ${activeDuration.toFixed(1)}s. Effect is active strictly during tracked range.`}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
