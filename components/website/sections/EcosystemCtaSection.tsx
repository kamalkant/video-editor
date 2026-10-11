"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { useResolvedTheme } from "@/lib/editor/theme";

export function EcosystemCtaSection() {
  const theme = useResolvedTheme();
  const isLight = theme === "light";

  return (
    <div className="relative w-full px-4 sm:px-8 lg:px-12 py-16 sm:py-24 max-w-7xl mx-auto select-none">
      <div className="flex flex-col items-center text-center space-y-12">
        {/* Top Pitch */}
        <div className="space-y-4 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-800/60 text-cyan-400 text-xs font-mono">
            ViPlay ECOSYSTEM
          </div>

          <h2 className={`text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight ${
            isLight ? "text-slate-900" : "text-white"
          }`}>
            Your Videos Deserve a <br />
            <span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-purple-400 bg-clip-text text-transparent">
              Powerful Local-First Studio.
            </span>
          </h2>

          <p className={`text-base leading-relaxed ${
            isLight ? "text-slate-600" : "text-slate-400"
          }`}>
            Experience real-time alpha video playback, 4K scrubbing, and full NLE studio composition right in your browser.
          </p>
        </div>

        {/* 2 Ecosystem Cards (Player vs Studio) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl text-left">
          {/* Card 1: ViPlay Timeline Preview */}
          <div className={`p-8 rounded-3xl border transition-all duration-300 flex flex-col justify-between group shadow-xl ${
            isLight
              ? "bg-white/95 border-cyan-300/80 hover:border-cyan-500 hover:shadow-cyan-500/20 shadow-cyan-900/5"
              : "bg-slate-900/60 border-cyan-500/30 hover:bg-slate-900/90 hover:border-cyan-500/60 shadow-[0_15px_40px_rgba(0,0,0,0.6)]"
          }`}>
            <div className="space-y-3">
              <div className="size-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                <Icon name="play" className="size-5" />
              </div>
              <h3 className={`text-xl font-bold ${isLight ? "text-slate-900" : "text-white"}`}>
                Live Timeline Preview
              </h3>
              <p className={`text-xs leading-relaxed ${isLight ? "text-slate-600" : "text-slate-400"}`}>
                Built-in real-time media engine with native VP9/ProRes alpha transparency, frame-accurate stepping, and GPU-accelerated shaders.
              </p>
              <ul className={`text-xs space-y-1.5 pt-2 ${isLight ? "text-slate-700" : "text-slate-300"}`}>
                <li className="flex items-center gap-2">✓ Frame-accurate scrubbing and playback</li>
                <li className="flex items-center gap-2">✓ Transparent alpha checkerboard backdrops</li>
                <li className="flex items-center gap-2">✓ Social media safe area guides</li>
              </ul>
            </div>
            <Link
              href="/editor"
              className="site-btn-ghost mt-6 flex min-h-11 w-full items-center justify-center rounded-xl text-sm font-semibold"
            >
              Open Studio Editor →
            </Link>
          </div>

          {/* Card 2: ViPlay Studio Editor */}
          <div className={`p-8 rounded-3xl border transition-all duration-300 flex flex-col justify-between group shadow-xl ${
            isLight
              ? "bg-white/95 border-purple-300/80 hover:border-purple-500 hover:shadow-purple-500/20 shadow-purple-900/5"
              : "bg-slate-900/60 border-purple-500/30 hover:bg-slate-900/90 hover:border-purple-500/60 shadow-[0_15px_40px_rgba(0,0,0,0.6)]"
          }`}>
            <div className="space-y-3">
              <div className="size-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                <Icon name="edit" className="size-5" />
              </div>
              <h3 className={`text-xl font-bold ${isLight ? "text-slate-900" : "text-white"}`}>
                ViPlay Studio Editor
              </h3>
              <p className={`text-xs leading-relaxed ${isLight ? "text-slate-600" : "text-slate-400"}`}>
                Full-featured local-first non-linear video editor with multi-layer timeline, smart dialogue ducking, and motion tracking.
              </p>
              <ul className={`text-xs space-y-1.5 pt-2 ${isLight ? "text-slate-700" : "text-slate-300"}`}>
                <li className="flex items-center gap-2">✓ Multi-track video, overlay & audio timeline</li>
                <li className="flex items-center gap-2">✓ Smart automatic audio ducking</li>
                <li className="flex items-center gap-2">✓ Fast hardware export on Mac (Apple VideoToolbox)</li>
              </ul>
            </div>
            <Link
              href="/editor"
              className="site-btn-primary mt-6 flex min-h-11 w-full items-center justify-center rounded-xl text-sm font-semibold"
            >
              Open ViPlay Studio →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
