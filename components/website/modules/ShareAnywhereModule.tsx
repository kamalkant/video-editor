"use client";

import { useState } from "react";
import { useResolvedTheme } from "@/lib/editor/theme";
import { Icon } from "@/components/ui/Icon";
import { buildEmbedSnippet } from "@/lib/embed/snippet";
import { SITE_IMAGES } from "../media/manifest";

export function ShareAnywhereModule() {
  const theme = useResolvedTheme();
  const isLight = theme === "light";
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"embed" | "qr" | "social">("embed");
  const [autoplayMuted, setAutoplayMuted] = useState(true);
  const [preserveAlpha, setPreserveAlpha] = useState(true);

  // the same embed code the editor's website pack gives you (lib/embed/snippet)
  const snippetCode = buildEmbedSnippet({
    folder: "/avatar/",
    webmName: "avatar.webm",
    movName: "avatar.mov",
    posterName: "avatar.jpg",
    width: 360,
    height: 640,
    withSound: !autoplayMuted,
  });

  const handleCopy = () => {
    navigator.clipboard?.writeText(snippetCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full relative transition-all duration-500 group">
      {/* Ambient Violet Light Halo */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(139, 92, 246, 0.12) 0%, transparent 70%)" }} />

      {/* Header Info - Floating Borderless Typography */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono font-bold text-violet-400 bg-violet-950/60 border border-violet-800/40 px-2 py-0.5 rounded">
              08
            </span>
            <span className="text-xs font-mono tracking-wider text-purple-300 uppercase">
              Distribution Engine
            </span>
          </div>

          <h3 className={`text-2xl sm:text-4xl font-extrabold tracking-tight ${isLight ? "text-slate-900" : "text-white"}`}>
            Share Anywhere
          </h3>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl mt-1">
            Zero-friction embeds, QR code streaming, and universal spatial playback on iOS, Android, macOS, and Web.
          </p>
        </div>

        {/* Tab Controls - Floating Pill */}
        <div className="flex items-center gap-1 bg-site-surface/90 p-1.5 rounded-full border border-purple-500/20 text-xs font-mono shrink-0 shadow-lg backdrop-blur-md">
          <button
            onClick={() => setActiveTab("embed")}
            className={`px-4 py-1.5 rounded-full transition-all duration-300 ${
              activeTab === "embed" ? "bg-purple-600 text-white font-bold shadow-md shadow-purple-600/30" : "text-slate-400 hover:text-white"
            }`}
          >
            Web Component
          </button>
          <button
            onClick={() => setActiveTab("qr")}
            className={`px-4 py-1.5 rounded-full transition-all duration-300 ${
              activeTab === "qr" ? "bg-purple-600 text-white font-bold shadow-md shadow-purple-600/30" : "text-slate-400 hover:text-white"
            }`}
          >
            Play on Mobile
          </button>
          <button
            onClick={() => setActiveTab("social")}
            className={`px-4 py-1.5 rounded-full transition-all duration-300 ${
              activeTab === "social" ? "bg-purple-600 text-white font-bold shadow-md shadow-purple-600/30" : "text-slate-400 hover:text-white"
            }`}
          >
            Social Export
          </button>
        </div>
      </div>

      {/* Main Showcase Stage (8 cols Code/Options + 4 cols Interactive Preview) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start mb-6">
        {/* Left Column: Embed Code & Controls (7 cols) - Floating Sleek Panel */}
        <div className="lg:col-span-7 rounded-3xl border border-white/10 bg-site-surface/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.7)] backdrop-blur-xl">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-purple-500/15">
            <span className="text-xs font-mono text-purple-300">ONE-LINE WEB COMPONENT</span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 text-xs font-mono font-bold transition hover:scale-105 border border-purple-400/30"
            >
              <Icon name="check" className={`size-3.5 ${copied ? "text-emerald-400" : "text-purple-300"}`} />
              <span>{copied ? "Copied!" : "Copy"}</span>
            </button>
          </div>

          <pre tabIndex={0} aria-label="Embed code" className="p-4 rounded-2xl bg-black/80 border border-white/5 font-mono text-xs text-purple-200 overflow-auto max-h-80 mb-6">
            <code>{snippetCode}</code>
          </pre>

          {/* Embed Configuration Toggles */}
          <div className="space-y-3 pt-2">
            <label className="flex items-center justify-between p-3 rounded-2xl bg-black/40 hover:bg-black/60 border border-white/5 cursor-pointer transition">
              <span className="text-xs font-medium text-white">Autoplay muted</span>
              <input
                type="checkbox"
                checked={autoplayMuted}
                onChange={(e) => setAutoplayMuted(e.target.checked)}
                className="size-4 accent-purple-500 rounded"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-2xl bg-black/40 hover:bg-black/60 border border-white/5 cursor-pointer transition">
              <span className="text-xs font-medium text-white">Preserve Alpha Canvas</span>
              <input
                type="checkbox"
                checked={preserveAlpha}
                onChange={(e) => setPreserveAlpha(e.target.checked)}
                className="size-4 accent-purple-500 rounded"
              />
            </label>
          </div>
        </div>

        {/* Right Column: Live Responsive Preview (5 cols) - Floating Phone Stage */}
        <div className="lg:col-span-5 rounded-3xl border border-white/10 bg-site-surface/80 p-6 flex flex-col items-center justify-center text-center shadow-[0_20px_60px_rgba(0,0,0,0.7)] backdrop-blur-xl">
          {activeTab === "qr" ? (
            <div className="py-4">
              <div className="size-44 bg-white p-3 rounded-2xl shadow-2xl mx-auto mb-4 flex items-center justify-center">
                {/* Visual SVG QR representation */}
                <svg className="size-full text-slate-950" viewBox="0 0 100 100" fill="currentColor">
                  <path d="M10 10h30v30h-30zM15 15h20v20h-20zM60 10h30v30h-30zM65 15h20v20h-20zM10 60h30v30h-30zM15 65h20v20h-20zM22 22h6v6h-6zM72 22h6v6h-6zM22 72h6v6h-6zM50 20h5v15h-5zM50 45h15v5h-15zM75 50h15v5h-15zM60 60h10v10h-10zM80 60h10v20h-10zM50 75h10v15h-10zM65 85h25v5h-25z" />
                </svg>
              </div>
              <span className="text-xs font-mono text-purple-300 block mb-1">Instant Mobile Preview</span>
              <span className="text-xs text-slate-400">Scan with iPhone or Android camera</span>
            </div>
          ) : (
            <div className="w-full">
              <div className="relative aspect-[9/16] max-h-72 w-44 mx-auto rounded-3xl overflow-hidden border-2 border-purple-500/40 shadow-2xl bg-black mb-4">
                <img loading="lazy" decoding="async"
                  src={SITE_IMAGES.presenterAlpha.src}
                  alt="Embedded Player Demo"
                  draggable={false}
                  className="w-full h-full object-contain filter drop-shadow-[0_0_20px_rgba(124, 108, 250,0.7)]"
                />
                <div className="absolute bottom-3 inset-x-3 p-2 rounded-xl bg-black/80 backdrop-blur-md text-xs font-mono text-white text-center border border-white/10">
                  vdo-player · active
                </div>
              </div>
              <span className="text-xs font-mono text-white font-bold block mb-1">Live Embed Simulation</span>
              <span className="text-xs text-slate-400">Renders as native custom element on any webpage</span>
            </div>
          )}

          <div className="w-full pt-4 mt-2 border-t border-purple-500/15 flex items-center justify-between text-xs font-mono text-slate-400">
            <span>Universal CDN Sync</span>
            <span className="text-purple-300 font-bold">Share QR</span>
          </div>
        </div>
      </div>
    </div>
  );
}
