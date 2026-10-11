"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { ImageAspect } from "@/lib/ai/shapes";

export interface AspectOption {
  id: ImageAspect;
  label: string;
  sub: string;
  ratioWidth: number;
  ratioHeight: number;
}

export const ASPECT_OPTIONS: AspectOption[] = [
  { id: "16:9", label: "16:9", sub: "YouTube / Landscape", ratioWidth: 16, ratioHeight: 9 },
  { id: "9:16", label: "9:16", sub: "Reels / Shorts / TikTok", ratioWidth: 9, ratioHeight: 16 },
  { id: "1:1", label: "1:1", sub: "Square / Feed", ratioWidth: 1, ratioHeight: 1 },
  { id: "4:3", label: "4:3", sub: "Classic Video", ratioWidth: 4, ratioHeight: 3 },
  { id: "21:9", label: "21:9", sub: "Cinematic Ultra-wide", ratioWidth: 21, ratioHeight: 9 },
];

/**
 * Visual aspect ratio tile selector with proportional preview boxes.
 */
export function AspectTileSelector({
  value,
  onChange,
  className = "",
}: {
  value: ImageAspect;
  onChange: (a: ImageAspect) => void;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-2 gap-2 sm:grid-cols-5 ${className}`} role="radiogroup" aria-label="Aspect Ratio">
      {ASPECT_OPTIONS.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.id)}
            className={`group relative flex flex-col items-center justify-between rounded-xl border p-2.5 text-center transition-all ${
              active
                ? "border-indigo-500 bg-indigo-500/10 text-white shadow-sm ring-1 ring-indigo-500/40"
                : "border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:bg-white/[0.05] hover:text-slate-200"
            }`}
          >
            {/* Visual ratio preview rectangle */}
            <div className="flex h-10 w-full items-center justify-center">
              <div
                className={`rounded border transition-colors ${
                  active ? "border-indigo-400 bg-indigo-400/20" : "border-slate-500/60 bg-slate-500/10"
                }`}
                style={{
                  width: `${Math.min(38, Math.max(16, (opt.ratioWidth / Math.max(opt.ratioWidth, opt.ratioHeight)) * 36))}px`,
                  height: `${Math.min(36, Math.max(16, (opt.ratioHeight / Math.max(opt.ratioWidth, opt.ratioHeight)) * 36))}px`,
                }}
              />
            </div>
            <span className="text-xs font-semibold mt-1">{opt.label}</span>
            <span className="text-[0.625rem] text-slate-400 leading-tight truncate w-full mt-0.5">{opt.sub}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * "✨ Enhance with Gemini" button that calls the prompt-enhance API.
 */
export function PromptEnhancerButton({
  prompt,
  onEnhanced,
  type = "image",
  style,
  disabled = false,
}: {
  prompt: string;
  onEnhanced: (expanded: string) => void;
  type?: "image" | "video" | "voiceover";
  style?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enhance = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/prompt-enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, type, style }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Couldn't enhance prompt.");
      if (data.enhanced) onEnhanced(data.enhanced);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={disabled || busy || !prompt.trim()}
        onClick={() => void enhance()}
        className="group relative inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-gradient-to-r from-blue-900/30 via-indigo-900/30 to-purple-900/30 px-3 py-1 text-xs font-medium text-indigo-300 shadow-sm transition-all hover:border-indigo-400/60 hover:from-blue-900/50 hover:to-purple-900/50 hover:text-white disabled:opacity-50"
        title="Use Gemini to expand your idea into a detailed, photorealistic prompt"
      >
        <span className="flex size-3.5 items-center justify-center text-amber-300 transition-transform group-hover:scale-110">
          ✨
        </span>
        <span>{busy ? "Enhancing…" : "Enhance prompt with Gemini"}</span>
      </button>
      {error && <span className="text-[0.6875rem] text-rose-400">{error}</span>}
    </div>
  );
}

/**
 * Clickable pill tags with style presets and keywords.
 */
export function StyleChipGroup({
  chips,
  onSelect,
  activeLabel,
  className = "",
}: {
  chips: { label: string; words: string }[];
  onSelect: (c: { label: string; words: string }) => void;
  activeLabel?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {chips.map((c) => {
        const active = activeLabel === c.label;
        return (
          <button
            key={c.label}
            type="button"
            onClick={() => onSelect(c)}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              active
                ? "border-indigo-500 bg-indigo-500/20 font-medium text-white shadow-sm"
                : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            + {c.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Real-time reactive audio visualizer canvas for microphone monitoring or audio playback.
 */
export function AudioWaveformCanvas({
  stream,
  audioElement,
  level = 0,
  isRecording = false,
  className = "h-16 w-full rounded-xl bg-slate-950/70 border border-white/10",
}: {
  stream?: MediaStream | null;
  audioElement?: HTMLAudioElement | null;
  level?: number;
  isRecording?: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let sourceNode: MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null = null;
    let animId = 0;

    const source = stream || audioElement;
    if (source) {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtx = new AudioCtx();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.8;

        if (stream && stream.getAudioTracks().length > 0) {
          sourceNode = audioCtx.createMediaStreamSource(stream);
          sourceNode.connect(analyser);
        } else if (audioElement) {
          sourceNode = audioCtx.createMediaElementSource(audioElement);
          sourceNode.connect(analyser);
          analyser.connect(audioCtx.destination);
        }
      } catch {
        /* audio context blocked or already connected */
      }
    }

    const bufferLength = analyser ? analyser.frequencyBinCount : 32;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animId = requestAnimationFrame(render);
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      if (analyser) {
        analyser.getByteFrequencyData(dataArray);
      } else if (level > 0.01) {
        // Drive wave from meter level
        for (let i = 0; i < bufferLength; i++) {
          dataArray[i] = Math.floor(Math.min(255, level * 255 * (0.6 + Math.sin(i * 0.4 + Date.now() * 0.01) * 0.4)));
        }
      } else {
        // Fallback pulsing idle wave if no active audio stream
        for (let i = 0; i < bufferLength; i++) {
          dataArray[i] = isRecording ? Math.floor(10 + Math.random() * 20) : 0;
        }
      }

      // Draw stylized Google AI waveform bars
      const barCount = 36;
      const barWidth = Math.max(2, (width / barCount) - 3);
      const gradient = ctx.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, "#4285F4"); // Google Blue
      gradient.addColorStop(0.5, "#9C27B0"); // Google Purple
      gradient.addColorStop(1, "#FF4081"); // Google Pink

      ctx.fillStyle = gradient;

      for (let i = 0; i < barCount; i++) {
        const index = Math.floor((i / barCount) * bufferLength);
        const val = dataArray[index] || 0;
        const barHeight = Math.max(3, (val / 255) * (height - 8));
        const x = i * (barWidth + 3) + 4;
        const y = (height - barHeight) / 2;

        // Rounded bar
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      if (sourceNode) sourceNode.disconnect();
      if (analyser) analyser.disconnect();
      if (audioCtx && audioCtx.state !== "closed") void audioCtx.close();
    };
  }, [stream, audioElement, isRecording]);

  return <canvas ref={canvasRef} width={400} height={64} className={className} />;
}

/**
 * Google Gemini Badge with Google sparkle logo.
 */
export function GoogleGeminiPill({
  label = "Google Gemini",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[0.6875rem] font-semibold tracking-wide text-indigo-300 shadow-sm ${className}`}
    >
      <span className="text-[0.625rem]">✨</span>
      <span>{label}</span>
    </span>
  );
}
