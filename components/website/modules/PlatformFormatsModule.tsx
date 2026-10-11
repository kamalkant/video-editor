"use client";

import { useState, useRef } from "react";
import { useResolvedTheme } from "@/lib/editor/theme";
import { Icon } from "@/components/ui/Icon";
import { SiteVideo } from "../media/SiteVideo";
import { SITE_MEDIA, type SiteMediaKey } from "../media/manifest";

interface FormatConfig {
  id: string;
  name: string;
  ratio: string;
  platform: string;
  dims: string;
  bitrate: string;
  badge: string;
  media: SiteMediaKey;
  /** the frame's shape in the preview */
  aspect: string;
}

const FORMATS: FormatConfig[] = [
  {
    id: "yt",
    name: "YouTube & Cine",
    ratio: "16:9",
    platform: "Landscape Ultra HD",
    dims: "3840 × 2160 (4K)",
    bitrate: "45 Mbps · AV1 / H.265",
    badge: "Cinema & Desktop",
    media: "cyberIntro",
    aspect: "16 / 9",
  },
  {
    id: "shorts",
    name: "Shorts & Reels",
    ratio: "9:16",
    platform: "TikTok, IG & Shorts",
    dims: "2160 × 3840 (Vertical)",
    bitrate: "28 Mbps · Optimized",
    badge: "Mobile Viral",
    media: "neonWalk",
    aspect: "9 / 16",
  },
  {
    id: "square",
    name: "Square Feed",
    ratio: "1:1",
    platform: "Instagram & LinkedIn",
    dims: "2160 × 2160 (Square)",
    bitrate: "24 Mbps · Square",
    badge: "Social Feeds",
    media: "podcast",
    aspect: "1 / 1",
  },
  {
    id: "cinema",
    name: "Anamorphic Scope",
    ratio: "4K",
    platform: "DCI Scope 2.39:1",
    dims: "4096 × 1714 (Cinema)",
    bitrate: "80 Mbps · ProRes",
    badge: "Theatrical Master",
    media: "surf",
    aspect: "2.39 / 1",
  },
  {
    id: "alpha",
    name: "Transparent Web",
    ratio: "Alpha",
    platform: "Web & Spatial Video",
    dims: "3840 × 2160 (RGBA)",
    bitrate: "VP9 / ProRes 4444",
    badge: "Floating Video",
    media: "virtualPresenter",
    aspect: "16 / 9",
  },
];

export function PlatformFormatsModule() {
  const theme = useResolvedTheme();
  const isLight = theme === "light";
  const [selectedFormat, setSelectedFormat] = useState<FormatConfig>(FORMATS[0]);
  const containerRef = useRef<HTMLDivElement>(null);


  return (
    <div ref={containerRef} className="w-full relative transition-all duration-500 group">
      {/* Ambient Cyan Light Halo */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(20, 184, 166, 0.12) 0%, transparent 70%)" }} />

      {/* Header Info - Floating Borderless Typography */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-800/40 px-2 py-0.5 rounded">
              06
            </span>
            <span className="text-xs font-mono tracking-wider text-purple-300 uppercase">
              Format Matrix
            </span>
          </div>

          <h3 className={`text-2xl sm:text-4xl font-extrabold tracking-tight ${isLight ? "text-slate-900" : "text-white"}`}>
            Any Format. Any Platform.
          </h3>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl mt-1">
            Export once, master everywhere. Automatic reframing, lossless bitrate adaptation, and transparent web embeds.
          </p>
        </div>

        {/* Live Active Format Badge */}
        <div className="flex items-center gap-2 text-xs font-mono text-cyan-300 bg-site-surface/90 px-3.5 py-2 rounded-full border border-purple-500/20 shrink-0 shadow-lg backdrop-blur-md">
          <span className="size-2 rounded-full bg-cyan-400 animate-ping" />
          <span>OUTPUT: {selectedFormat.name} ({selectedFormat.ratio})</span>
        </div>
      </div>

      {/* Grand Interactive Format Selector - Floating Borderless Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        {FORMATS.map((fmt) => {
          const isSelected = selectedFormat.id === fmt.id;
          return (
            <button
              type="button"
              key={fmt.id}
              onClick={() => setSelectedFormat(fmt)}
              aria-pressed={isSelected}
              className={`p-4 rounded-3xl text-left transition-all duration-300 flex flex-col justify-between select-none ${
                isSelected
                  ? "bg-site-raised ring-2 ring-purple-400 shadow-[0_15px_40px_-10px_rgba(124,108,250,0.45)]"
                  : "bg-site-surface/70 ring-1 ring-site-line hover:ring-purple-400/40 hover:bg-site-raised"
              }`}
            >
              <div className="w-full">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-lg font-bold font-mono text-site-ink tracking-tight">{fmt.ratio}</span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-site-bg/70 text-site-muted ring-1 ring-site-line">{fmt.badge}</span>
                </div>

                {/* the format's own shape, on a dark (or, for alpha, checkered) board */}
                <div className={`aspect-[4/3] rounded-2xl overflow-hidden mb-3 relative flex items-center justify-center ${fmt.id === "alpha" ? "bg-checker-dark" : "bg-black/70"}`}>
                  <div className="relative max-h-full max-w-full overflow-hidden rounded-lg" style={{ aspectRatio: fmt.aspect, height: fmt.aspect === "9 / 16" || fmt.aspect === "1 / 1" ? "100%" : undefined, width: fmt.aspect === "9 / 16" || fmt.aspect === "1 / 1" ? undefined : "100%" }}>
                    {isSelected ? (
                      <SiteVideo media={fmt.media} label={`${fmt.name} preview`} showPlayButton={false} />
                    ) : (
                      <img src={SITE_MEDIA[fmt.media].poster} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
                    )}
                  </div>
                </div>
              </div>

              <div>
                <span className="text-xs font-bold text-white block mb-0.5">{fmt.name}</span>
                <span className="text-xs text-slate-400 font-mono block">{fmt.dims}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Format Inspector Readout - Floating borderless */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-white/10 text-xs font-mono text-slate-400">
        <div className="flex items-center gap-3">
          <span>Active Preset: <strong className="text-white">{selectedFormat.name}</strong></span>
          <span>•</span>
          <span>Target Platform: <strong className="text-cyan-400">{selectedFormat.platform}</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <span>Bitrate Profile: <strong className="text-emerald-400">{selectedFormat.bitrate}</strong></span>
        </div>
      </div>
    </div>
  );
}
