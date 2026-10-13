"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { useResolvedTheme } from "@/lib/editor/theme";
import { SiteVideo } from "../media/SiteVideo";

const USE_CASES = [
  {
    id: "creators",
    title: "Content Creators & YouTubers",
    icon: "magic",
    tag: "Viral Production",
    lead: "Cut, caption and resize for every platform without leaving the browser.",
    bullets: [
      "1-click silence detection cuts dead air automatically",
      "Instant stock media drop with volume auditioning",
      "Auto-captions with word-by-word kinetic animations",
    ],
    media: "neonWalk" as const,
    metric: "Silence cuts · captions",
  },
  {
    id: "developers",
    title: "Web Agencies & Developers",
    icon: "person",
    tag: "Transparent Avatars",
    lead: "Drop floating video avatars onto websites with zero background halo.",
    bullets: [
      "Dual-stream WebM VP9 (Chrome) & HEVC MOV (Safari) alpha",
      "Copy-paste responsive HTML and CSS embed code",
      "100% client-side privacy with no cloud storage fees",
    ],
    media: "virtualPresenter" as const,
    metric: "WebM + MOV alpha",
  },
  {
    id: "newsrooms",
    title: "Broadcast Media & Podcasters",
    icon: "broadcast",
    tag: "Studio Standards",
    lead: "Television-grade lower thirds, breaking tickers, and dialogue ducking.",
    bullets: [
      "Smart ducking lowers music under voiceover and dialogue",
      "Live scrolling breaking news tickers and camera HUDs",
      "Sub-frame audio trimming and magnetic track sync",
    ],
    media: "podcast" as const,
    metric: "Ducking · tickers",
  },
  {
    id: "brands",
    title: "E-Commerce & Digital Brands",
    icon: "motionTrack",
    tag: "Product Motion",
    lead: "Pin interactive callouts and price tags to moving products in 4K.",
    bullets: [
      "Motion tracking pins text and graphics to moving objects",
      "3D perspective skew aligns badges with physical products",
      "Instant 9:16 vertical shorts export for TikTok and Reels",
    ],
    media: "neonCar" as const,
    metric: "Tracking · 9:16 export",
  },
];

export function UseCasesSection() {
  const theme = useResolvedTheme();
  const isLight = theme === "light";
  const [activeId, setActiveId] = useState("creators");

  const current = USE_CASES.find((u) => u.id === activeId) || USE_CASES[0];


  return (
    <div className="w-full select-none">
      {/* Section Header */}
      <div className="text-center mb-10 sm:mb-12">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-400/25 text-cyan-300 text-xs font-mono uppercase tracking-widest mb-4">
          <span className="size-2 rounded-full bg-cyan-400 animate-pulse" />
          Tailored For Every Creator
        </div>

        <h2
          className={`text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight ${
            isLight ? "text-slate-900" : "text-white"
          }`}
        >
          Engineered For Every Workflow. <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-purple-400 bg-clip-text text-transparent">
            From Solo Creators to Studios.
          </span>
        </h2>

        <p
          className={`text-sm sm:text-base max-w-2xl mx-auto mt-3 leading-relaxed ${
            isLight ? "text-slate-600" : "text-slate-300"
          }`}
        >
          Explore how professional video creators, web developers, newsrooms, and digital brands use ViPlay Studio to accelerate production.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-8 sm:mb-10">
        {USE_CASES.map((uc) => (
          <button
            key={uc.id}
            onClick={() => setActiveId(uc.id)}
            className={`px-4 py-2 rounded-full text-xs font-mono transition-all duration-300 flex items-center gap-2 ${
              activeId === uc.id
                ? isLight
                  ? "bg-purple-600 text-white font-bold shadow-md shadow-purple-500/20 scale-105"
                  : "bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-bold shadow-[0_0_20px_rgba(45, 212, 191,0.35)] scale-105"
                : isLight
                ? "bg-white/80 text-slate-600 hover:text-slate-950 border border-purple-200/50"
                : "bg-site-surface/80 text-slate-400 hover:text-white border border-white/10"
            }`}
          >
            <Icon name={uc.icon as any} className="size-4" />
            <span>{uc.title.split("&")[0].trim()}</span>
          </button>
        ))}
      </div>

      {/* Showcase Stage */}
      <div
        className={`rounded-[32px] border p-6 sm:p-10 transition-all duration-500 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center ${
          isLight
            ? "bg-white/90 border-purple-200/60 shadow-[0_20px_60px_rgba(124, 108, 250,0.08)]"
            : "bg-[#09041a]/90 border-white/10 shadow-[0_25px_80px_rgba(0,0,0,0.8)]"
        }`}
      >
        {/* Left Column: Details */}
        <div className="lg:col-span-6 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/15 border border-purple-400/30 text-purple-300 text-xs font-mono">
            <span>{current.tag}</span>
            <span>•</span>
            <span className="text-cyan-300">{current.metric}</span>
          </div>

          <h3
            className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
              isLight ? "text-slate-900" : "text-white"
            }`}
          >
            {current.title}
          </h3>

          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            {current.lead}
          </p>

          <div className="space-y-3 pt-2">
            {current.bullets.map((bullet, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="size-5 rounded-full bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 text-xs shrink-0 mt-0.5">
                  ✓
                </div>
                <span className="text-xs sm:text-sm text-slate-300">{bullet}</span>
              </div>
            ))}
          </div>

          <div className="pt-4">
            <Link
              href="/editor"
              className="site-btn-primary inline-flex min-h-11 items-center gap-2 rounded-full px-6 text-sm font-semibold"
            >
              <span>Launch {current.title.split("&")[0].trim()} Workflow</span>
              <span>→</span>
            </Link>
          </div>
        </div>

        {/* Right Column: Visual Stage */}
        <div className="lg:col-span-6">
          <div className="relative rounded-2xl overflow-hidden border border-white/15 shadow-2xl aspect-video group bg-black/60">
            <SiteVideo key={current.id} media={current.media} label={`${current.title} example`} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-xs font-mono text-white">
              <span className="bg-black/60 px-2.5 py-1 rounded-md border border-white/10 flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                Example footage
              </span>
              <span className="text-cyan-300 font-bold">{current.metric}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
