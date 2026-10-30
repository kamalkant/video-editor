"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { LabeledSlider } from "@/components/ui/LabeledSlider";
import { Switch } from "@/components/ui/Switch";
import {
  DEFAULT_SMART_MIX_CONFIG,
  type SmartMixConfig,
} from "@/lib/audio/smartMix";
import type { TimelineDoc } from "@/lib/edit/doc";

export type SmartMixPanelProps = {
  doc: TimelineDoc;
  onApply: (config: SmartMixConfig) => void;
  onReset: () => void;
  onClose: () => void;
  isAnalyzing?: boolean;
};

export function SmartMixPanel(props: SmartMixPanelProps) {
  const { doc, onApply, onReset, onClose, isAnalyzing = false } = props;

  const currentConfig: SmartMixConfig = useMemo(() => {
    return doc.smartMix ?? DEFAULT_SMART_MIX_CONFIG;
  }, [doc.smartMix]);

  const [enabled, setEnabled] = useState(currentConfig.enabled ?? true);
  const [priority, setPriority] = useState<"voiceover" | "video" | "both">(currentConfig.priority ?? "both");
  const [duckAmount, setDuckAmount] = useState(currentConfig.duckAmount ?? 0.7);
  const [fadeDuration, setFadeDuration] = useState(currentConfig.fadeDuration ?? 0.3);
  const [normalVolume, setNormalVolume] = useState(currentConfig.normalVolume ?? 1.0);
  const [videoTrackId, setVideoTrackId] = useState<string>(currentConfig.videoTrackId ?? "");
  const [voiceoverTrackId, setVoiceoverTrackId] = useState<string>(currentConfig.voiceoverTrackId ?? "");

  // Available tracks
  const videoTracks = useMemo(() => {
    return doc.tracks.filter((t) => t.kind === "main" || t.kind === "overlay");
  }, [doc.tracks]);

  const audioTracks = useMemo(() => {
    return doc.tracks.filter((t) => t.kind === "audio");
  }, [doc.tracks]);

  // Count clips with volume automation
  const automatedClipCount = useMemo(() => {
    let count = 0;
    for (const tr of doc.tracks) {
      for (const c of tr.clips) {
        if ("volumeAutomation" in c && Array.isArray((c as any).volumeAutomation) && (c as any).volumeAutomation.length > 0) {
          count++;
        }
      }
    }
    return count;
  }, [doc.tracks]);

  const handleApply = () => {
    onApply({
      enabled,
      priority,
      duckAmount,
      fadeDuration,
      normalVolume,
      videoTrackId: videoTrackId || undefined,
      voiceoverTrackId: voiceoverTrackId || undefined,
    });
  };

  return (
    <section
      aria-label="Smart Audio Mix & Dialogue Ducking"
      className="panel flex flex-col h-full overflow-hidden bg-surface select-none"
      data-testid="smart-mix-panel"
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b border-line px-3.5 py-2.5 bg-surface/80 backdrop-blur-xs">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex size-7 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400 shadow-xs">
            <Icon name="volume" className="size-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <h2 className="text-sm font-semibold text-ink leading-tight truncate">
              Smart Audio Mix
            </h2>
            <span className="text-2xs text-muted truncate">
              Intelligent Dialogue Ducking
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-ink transition-colors"
          aria-label="Close Smart Audio Mix panel"
          title="Close panel"
        >
          <Icon name="close" className="size-4" />
        </button>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3.5">
        {/* Master Enable Card */}
        <div className="rounded-xl border border-line bg-canvas/30 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-ink">Smart Dialogue Ducking</span>
              <span className="text-2xs text-muted">
                Automatically dips background sound under speech
              </span>
            </div>
            <Switch
              label="Enable Smart Mix"
              hideLabel
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>

          {automatedClipCount > 0 && (
            <div className="flex items-center gap-1.5 pt-1 border-t border-line/60 text-2xs text-emerald-400 font-medium">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Smart Mix active on {automatedClipCount} clip{automatedClipCount > 1 ? "s" : ""}</span>
            </div>
          )}
        </div>

        {/* Priority Selector */}
        <div className="rounded-xl border border-line bg-canvas/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink">Speech Priority Mode</span>
            <span className="text-2xs text-muted">During simultaneous dialogue</span>
          </div>

          <div className="grid grid-cols-3 gap-1 text-2xs font-medium">
            <button
              type="button"
              onClick={() => setPriority("both")}
              className={`py-1.5 px-1 rounded-lg border text-center transition-all ${
                priority === "both"
                  ? "border-sky-500 bg-sky-500/15 text-sky-400 font-semibold shadow-xs"
                  : "border-line bg-surface text-muted hover:text-ink"
              }`}
              title="Balanced clarity: Voiceover 85%, Video 60%"
            >
              Intelligent Both
            </button>
            <button
              type="button"
              onClick={() => setPriority("voiceover")}
              className={`py-1.5 px-1 rounded-lg border text-center transition-all ${
                priority === "voiceover"
                  ? "border-sky-500 bg-sky-500/15 text-sky-400 font-semibold shadow-xs"
                  : "border-line bg-surface text-muted hover:text-ink"
              }`}
              title="Voiceover stays full volume, Video audio is lowered"
            >
              Voiceover First
            </button>
            <button
              type="button"
              onClick={() => setPriority("video")}
              className={`py-1.5 px-1 rounded-lg border text-center transition-all ${
                priority === "video"
                  ? "border-sky-500 bg-sky-500/15 text-sky-400 font-semibold shadow-xs"
                  : "border-line bg-surface text-muted hover:text-ink"
              }`}
              title="Video dialogue stays full volume, Voiceover is lowered"
            >
              Video First
            </button>
          </div>
        </div>

        {/* Mix Parameters */}
        <div className="rounded-xl border border-line bg-canvas/30 p-3 space-y-3">
          <span className="text-xs font-semibold text-ink block">
            Ducking & Transition Controls
          </span>

          <div className="space-y-2.5">
            <LabeledSlider
              label="Duck Amount"
              value={Math.round(duckAmount * 100)}
              min={10}
              max={95}
              step={5}
              unit={{ short: "%", spoken: "percent" }}
              valueText={(v) => `${v}% reduction (${(100 - v)}% volume)`}
              onChange={(v) => setDuckAmount(v / 100)}
            />

            <LabeledSlider
              label="Fade In/Out Time"
              value={fadeDuration}
              min={0.1}
              max={1.0}
              step={0.05}
              unit={{ short: "s", spoken: "seconds" }}
              valueText={(v) => `${v.toFixed(2)}s`}
              onChange={(v) => setFadeDuration(v)}
            />

            <LabeledSlider
              label="Normal Baseline Volume"
              value={Math.round(normalVolume * 100)}
              min={50}
              max={150}
              step={5}
              unit={{ short: "%", spoken: "percent" }}
              valueText={(v) => `${v}%`}
              onChange={(v) => setNormalVolume(v / 100)}
            />
          </div>
        </div>

        {/* Track Targeting Override (Optional) */}
        <div className="rounded-xl border border-line bg-canvas/30 p-3 space-y-2.5">
          <span className="text-xs font-semibold text-ink block">
            Track Target Assignment
          </span>

          <div className="space-y-2 text-xs">
            <div className="space-y-1">
              <label htmlFor="video-track-select" className="text-2xs text-muted block uppercase tracking-wider font-semibold">
                Video Audio Source:
              </label>
              <select
                id="video-track-select"
                value={videoTrackId}
                onChange={(e) => setVideoTrackId(e.target.value)}
                className="field h-7 text-xs w-full px-2 rounded bg-surface border-line"
              >
                <option value="">Auto (All Video Tracks with Audio)</option>
                {videoTracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    [{t.kind.toUpperCase()}] {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="voice-track-select" className="text-2xs text-muted block uppercase tracking-wider font-semibold">
                Voiceover Audio Source:
              </label>
              <select
                id="voice-track-select"
                value={voiceoverTrackId}
                onChange={(e) => setVoiceoverTrackId(e.target.value)}
                className="field h-7 text-xs w-full px-2 rounded bg-surface border-line"
              >
                <option value="">Auto (All Audio Tracks)</option>
                {audioTracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    [AUDIO] {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            disabled={isAnalyzing}
            onClick={handleApply}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-600 disabled:opacity-50 active:scale-[0.99] transition-all"
          >
            {isAnalyzing ? (
              <>
                <span className="size-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                <span>Analyzing Speech & Mixing...</span>
              </>
            ) : (
              <>
                <Icon name="magic" className="size-3.5 fill-white" />
                <span>Analyze & Apply Mix</span>
              </>
            )}
          </button>

          {automatedClipCount > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-surface py-2 text-xs font-medium text-muted hover:text-red-400 hover:border-red-500/30 transition-all"
            >
              <Icon name="trash" className="size-3.5" />
              <span>Reset Mix (Restore Original Audio)</span>
            </button>
          )}

          <p className="text-2xs text-muted text-center leading-tight pt-1">
            Non-destructive: generates smooth volume automation curves without altering source files.
          </p>
        </div>
      </div>
    </section>
  );
}
