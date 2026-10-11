"use client";

import { useState, useRef, useEffect } from "react";
import { useResolvedTheme } from "@/lib/editor/theme";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

const DEMO_CLIPS = [
  { id: "tech-grid", title: "Cyber Grid 4K", src: "/templates/media/tech-grid.mp4", duration: 10, fps: 60, tag: "NLE Master" },
  { id: "globe-3d", title: "Hologram Globe", src: "/templates/media/globe-3d.mp4", duration: 10, fps: 60, tag: "3D Motion" },
  { id: "sports-arena", title: "Sports Arena Sweep", src: "/templates/media/sports-arena.mp4", duration: 8, fps: 60, tag: "Action 4K" },
  { id: "newsroom", title: "Live Broadcast Studio", src: "/templates/media/newsroom-modern.mp4", duration: 12, fps: 60, tag: "Broadcast" },
  { id: "podcast", title: "Podcast Multi-Cam", src: "/templates/media/podcast-studio.mp4", duration: 15, fps: 48, tag: "Talking Head" },
];

export function VideoEditorShowcaseSection() {
  const theme = useResolvedTheme();
  const isLight = theme === "light";
  const [selectedClip, setSelectedClip] = useState(DEMO_CLIPS[0]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(10);
  const [showHudOverlay, setShowHudOverlay] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [activeTab, setActiveTab] = useState<"media" | "layers" | "effects">("media");
  const [filterMode, setFilterMode] = useState<"normal" | "cyber" | "cinema">("cyber");

  const sectionRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  // IntersectionObserver: Pause video when scrolled out of view to save GPU and VTDecoder cycles
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    if (typeof window !== "undefined" && "IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        ([entry]) => {
          setIsVisible(entry.isIntersecting);
        },
        { threshold: 0.1 }
      );
      observer.observe(el);
      return () => observer.disconnect();
    } else {
      setIsVisible(true);
    }
  }, []);

  // Sync video play/pause: only decode when playing AND visible in viewport
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying && isVisible) {
      const p = v.play?.();
      if (p && typeof p.catch === "function") {
        p.catch(() => setIsPlaying(false));
      }
    } else {
      v.pause?.();
    }
  }, [isPlaying, isVisible, selectedClip]);

  const handleTimeUpdate = () => {
    if (!isVisible) return;
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      if (videoRef.current.duration && !isNaN(videoRef.current.duration)) {
        setDuration(videoRef.current.duration);
      }
    }
  };

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !videoRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const progress = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = progress * duration;
    videoRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 100);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div ref={sectionRef} className="w-full select-none">
      {/* Section Header */}
      <div className="text-center mb-10 sm:mb-14">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-400/25 text-cyan-300 text-xs font-mono uppercase tracking-widest mb-4">
          <span className="size-2 rounded-full bg-cyan-400 animate-pulse" />
          Live Web Studio Experience
        </div>
        <h2 className={`text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight ${isLight ? "text-slate-900" : "text-white"}`}>
          The Full NLE Video Editor. <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-purple-400 bg-clip-text text-transparent">
            Right Inside Your Browser.
          </span>
        </h2>
        <p className={`text-sm sm:text-base max-w-2xl mx-auto mt-4 leading-relaxed ${isLight ? "text-slate-600" : "text-slate-300"}`}>
          Test drive real multi-track video editing in real time. Scrub the 10-second 4K timeline, toggle HUD alpha overlays, apply GPU shaders, or open the full editor suite.
        </p>
      </div>

      {/* Luxury Obsidian Studio Editor Frame */}
      <div className="w-full rounded-2xl sm:rounded-3xl border border-white/10 bg-[#070410]/95 backdrop-blur-2xl shadow-[0_25px_80px_rgba(0,0,0,0.85),0_0_40px_rgba(45, 212, 191,0.15)] overflow-hidden flex flex-col">
        {/* 1. Top Studio Application Header Bar */}
        <div className="h-14 px-4 sm:px-6 bg-site-surface border-b border-white/10 flex items-center justify-between text-xs">
          {/* Left: Window Dots & Project Name */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-rose-500/80 border border-rose-400/40" />
              <span className="size-3 rounded-full bg-amber-500/80 border border-amber-400/40" />
              <span className="size-3 rounded-full bg-emerald-500/80 border border-emerald-400/40" />
            </div>

            <div className="h-4 w-px bg-white/10 hidden sm:block" />

            {/* Project Breadcrumb */}
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-white tracking-tight flex items-center gap-1.5">
                <svg className="size-3.5 text-cyan-400 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                  <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
                  <path d="M2 9h20M7 4l-2 5M12 4l-2 5" />
                </svg>
                {selectedClip.title}.vdo
              </span>
              <span className="hidden md:inline px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono text-xs border border-purple-400/30">
                4K 60FPS • WebGPU
              </span>
            </div>
          </div>

          {/* Center: Live Timecode Display */}
          <div className="flex items-center gap-2 bg-black/60 px-3 py-1 rounded-lg border border-white/10 font-mono text-cyan-300 font-bold">
            <span className="size-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>{formatTime(currentTime)}</span>
            <span className="text-slate-500">/</span>
            <span className="text-slate-400">{formatTime(duration)}</span>
          </div>

          {/* Right: Quick Studio Tools & Launch Editor CTA */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setShowHudOverlay(!showHudOverlay)}
              className={`px-2.5 py-1 rounded-lg font-mono text-[11px] border transition flex items-center gap-1.5 ${
                showHudOverlay
                  ? "bg-cyan-500/15 border-cyan-400 text-cyan-300"
                  : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
              }`}
              title="Toggle HUD Alpha Tracking Overlay"
            >
              <span>HUD Layer</span>
              <span className="text-xs">{showHudOverlay ? "ON" : "OFF"}</span>
            </button>

            <Link
              href="/editor"
              className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white font-bold tracking-tight shadow-md hover:scale-105 transition flex items-center gap-1.5"
            >
              <span>Open in Studio</span>
              <span className="text-cyan-200">↗</span>
            </Link>
          </div>
        </div>

        {/* 2. Middle Editor Area: Left Toolbar, Center Preview, Right Inspector */}
        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[380px] sm:min-h-[440px] bg-[#05020c]">
          {/* 2A. Left Sidebar: Clip Switcher & Assets (3 cols on lg) */}
          <div className="lg:col-span-3 border-b lg:border-b-0 lg:border-r border-white/10 p-3 sm:p-4 flex flex-col justify-between bg-site-bg/90">
            <div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-400 mb-3 px-1">
                <span className="uppercase tracking-wider font-mono text-xs">Project Assets</span>
                <span className="text-xs text-cyan-400 font-mono">2 Media Clips</span>
              </div>

              {/* Clip List */}
              <div className="space-y-2">
                {DEMO_CLIPS.map((clip) => (
                  <button
                    key={clip.id}
                    onClick={() => {
                      setSelectedClip(clip);
                      setCurrentTime(0);
                      if (videoRef.current) {
                        videoRef.current.currentTime = 0;
                      }
                    }}
                    className={`w-full p-2.5 rounded-xl border text-left transition flex items-center gap-3 ${
                      selectedClip.id === clip.id
                        ? "bg-purple-900/40 border-cyan-400 shadow-[0_0_15px_rgba(45, 212, 191,0.25)]"
                        : "bg-white/5 border-white/10 hover:border-white/20 text-slate-400 hover:text-white"
                    }`}
                  >
                    <div className="size-10 rounded-lg overflow-hidden bg-black shrink-0 relative border border-white/20">
                      <div className="w-full h-full bg-gradient-to-tr from-cyan-500/20 to-purple-500/20 flex items-center justify-center font-bold text-xs text-cyan-300">
                        ▶
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-white truncate">{clip.title}</div>
                      <div className="text-xs font-mono text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <span>{clip.duration}s</span>
                        <span>•</span>
                        <span className="text-cyan-400">{clip.tag}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Shader Filter Options */}
              <div className="mt-5 pt-4 border-t border-white/10">
                <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2 px-1">
                  GPU Grade Shaders
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-xs font-medium">
                  {(["normal", "cyber", "cinema"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setFilterMode(mode)}
                      className={`py-1.5 px-2 rounded-lg border text-center font-mono text-xs capitalize transition ${
                        filterMode === mode
                          ? "bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold"
                          : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick Status Pill */}
            <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-500/20 mt-4 text-[11px] text-slate-300">
              <div className="font-bold text-white flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                <span>Zero Render Latency</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                WebGL2 hardware shaders running directly in Chrome/Safari GPU canvas.
              </p>
            </div>
          </div>

          {/* 2B. Center Stage: HTML5 Video Canvas (6 cols on lg) */}
          <div className="lg:col-span-6 p-4 sm:p-6 flex flex-col items-center justify-center relative bg-black/60 overflow-hidden">
            {/* 16:9 Video Canvas Frame */}
            <div className="relative w-full aspect-video rounded-xl sm:rounded-2xl overflow-hidden border border-white/20 shadow-[0_15px_45px_rgba(0,0,0,0.9)] group">
              <video
                ref={videoRef}
                src={selectedClip.src}
                poster={isVisible || isPlaying ? `/templates/thumbs/${selectedClip.src.split("/").pop()!.replace(".mp4", ".jpg")}` : undefined}
                preload="none"
                aria-label={`${selectedClip.title} preview`}
                playsInline
                muted
                loop
                onTimeUpdate={handleTimeUpdate}
                className={`w-full h-full object-cover transition-all duration-300 ${
                  filterMode === "cyber"
                    ? "contrast-125 saturate-150 hue-rotate-15"
                    : filterMode === "cinema"
                    ? "contrast-110 brightness-95 saturate-90"
                    : ""
                }`}
              />

              {/* HUD Motion Tracking Overlay Box (Toggable) */}
              {showHudOverlay && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  {/* Center Scanning Box */}
                  <div
                    className="relative size-32 sm:size-40 border-2 border-cyan-400/80 rounded-lg flex flex-col justify-between p-2 shadow-[0_0_25px_rgba(45, 212, 191,0.4)] transition-transform duration-500"
                    style={{
                      transform: `translate3d(${Math.sin(currentTime * 2) * 20}px, ${Math.cos(currentTime * 2) * 12}px, 0)`,
                    }}
                  >
                    {/* Corner Reticles */}
                    <div className="absolute -top-1.5 -left-1.5 size-3 border-t-2 border-l-2 border-cyan-300" />
                    <div className="absolute -top-1.5 -right-1.5 size-3 border-t-2 border-r-2 border-cyan-300" />
                    <div className="absolute -bottom-1.5 -left-1.5 size-3 border-b-2 border-l-2 border-cyan-300" />
                    <div className="absolute -bottom-1.5 -right-1.5 size-3 border-b-2 border-r-2 border-cyan-300" />

                    <div className="flex items-center justify-between text-xs font-mono text-cyan-300 font-bold bg-black/60 px-1.5 py-0.5 rounded">
                      <span>TRACK-VIPLAY</span>
                      <span>99.9%</span>
                    </div>

                    <div className="text-xs font-mono text-cyan-200 self-center bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-400/40">
                      ALPHA MATRIX ACTIVE
                    </div>

                    <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                      <span>X: {Math.round(180 + Math.sin(currentTime * 2) * 40)}</span>
                      <span>Y: {Math.round(120 + Math.cos(currentTime * 2) * 30)}</span>
                    </div>
                  </div>

                  {/* Crosshair Horizon Line */}
                  <div className="absolute inset-x-8 top-1/2 h-px bg-cyan-400/20" />
                  <div className="absolute inset-y-8 left-1/2 w-px bg-cyan-400/20" />
                </div>
              )}

              {/* Watermark Specs Badge */}
              <div className="absolute top-3 left-3 px-2 py-1 rounded bg-black/75 backdrop-blur-md border border-white/10 text-xs font-mono text-slate-300 flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span>4K DCI-P3 • 60 FPS</span>
              </div>

              {/* Center Play/Pause Clickable Overlay */}
              <button
                type="button"
                onClick={togglePlay}
                className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/40 transition opacity-0 group-hover:opacity-100 cursor-pointer"
                aria-label={isPlaying ? "Pause video" : "Play video"}
              >
                <div className="size-14 rounded-full bg-cyan-400 text-slate-950 flex items-center justify-center shadow-[0_0_25px_#2dd4bf] scale-95 group-hover:scale-105 transition">
                  <Icon name={isPlaying ? "pause" : "play"} className="size-6 ml-0.5 fill-current" />
                </div>
              </button>
            </div>
          </div>

          {/* 2C. Right Sidebar: Inspector Properties (3 cols on lg) */}
          <div className="lg:col-span-3 border-t lg:border-t-0 lg:border-l border-white/10 p-3 sm:p-4 bg-site-bg/90 flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold text-slate-400 mb-3 px-1 uppercase tracking-wider font-mono text-xs">
                Clip Inspector
              </div>

              {/* Properties Grid */}
              <div className="space-y-2.5 text-xs">
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-xs font-mono text-slate-400">Resolution</div>
                  <div className="font-mono font-bold text-white mt-0.5">3840 × 2160 (4K UHD)</div>
                </div>

                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-xs font-mono text-slate-400">Codec / Container</div>
                  <div className="font-mono font-bold text-cyan-300 mt-0.5">H.265 / HEVC + Alpha WebM</div>
                </div>

                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-xs font-mono text-slate-400">Color Profile</div>
                  <div className="font-mono font-bold text-purple-300 mt-0.5">HDR10 / Rec.2020</div>
                </div>

                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <div className="text-xs font-mono text-slate-400">GPU Acceleration</div>
                  <div className="text-xs font-mono font-bold text-emerald-400">ACTIVE (0ms)</div>
                </div>
              </div>
            </div>

            {/* Audio Meter Visualizer */}
            <div className="mt-4 pt-3 border-t border-white/10">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-1.5 px-1">
                <span>Output Levels</span>
                <span className="text-emerald-400">-3.2 dB</span>
              </div>
              <div className="h-3 rounded-full bg-black/80 p-0.5 border border-white/10 flex gap-0.5 overflow-hidden">
                {[...Array(20)].map((_, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-sm transition-all duration-150 ${
                      isPlaying && i < Math.floor(14 + Math.sin(currentTime * 8) * 5)
                        ? i > 16
                          ? "bg-rose-500"
                          : i > 12
                          ? "bg-amber-400"
                          : "bg-emerald-400"
                        : "bg-white/10"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 3. Bottom Multi-Track NLE Timeline Scrubber (10-Second Showcase) */}
        <div className="border-t border-white/10 bg-[#070312] p-4 sm:p-5">
          {/* Transport Controls Bar */}
          <div className="flex items-center justify-between mb-3 text-xs">
            <div className="flex items-center gap-3">
              {/* Play / Pause button */}
              <button
                type="button"
                onClick={togglePlay}
                className="size-8 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center justify-center shadow-[0_0_15px_rgba(45, 212, 191,0.4)] transition"
                aria-label={isPlaying ? "Pause timeline" : "Play timeline"}
              >
                <Icon name={isPlaying ? "pause" : "play"} className="size-4 ml-0.5 fill-current" />
              </button>

              {/* Rewind to 0 */}
              <button
                type="button"
                onClick={() => {
                  if (videoRef.current) videoRef.current.currentTime = 0;
                  setCurrentTime(0);
                }}
                className="size-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center border border-white/10 transition"
                title="Restart from 0:00"
              >
                ⏮
              </button>

              {/* Timecode badge */}
              <span className="font-mono text-xs font-bold text-white bg-black/60 px-2.5 py-1 rounded border border-white/10">
                {formatTime(currentTime)}
              </span>
            </div>

            {/* Playback Speed selector */}
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <span className="text-slate-400 hidden sm:inline">Speed:</span>
              {[1, 1.5, 2].map((speed) => (
                <button
                  key={speed}
                  onClick={() => {
                    setPlaybackRate(speed);
                    if (videoRef.current) videoRef.current.playbackRate = speed;
                  }}
                  className={`px-2 py-0.5 rounded border transition ${
                    playbackRate === speed
                      ? "bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold"
                      : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>

          {/* Timeline Multi-Track Container */}
          <div
            ref={timelineRef}
            onClick={handleTimelineClick}
            className="relative w-full rounded-xl bg-[#030108] border border-white/15 p-2 sm:p-3 cursor-pointer overflow-hidden space-y-2"
          >
            {/* Laser Vertical Playhead */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-gradient-to-b from-cyan-400 via-sky-400 to-purple-400 z-30 pointer-events-none shadow-[0_0_12px_#2dd4bf]"
              style={{ left: `${progressPercent}%` }}
            >
              <div className="absolute -top-1 -left-1.5 size-3.5 rounded-full bg-cyan-400 border-2 border-black shadow-[0_0_10px_#2dd4bf]" />
            </div>

            {/* Timeline Ruler Marks: 0s to 10s */}
            <div className="flex justify-between font-mono text-xs text-slate-500 pb-1 border-b border-white/10 px-1">
              <span>00:00</span>
              <span>00:02</span>
              <span>00:04</span>
              <span>00:06</span>
              <span>00:08</span>
              <span>00:10 (Max)</span>
            </div>

            {/* Track 1: V1 - Master 4K Video Strip */}
            <div className="h-10 sm:h-12 rounded-lg bg-[#0e0724] border border-cyan-500/30 flex items-center px-2 relative overflow-hidden group/track">
              <span className="text-xs font-mono font-bold text-cyan-300 shrink-0 mr-3 z-10 bg-black/60 px-1.5 py-0.5 rounded">
                V1 • 4K Master
              </span>
              <div className="flex-1 h-full flex items-center gap-1 opacity-70">
                {[...Array(12)].map((_, i) => (
                  <div key={i} className="flex-1 h-8 rounded bg-gradient-to-r from-purple-900/60 to-cyan-900/60 border border-white/10 flex items-center justify-center text-[7px] font-mono text-slate-400">
                    {i * 12}f
                  </div>
                ))}
              </div>
            </div>

            {/* Track 2: V2 - Alpha Cutout & Tracking HUD */}
            <div className="h-8 rounded-lg bg-[#071329] border border-sky-500/30 flex items-center px-2 relative overflow-hidden">
              <span className="text-xs font-mono font-bold text-sky-300 shrink-0 mr-3 z-10 bg-black/60 px-1.5 py-0.5 rounded">
                V2 • Alpha HUD
              </span>
              <div className="flex-1 h-4 rounded bg-sky-500/20 border border-dashed border-sky-400/40 relative">
                <div
                  className="absolute top-0 bottom-0 bg-cyan-400/40 rounded transition-all"
                  style={{ width: "85%", left: "5%" }}
                />
              </div>
            </div>

            {/* Track 3: A1 - Synthwave Audio Waveform */}
            <div className="h-8 rounded-lg bg-[#180424] border border-fuchsia-500/30 flex items-center px-2 relative overflow-hidden">
              <span className="text-xs font-mono font-bold text-fuchsia-300 shrink-0 mr-3 z-10 bg-black/60 px-1.5 py-0.5 rounded">
                A1 • Master Audio
              </span>
              <div className="flex-1 h-full flex items-center gap-0.5 opacity-80">
                {[40, 70, 95, 30, 80, 50, 90, 60, 100, 45, 85, 35, 75, 95, 60, 40, 80, 100, 65, 45, 90, 75, 35, 70, 95, 50, 85, 60, 40].map((h, i) => (
                  <div
                    key={i}
                    style={{ height: `${h}%` }}
                    className="flex-1 bg-gradient-to-t from-fuchsia-500 to-purple-400 rounded-full"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
