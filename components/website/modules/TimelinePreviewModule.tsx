"use client";

import { useResolvedTheme } from "@/lib/editor/theme";

import { useState, useRef } from "react";
import { Icon } from "@/components/ui/Icon";
import { useSiteVideo } from "../media/useSiteVideo";
import { SITE_MEDIA } from "../media/manifest";

const AUDIO_WAVEFORM_HEIGHTS = [50, 68, 82, 92, 95, 91, 80, 65, 47, 30, 16, 7, 5, 10, 22, 37, 55, 72, 86, 94, 95, 88, 76, 60, 42, 26, 13, 6, 6, 13, 26, 43, 60, 77, 89, 95, 93, 85, 72, 55, 37, 21, 10, 5, 7, 16, 30, 48];
const MUSIC_WAVEFORM_HEIGHTS = [75, 69, 53, 32, 14, 5, 9, 23, 43, 62, 74, 73, 61, 42, 22, 8, 6, 15, 33, 54, 70, 75, 68, 52, 31, 13, 5, 9, 24, 44, 63, 74, 73, 60, 41, 21, 8, 6, 16, 34, 55, 70, 75, 67, 50, 30, 13, 5];

export function TimelinePreviewModule() {
  const theme = useResolvedTheme();
  const isLight = theme === "light";
  const [playheadTime, setPlayheadTime] = useState(1.5);
  const [isPlaying, setIsPlaying] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const totalDuration = 4.0; // 4 seconds video loop

  // the site's playback rules (loads near the screen, pauses offscreen, waits for a click with "reduce motion")
  const video = useSiteVideo(videoRef, { paused: !isPlaying });

  const togglePlayback = () => {
    const next = !isPlaying;
    setIsPlaying(next);
    if (next) video.start(); // (also a click to play when motion is reduced)
  };

  const handleTimelineScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = Number((pct * totalDuration).toFixed(2));
    setPlayheadTime(target);
    if (videoRef.current) {
      videoRef.current.currentTime = target;
    }
  };

  return (
    <div ref={containerRef} className="w-full relative transition-all duration-500 group">
      {/* Ambient Blue Light Halo */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(37, 99, 235, 0.12) 0%, transparent 70%)" }} />

      {/* Header Info - Floating Borderless Typography */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono font-bold text-blue-400 bg-blue-950/60 border border-blue-800/40 px-2 py-0.5 rounded">
              05
            </span>
            <span className="text-xs font-mono tracking-wider text-purple-300 uppercase">
              Timeline Preview
            </span>
          </div>

          <h3 className={`text-2xl sm:text-4xl font-extrabold tracking-tight ${isLight ? "text-slate-900" : "text-white"}`}>
            Frame-by-frame preview with audio sync
          </h3>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl mt-1">
            Zero-latency multi-track timeline. Scrub smoothly with visual waveforms, magnetic snapping, and instantaneous frame updates.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={togglePlayback}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/40 text-blue-200 text-xs font-mono font-bold transition hover:scale-105 shadow-md cursor-pointer"
          >
            <Icon name={isPlaying ? "pause" : "play"} className="size-3.5 fill-current" />
            <span>{isPlaying ? "Pause Scrub" : "Auto Scrub"}</span>
          </button>
        </div>
      </div>

      {/* Hero Visual Viewport Stage - Floating Expansive Timeline Canvas */}
      <div className="w-full rounded-3xl overflow-hidden border border-white/10 bg-black select-none shadow-[0_25px_80px_rgba(0,0,0,0.9),0_0_60px_rgba(59,130,246,0.12)] p-4 sm:p-6">
        {/* Top Live Video Monitor Preview */}
        <div className="relative aspect-[21/9] w-full rounded-2xl overflow-hidden border border-white/10 bg-[#0a0518] mb-6">
          <video
            ref={videoRef}
            src={video.attach ? SITE_MEDIA.techGridLoop.src : undefined}
            poster={SITE_MEDIA.techGridLoop.poster}
            preload="none"
            aria-hidden="true"
            muted
            loop
            playsInline
            onTimeUpdate={(e) => {
              setPlayheadTime(Number(e.currentTarget.currentTime.toFixed(2)));
            }}
            className="w-full h-full object-cover filter brightness-95 select-none pointer-events-none"
          />

          {/* Timecode Overlay */}
          <div className="absolute top-4 left-4 px-3.5 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-white/10 font-mono text-xs text-white flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>00:00:0{Math.floor(playheadTime)}:{Math.floor((playheadTime % 1) * 30).toString().padStart(2, "0")}</span>
          </div>

          {/* Resolution Badge */}
          <div className="absolute top-4 right-4 px-3 py-1 rounded-full bg-black/80 backdrop-blur-md border border-blue-500/30 font-mono text-xs text-blue-300">
            3840 × 2160 · ProRes 422 HQ · 60 FPS
          </div>
        </div>

        {/* Multi-Track Interactive Timeline */}
        <div
          onClick={handleTimelineScrub}
          className="space-y-2 relative pt-4 border-t border-white/10 cursor-pointer group/tracks"
          title="Click to scrub playhead"
        >
          {/* Vertical Playhead Cursor */}
          <div
            style={{ left: `${(playheadTime / totalDuration) * 100}%` }}
            className="absolute top-0 bottom-0 w-0.5 bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.9)] z-20 pointer-events-none transition-all duration-75 will-change-[left]"
          >
            <div className="size-3 bg-rose-500 rounded-sm -translate-x-1.25 shadow-md" />
          </div>

          {/* Track 1: Video Track */}
          <div className="flex items-center gap-3">
            <span className="w-14 sm:w-16 text-xs font-mono font-bold text-blue-400 uppercase">
              Video
            </span>
            <div className="flex-1 h-10 rounded-xl bg-blue-950/40 border border-blue-500/30 relative overflow-hidden flex items-center px-3">
              <span className="text-xs font-mono text-blue-300 z-10">TECH_NLE_MASTER_4K.MP4 [00:00 - 00:04]</span>
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/30 to-purple-600/30 opacity-70" />
            </div>
          </div>

          {/* Track 2: Dialogue Audio Track */}
          <div className="flex items-center gap-3">
            <span className="w-14 sm:w-16 text-xs font-mono font-bold text-emerald-400 uppercase">
              Audio
            </span>
            <div className="flex-1 h-10 rounded-xl bg-emerald-950/40 border border-emerald-500/30 relative overflow-hidden flex items-center px-3">
              <div className="absolute inset-x-2 inset-y-1.5 flex items-center gap-1 opacity-60">
                {AUDIO_WAVEFORM_HEIGHTS.map((h, i) => (
                  <div
                    key={i}
                    style={{ height: `${h}%` }}
                    className="flex-1 bg-emerald-400 rounded-full"
                  />
                ))}
              </div>
              <span className="text-xs font-mono text-emerald-300 z-10">BOOM_MIC_01.WAV (48kHz 24-bit)</span>
            </div>
          </div>

          {/* Track 3: Soundtrack / Music */}
          <div className="flex items-center gap-3">
            <span className="w-14 sm:w-16 text-xs font-mono font-bold text-amber-400 uppercase">
              Music
            </span>
            <div className="flex-1 h-10 rounded-xl bg-amber-950/40 border border-amber-500/30 relative overflow-hidden flex items-center px-3">
              <div className="absolute inset-x-2 inset-y-1.5 flex items-center gap-1 opacity-50">
                {MUSIC_WAVEFORM_HEIGHTS.map((h, i) => (
                  <div
                    key={i}
                    style={{ height: `${h}%` }}
                    className="flex-1 bg-amber-400 rounded-full"
                  />
                ))}
              </div>
              <span className="text-xs font-mono text-amber-300 z-10">CINEMATIC_ORCHESTRAL_CUE.FLAC</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
