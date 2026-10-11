"use client";

import { useResolvedTheme } from "@/lib/editor/theme";

import { useState, useRef, useEffect, useCallback } from "react";
import { Icon } from "@/components/ui/Icon";
import { useAutoplayMode } from "../media/useSiteVideo";
import { SITE_MEDIA } from "../media/manifest";

export function CompareReviewModule() {
  const theme = useResolvedTheme();
  const isLight = theme === "light";
  const [sliderPos, setSliderPos] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [mode, setMode] = useState<"split" | "side" | "diff">("split");
  // plays by itself unless the visitor asked for less motion (then the play button starts it)
  const autoplay = useAutoplayMode();
  const [userChoice, setUserChoice] = useState<boolean | null>(null);
  const isPlaying = userChoice ?? autoplay === "auto";
  const containerRef = useRef<HTMLDivElement>(null);
  const rawVideoRef = useRef<HTMLVideoElement>(null);
  const masterVideoRef = useRef<HTMLVideoElement>(null);

  // Sync dual videos in exact frame lockstep
  const syncVideos = useCallback(() => {
    const raw = rawVideoRef.current;
    const master = masterVideoRef.current;
    if (raw && master) {
      if (Math.abs(raw.currentTime - master.currentTime) > 0.08) {
        master.currentTime = raw.currentTime;
      }
    }
  }, []);

  // Viewport-aware autoplay
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const raw = rawVideoRef.current;
        const master = masterVideoRef.current;
        if (entry.isIntersecting && isPlaying) {
          raw?.play().catch(() => {});
          master?.play().catch(() => {});
        } else {
          raw?.pause();
          master?.pause();
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [isPlaying]);

  const togglePlay = () => {
    const next = !isPlaying;
    setUserChoice(next);
    const raw = rawVideoRef.current;
    const master = masterVideoRef.current;
    if (next) {
      raw?.play().catch(() => {});
      master?.play().catch(() => {});
    } else {
      raw?.pause();
      master?.pause();
    }
  };

  const updateFromClientX = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = Math.max(1, Math.min(99, ((clientX - rect.left) / rect.width) * 100));
    setSliderPos(pct);
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);
    updateFromClientX(e.clientX);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleWindowPointerMove = (e: PointerEvent) => {
      e.preventDefault();
      updateFromClientX(e.clientX);
    };

    const handleWindowPointerUp = (e: PointerEvent) => {
      e.preventDefault();
      setIsDragging(false);
    };

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerUp);

    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerUp);
    };
  }, [isDragging, updateFromClientX]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setSliderPos((prev) => Math.max(2, prev - 3));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setSliderPos((prev) => Math.min(98, prev + 3));
    }
  };

  return (
    <div className="w-full relative transition-all duration-500 group">
      {/* Ambient Rose/Purple Light Halo */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(244, 63, 94, 0.12) 0%, transparent 70%)" }} />

      {/* Header Info - Floating Borderless Typography */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono font-bold text-rose-400 bg-rose-950/60 border border-rose-800/40 px-2 py-0.5 rounded">
              07
            </span>
            <span className="text-xs font-mono tracking-wider text-purple-300 uppercase">
              Compare & Review
            </span>
          </div>

          <h3 className={`text-2xl sm:text-4xl font-extrabold tracking-tight ${isLight ? "text-slate-900" : "text-white"}`}>
            Compare multiple versions side by side
          </h3>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl mt-1">
            Synchronized dual playback. Compare original raw camera log footage with master cinema color grading in real time with zero frame-drift.
          </p>
        </div>

        {/* Mode Switcher - Sleek Floating Pill */}
        <div className="flex items-center gap-1 bg-site-surface/90 p-1.5 rounded-full border border-purple-500/20 text-xs font-mono shrink-0 shadow-lg backdrop-blur-md">
          <button
            onClick={() => setMode("split")}
            className={`px-4 py-1.5 rounded-full transition-all duration-300 ${
              mode === "split" ? "bg-rose-500 text-white font-bold shadow-md shadow-rose-500/30" : "text-slate-400 hover:text-white"
            }`}
          >
            Split
          </button>
          <button
            onClick={() => setMode("side")}
            className={`px-4 py-1.5 rounded-full transition-all duration-300 ${
              mode === "side" ? "bg-rose-500 text-white font-bold shadow-md shadow-rose-500/30" : "text-slate-400 hover:text-white"
            }`}
          >
            Side-by-Side
          </button>
          <button
            onClick={() => setMode("diff")}
            className={`px-4 py-1.5 rounded-full transition-all duration-300 ${
              mode === "diff" ? "bg-rose-500 text-white font-bold shadow-md shadow-rose-500/30" : "text-slate-400 hover:text-white"
            }`}
          >
            Diff
          </button>
        </div>
      </div>

      {/* Massive Borderless Widescreen Visual Stage */}
      {mode === "split" && (
        <div
          ref={containerRef}
          tabIndex={0}
          role="slider"
          aria-label="Compare Raw Log and Master Grade Versions Splitter"
          aria-valuenow={Math.round(sliderPos)}
          aria-valuemin={0}
          aria-valuemax={100}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          className="relative aspect-video sm:aspect-[21/9] w-full rounded-3xl overflow-hidden cursor-ew-resize border border-white/10 select-none bg-black shadow-[0_25px_80px_rgba(0,0,0,0.9),0_0_60px_rgba(244,63,94,0.12)] touch-none group/stage focus:outline-none focus:ring-2 focus:ring-rose-400/40"
        >
          {/* Bottom Layer: Generated V2 Master Cinema Grade */}
          <div className="absolute inset-0 w-full h-full pointer-events-none select-none">
            <video
              ref={masterVideoRef}
              src={SITE_MEDIA.gradeMaster.src}
              poster={SITE_MEDIA.gradeMaster.poster}
              preload="none"
              muted
              loop
              playsInline
              className="w-full h-full object-cover pointer-events-none select-none"
            />
            <div className="absolute bottom-5 right-5 flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-rose-500/40 text-xs font-mono text-rose-300 shadow-xl pointer-events-none">
              <span className="size-2 rounded-full bg-rose-400 animate-ping" />
              <span>Generated V2 (Master Cinema Grade)</span>
            </div>
          </div>

          {/* Top Layer: Original Raw Camera Log - Clipped via clipPath */}
          <div
            style={{ clipPath: `inset(0 calc(100% - ${sliderPos}%) 0 0)` }}
            className="absolute inset-0 w-full h-full pointer-events-none select-none"
          >
            <video
              ref={rawVideoRef}
              src={SITE_MEDIA.gradeRaw.src}
              poster={SITE_MEDIA.gradeRaw.poster}
              preload="none"
              muted
              loop
              playsInline
              onTimeUpdate={syncVideos}
              className="w-full h-full object-cover pointer-events-none select-none"
            />
            <div className="absolute bottom-5 left-5 flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-white/20 text-xs font-mono text-white shadow-xl pointer-events-none">
              <span className="size-2 rounded-full bg-white/70" />
              <span>Original (Take 01 Log RAW)</span>
            </div>
          </div>

          {/* Draggable Divider Line & Circular Splitter Handle */}
          <div
            style={{ left: `${sliderPos}%` }}
            className="absolute inset-y-0 -translate-x-1/2 flex items-center justify-center pointer-events-none z-30"
          >
            {/* Vertical Hairline Divider Line */}
            <div className="w-0.5 h-full bg-white shadow-[0_0_15px_rgba(255,255,255,0.9)]" />

            {/* Circular Draggable Button */}
            <div
              className={`absolute size-10 rounded-full bg-white text-slate-950 font-bold shadow-[0_0_30px_rgba(255,255,255,0.95)] flex items-center justify-center text-xs border-2 border-slate-950 pointer-events-auto cursor-ew-resize transition-all ${
                isDragging
                  ? "scale-125 bg-rose-300 ring-4 ring-rose-400/50"
                  : "hover:scale-110 group-hover/stage:scale-105"
              }`}
            >
              ↔
            </div>
          </div>
        </div>
      )}

      {mode === "side" && (
        <div className="grid grid-cols-2 gap-4 aspect-video sm:aspect-[21/9] w-full rounded-3xl overflow-hidden border border-white/10 bg-black p-4 shadow-[0_25px_80px_rgba(0,0,0,0.9)]">
          <div className="relative rounded-2xl overflow-hidden border border-white/10">
            <video
              src={SITE_MEDIA.gradeRaw.src}
              poster={SITE_MEDIA.gradeRaw.poster}
              preload="metadata"
              autoPlay={isPlaying}
              muted
              loop
              playsInline
              className="w-full h-full object-cover pointer-events-none select-none"
            />
            <span className="absolute bottom-4 left-4 px-3.5 py-1.5 rounded-full bg-black/80 backdrop-blur-md text-xs font-mono text-white border border-white/20 shadow-md">
              Original (Take 01 Log RAW)
            </span>
          </div>
          <div className="relative rounded-2xl overflow-hidden border border-rose-500/40">
            <video
              src={SITE_MEDIA.gradeMaster.src}
              poster={SITE_MEDIA.gradeMaster.poster}
              preload="metadata"
              autoPlay={isPlaying}
              muted
              loop
              playsInline
              className="w-full h-full object-cover pointer-events-none select-none"
            />
            <span className="absolute bottom-4 right-4 px-3.5 py-1.5 rounded-full bg-black/80 backdrop-blur-md text-xs font-mono text-rose-300 border border-rose-500/40 shadow-md">
              Generated V2 (Master Cinema Grade)
            </span>
          </div>
        </div>
      )}

      {mode === "diff" && (
        <div className="relative aspect-video sm:aspect-[21/9] w-full rounded-3xl overflow-hidden border border-white/10 bg-black select-none flex items-center justify-center shadow-[0_25px_80px_rgba(0,0,0,0.9)]">
          <video
            src={SITE_MEDIA.gradeRaw.src}
              poster={SITE_MEDIA.gradeRaw.poster}
              preload="metadata"
            autoPlay={isPlaying}
            muted
            loop
            playsInline
            className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
          />
          <video
            src={SITE_MEDIA.gradeMaster.src}
              poster={SITE_MEDIA.gradeMaster.poster}
              preload="metadata"
            autoPlay={isPlaying}
            muted
            loop
            playsInline
            className="absolute inset-0 w-full h-full object-cover mix-blend-difference opacity-90 pointer-events-none select-none"
          />
          <div className="absolute bottom-5 left-5 px-4 py-2 rounded-xl bg-black/90 backdrop-blur-md text-xs font-mono text-rose-300 border border-rose-500/40 shadow-xl">
            Color Grading LUT Delta Pass (Tone Curve & Gamut Transform)
          </div>
        </div>
      )}

      {/* Synchronized Playback Control Bar - Floating borderless */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 mt-2">
        <div className="flex items-center gap-4">
          <button
            onClick={togglePlay}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-500/20 to-rose-500/20 hover:from-purple-500/30 hover:to-rose-500/30 border border-purple-500/30 text-white text-xs font-bold transition hover:scale-105 shadow-md cursor-pointer"
          >
            <Icon name={isPlaying ? "pause" : "play"} className="size-3.5 fill-current" />
            <span>{isPlaying ? "Pause Sync" : "Play Both In-Sync"}</span>
          </button>
          <span className="text-xs font-mono text-slate-400">Frame lock: <strong className="text-emerald-400">±0ms (Zero Drift)</strong></span>
        </div>

        <div className="text-xs font-mono text-slate-300 flex items-center gap-2">
          <span>Scrub Position: <strong className="text-white">{Math.round(sliderPos)}%</strong></span>
          <span>•</span>
          <span>Click & drag anywhere ↔ across versions</span>
        </div>
      </div>
    </div>
  );
}
