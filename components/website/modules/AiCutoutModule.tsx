"use client";

import { useResolvedTheme } from "@/lib/editor/theme";

import { useState, useRef, useEffect, useCallback } from "react";
import { Icon } from "@/components/ui/Icon";
import { useSiteVideo } from "../media/useSiteVideo";
import { SITE_MEDIA } from "../media/manifest";

export function AiCutoutModule() {
  const theme = useResolvedTheme();
  const isLight = theme === "light";
  const [sliderPos, setSliderPos] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [activeTag, setActiveTag] = useState("Green Screen");
  const containerRef = useRef<HTMLDivElement>(null);

  const beforeVideoRef = useRef<HTMLVideoElement>(null);
  const afterVideoRef = useRef<HTMLVideoElement>(null);

  // Sync dual videos in exact frame lockstep
  const syncVideos = useCallback(() => {
    const b = beforeVideoRef.current;
    const a = afterVideoRef.current;
    if (b && a) {
      if (Math.abs(b.currentTime - a.currentTime) > 0.08) {
        a.currentTime = b.currentTime;
      }
    }
  }, []);

  // both takes follow the site's playback rules (load near the screen, pause offscreen, reduce motion)
  const before = useSiteVideo(beforeVideoRef);
  const after = useSiteVideo(afterVideoRef);
  const waiting = before.mode === "manual" && !before.userStarted;

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
      {/* Ambient Purple Light Halo */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(99, 85, 240, 0.12) 0%, transparent 70%)" }} />

      {/* Header Info - Floating Borderless Typography */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-800/40 px-2 py-0.5 rounded">
              01
            </span>
            <span className="text-xs font-mono tracking-wider text-purple-300 uppercase">
              AI Cutout & Green Screen
            </span>
          </div>

          <h3 className={`text-2xl sm:text-4xl font-extrabold tracking-tight ${isLight ? "text-slate-900" : "text-white"}`}>
            Remove backgrounds. Perfect overlays.
          </h3>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl mt-1">
            Turn studio green-screen footage into floating presenters. Drag slider to reveal transparent alpha cutout.
          </p>
        </div>

        {/* Live Status Indicator - Floating Pill */}
        <div className="flex items-center gap-2 text-xs font-mono text-cyan-300 bg-site-surface/90 px-3.5 py-2 rounded-full border border-purple-500/20 shrink-0 shadow-lg backdrop-blur-md">
          <span className="size-2 rounded-full bg-cyan-400 animate-ping" />
          <span>REAL-TIME ALPHA · ZERO DRIFT</span>
        </div>
      </div>

      {/* Hero Visual Viewport Stage - Floating Expansive 21:9 / 16:9 Screen */}
      <div
        ref={containerRef}
        tabIndex={0}
        role="slider"
        aria-label="Before Green Screen and After Transparent Cutout Splitter"
        aria-valuenow={Math.round(sliderPos)}
        aria-valuemin={0}
        aria-valuemax={100}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        className="relative aspect-video sm:aspect-[16/9] max-h-[580px] w-full rounded-3xl overflow-hidden cursor-ew-resize border border-white/10 select-none bg-black shadow-[0_25px_80px_rgba(0,0,0,0.9),0_0_60px_rgba(99, 85, 240,0.14)] touch-none group/stage focus:outline-none focus:ring-2 focus:ring-purple-400/40"
      >
        {/* Bottom Layer (After: Clean AI Keyed Live Video Composite) */}
        <div className="absolute inset-0 w-full h-full pointer-events-none select-none bg-black">
          <video
            ref={afterVideoRef}
            src={after.attach ? SITE_MEDIA.greenKeyed.src : undefined}
            poster={SITE_MEDIA.greenKeyed.poster}
            preload="none"
            muted
            loop
            playsInline
            aria-hidden="true"
            className="w-full h-full object-cover object-center pointer-events-none select-none"
          />

          {/* After Floating Badge */}
          <div className="absolute bottom-5 right-5 flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-cyan-500/40 text-xs font-mono text-cyan-300 shadow-xl pointer-events-none">
            <span className="size-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>After (Transparent)</span>
          </div>
        </div>

        {/* Top Layer (Before: Raw Green Screen Take) - Clipped via clipPath */}
        <div
          style={{ clipPath: `inset(0 calc(100% - ${sliderPos}%) 0 0)` }}
          className="absolute inset-0 w-full h-full pointer-events-none select-none"
        >
          <video
            ref={beforeVideoRef}
            src={before.attach ? SITE_MEDIA.greenTake.src : undefined}
            poster={SITE_MEDIA.greenTake.poster}
            preload="none"
            muted
            loop
            playsInline
            aria-hidden="true"
            onTimeUpdate={syncVideos}
            className="w-full h-full object-cover object-center pointer-events-none select-none"
          />

          {/* Before Floating Badge */}
          <div className="absolute bottom-5 left-5 flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-white/20 text-xs font-mono text-white shadow-xl pointer-events-none">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Before</span>
          </div>
        </div>

        {waiting && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              before.start();
              after.start();
            }}
            aria-label="Play preview: green screen before and after"
            className="absolute left-1/2 top-1/2 z-40 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/25 backdrop-blur-md transition hover:bg-black/70"
          >
            <Icon name="play" className="size-5 translate-x-px" />
          </button>
        )}

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
                ? "scale-125 bg-cyan-300 ring-4 ring-cyan-400/50"
                : "hover:scale-110 group-hover/stage:scale-105"
            }`}
          >
            ↔
          </div>
        </div>
      </div>

      {/* Interactive Tag Selector beneath stage - Floating Pills */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 mt-2">
        <div className="flex flex-wrap items-center gap-2">
          {["Green Screen", "AI Background Removal", "Alpha Video", "Overlay Ready"].map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-mono transition-all duration-300 ${
                activeTag === tag
                  ? "bg-purple-500/30 text-purple-200 border border-purple-400/50 font-bold shadow-md shadow-purple-500/20"
                  : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 border border-white/5"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        <div className="text-xs font-mono text-slate-400 flex items-center gap-2">
          <span>Split: <strong className="text-white">{Math.round(sliderPos)}%</strong></span>
          <span>•</span>
          <span>Drag anywhere ↔ to scrub alpha key</span>
        </div>
      </div>
    </div>
  );
}
