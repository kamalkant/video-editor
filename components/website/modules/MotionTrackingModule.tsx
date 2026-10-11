"use client";

import { useResolvedTheme } from "@/lib/editor/theme";

import { useState } from "react";
import { SiteVideo } from "../media/SiteVideo";
import { Icon } from "@/components/ui/Icon";

export function MotionTrackingModule() {
  const theme = useResolvedTheme();
  const isLight = theme === "light";
  const [blurActive, setBlurActive] = useState(true);

  return (
    <div className="w-full relative transition-all duration-500 group">
      {/* Ambient Emerald Light Halo */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(16, 185, 129, 0.12) 0%, transparent 70%)" }} />

      {/* Header Info - Floating Borderless Typography */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded">
              03
            </span>
            <span className="text-xs font-mono tracking-wider text-purple-300 uppercase">
              Motion Tracking
            </span>
          </div>

          <h3 className={`text-2xl sm:text-4xl font-extrabold tracking-tight ${isLight ? "text-slate-900" : "text-white"}`}>
            Track objects, blur areas
          </h3>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl mt-1">
            Automated neural object tracking. Attach text, graphics, or apply privacy blur to moving license plates and faces in real time.
          </p>
        </div>

        {/* Live Action Controls - Floating Pill */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setBlurActive(!blurActive)}
            className={`px-4 py-2 rounded-full text-xs font-bold font-mono transition-all duration-300 shadow-md cursor-pointer ${
              blurActive
                ? "bg-emerald-500 text-slate-950 shadow-emerald-500/30 hover:bg-emerald-400 hover:scale-105"
                : "bg-white/10 text-slate-400 hover:text-white border border-white/10"
            }`}
          >
            {blurActive ? "Blur Active" : "Disabled"}
          </button>
        </div>
      </div>

      {/* Hero Visual Viewport Stage - Floating Expansive 21:9 / 16:9 Screen */}
      <div className="relative aspect-video sm:aspect-[16/9] w-full rounded-3xl overflow-hidden border border-white/10 bg-black select-none shadow-[0_25px_80px_rgba(0,0,0,0.9),0_0_60px_rgba(16,185,129,0.12)]">
        {/* Real Live Action Video Stream */}
        <SiteVideo media="demoTracking" label="Motion tracking demo: a tracked car, a face blurred as it moves, and a drone followed in flight" className="absolute inset-0 w-full h-full object-cover filter brightness-95 select-none pointer-events-none" />

        {/* Tracking Metadata HUD Overlay */}
        <div className="absolute top-5 left-5 p-3 rounded-2xl bg-black/70 backdrop-blur-md border border-white/10 text-xs font-mono text-white shadow-xl">
          <div className="flex items-center gap-2 mb-1">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-bold">Privacy Blur Tracking</span>
          </div>
          <span className="text-xs text-slate-400">Optical-flow tracking · blur follows the face</span>
        </div>
      </div>

      {/* Status Bar beneath stage */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 mt-2 text-xs font-mono text-slate-400">
        <div className="flex items-center gap-3">
          <span>Target: <strong className="text-white">Action Sports Arena</strong></span>
          <span>•</span>
          <span>Tracking Mode: <strong className="text-emerald-400">Optical Flow + 3D Bounding</strong></span>
        </div>
        <span>Click 'Blur Active' button to toggle real-time privacy mosaic</span>
      </div>
    </div>
  );
}
