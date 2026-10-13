"use client";

import { useState } from "react";
import Link from "next/link";
import { useResolvedTheme } from "@/lib/editor/theme";
import { SiteVideo } from "../media/SiteVideo";
import type { SiteMediaKey } from "../media/manifest";

/** The template cards on the website; each opens its editor template (exported for tests). */
export const SHOWCASE_TEMPLATES = [
  {
    id: "tech-grid",
    editorTemplate: "tech-silicon-dispatch", // the editor template this card opens (lib/templates/newsTemplates.ts)
    title: "Cyberpunk 4K Intro",
    category: "Broadcast & Motion",
    duration: "00:10",
    resolution: "4K 60FPS",
    media: "cyberIntro" as SiteMediaKey,
    tracks: "3 Video • 2 Audio • HUD Matrix",
    tag: "Trending",
    accent: "cyan",
  },
  {
    id: "globe-3d",
    editorTemplate: "world-news-globe", // the editor template this card opens (lib/templates/newsTemplates.ts)
    title: "Global Tech Hologram",
    category: "3D Motion HUD",
    duration: "00:10",
    resolution: "4K 60FPS",
    media: "globe" as SiteMediaKey,
    tracks: "2 Video • 1 Alpha • 48kHz Audio",
    tag: "Studio",
    accent: "sky",
  },
  {
    id: "newsroom",
    editorTemplate: "modern-news-studio", // the editor template this card opens (lib/templates/newsTemplates.ts)
    title: "Breaking Newsroom Live",
    category: "Television Broadcast",
    duration: "00:30",
    resolution: "1080p 60FPS",
    media: "newsroom" as SiteMediaKey,
    tracks: "Lower Third • Ticker • REC HUD",
    tag: "News",
    accent: "rose",
  },
  {
    id: "podcast",
    editorTemplate: "podcast-studio-neon", // the editor template this card opens (lib/templates/newsTemplates.ts)
    title: "Podcast Split Screen",
    category: "Talking Heads",
    duration: "00:15",
    resolution: "4K DCI-P3",
    media: "podcastLoop" as SiteMediaKey,
    tracks: "Smart Audio Mix • Waveform VU",
    tag: "Audio",
    accent: "purple",
  },
  {
    id: "sports",
    editorTemplate: "sports-center-pro", // the editor template this card opens (lib/templates/newsTemplates.ts)
    title: "Sports Arena Broadcast",
    category: "High Action 60FPS",
    duration: "00:20",
    resolution: "4K 60FPS",
    media: "sportsGame" as SiteMediaKey,
    tracks: "Motion Tracker • Scoreboard HUD",
    tag: "Action",
    accent: "emerald",
  },
  {
    id: "vertical-reels",
    editorTemplate: "vertical-reels-flash", // the editor template this card opens (lib/templates/newsTemplates.ts)
    title: "Viral Vertical Reels",
    category: "9:16 Shorts & TikTok",
    duration: "00:15",
    resolution: "1080 × 1920",
    media: "reelsVertical" as SiteMediaKey,
    tracks: "Kinetic Subtitles • Sound FX Audio",
    tag: "Social",
    accent: "amber",
  },
];

function TemplateCardItem({ tmpl, isLight }: { tmpl: (typeof SHOWCASE_TEMPLATES)[number]; isLight: boolean }) {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <div
      onMouseEnter={() => setIsPlaying(true)}
      onMouseLeave={() => setIsPlaying(false)}
      onFocus={() => setIsPlaying(true)}
      onBlur={() => setIsPlaying(false)}
      className={`group rounded-[28px] overflow-hidden border p-4 flex flex-col justify-between transition-all duration-300 hover:-translate-y-2 ${
        isLight
          ? "bg-white/95 border-purple-200/70 shadow-lg hover:shadow-2xl hover:border-purple-400"
          : "bg-site-surface/90 border-white/10 hover:border-cyan-400/50 shadow-[0_15px_40px_rgba(0,0,0,0.6)] hover:shadow-[0_20px_50px_rgba(45, 212, 191,0.25)]"
      }`}
    >
      {/* High-Resolution Cinematic Thumbnail & Video Preview Stage */}
      <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-950 mb-4 border border-white/10 shadow-inner group/media">
        {/* Live Looping Video Stream with Poster */}
        {/* the template's own thumbnail; its video plays while you point at the card (one at a time, not six) */}
        <SiteVideo
          media={tmpl.media}
          paused={!isPlaying}
          showPlayButton={false}
          label={`${tmpl.title} template preview`}
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
        />

        {/* Live Playing Indicator (fades on hover) */}
        <div
          className="absolute top-2.5 right-2.5 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/75 backdrop-blur-md text-[10px] font-mono text-cyan-300 border border-cyan-500/30 shadow pointer-events-none"
        >
          <span className={`size-1.5 rounded-full bg-cyan-400 ${isPlaying ? "animate-pulse" : ""}`} />
          <span>{isPlaying ? "Playing" : "Preview"}</span>
        </div>

        {/* Top-Left Category Pill */}
        <div className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full bg-black/75 backdrop-blur-md text-xs font-mono font-bold text-cyan-300 border border-white/15 shadow">
          {tmpl.tag}
        </div>

        {/* Bottom-Right Duration */}
        <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded bg-black/85 backdrop-blur-sm font-mono text-xs text-white border border-white/10 shadow">
          {tmpl.duration}
        </div>
      </div>

      {/* Metadata */}
      <div>
        <div className={`text-xs font-mono uppercase tracking-wider mb-1 ${isLight ? "text-purple-700 font-semibold" : "text-slate-400"}`}>
          {tmpl.category}
        </div>
        <h3
          className={`font-extrabold text-base truncate transition-colors ${
            isLight ? "text-slate-900 group-hover:text-purple-700" : "text-white group-hover:text-cyan-300"
          }`}
        >
          {tmpl.title}
        </h3>
        <p className={`text-[11px] font-mono mt-1 truncate ${isLight ? "text-slate-600 font-medium" : "text-slate-400"}`}>
          {tmpl.tracks}
        </p>
      </div>

      {/* Launch CTA */}
      <div className={`mt-4 pt-3 border-t flex items-center justify-between ${isLight ? "border-slate-200" : "border-white/10"}`}>
        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${isLight ? "text-cyan-800 bg-cyan-100 border-cyan-300" : "text-cyan-400 bg-cyan-950/60 border-cyan-800/40"}`}>
          {tmpl.resolution}
        </span>
        <Link
          href={`/editor?template=${tmpl.editorTemplate}`}
          className={`px-3.5 py-1.5 rounded-full text-xs font-mono font-bold transition flex items-center gap-1 hover:scale-105 shadow ${isLight ? "bg-purple-600 hover:bg-purple-700 text-white shadow-purple-500/20" : "bg-gradient-to-r from-cyan-500/20 to-purple-500/20 hover:from-cyan-500 hover:to-purple-600 text-cyan-200 hover:text-white border border-cyan-400/40"}`}
        >
          <span>Use Template</span>
          <span>→</span>
        </Link>
      </div>
    </div>
  );
}

export function TemplatesShowcaseSection() {
  const theme = useResolvedTheme();
  const isLight = theme === "light";

  return (
    <div className="w-full select-none">
      {/* Section Header */}
      <div className="text-center mb-10 sm:mb-12">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-500/10 border border-purple-400/25 text-purple-300 text-xs font-mono uppercase tracking-widest mb-4">
          <span className="size-2 rounded-full bg-cyan-400 animate-pulse" />
          Production-Ready Starter Packs
        </div>

        <h2
          className={`text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight ${
            isLight ? "text-slate-900" : "text-white"
          }`}
        >
          Jumpstart With <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-purple-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
            Studio Master Templates.
          </span>
        </h2>

        <p
          className={`text-sm sm:text-base max-w-2xl mx-auto mt-3 leading-relaxed ${
            isLight ? "text-slate-600" : "text-slate-300"
          }`}
        >
          Pre-loaded multi-track timelines with audio ducking, broadcast camera HUDs, and 4K color grade LUTs. Hover to preview video stream.
        </p>
      </div>

      {/* Templates Grid: 6 High-Impact Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {SHOWCASE_TEMPLATES.map((tmpl) => (
          <TemplateCardItem key={tmpl.id} tmpl={tmpl} isLight={isLight} />
        ))}
      </div>
    </div>
  );
}
