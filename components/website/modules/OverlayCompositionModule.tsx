"use client";

import { useState, useRef } from "react";
import { useResolvedTheme } from "@/lib/editor/theme";
import { Icon } from "@/components/ui/Icon";
import { SiteVideo } from "../media/SiteVideo";
import { SITE_IMAGES, SITE_MEDIA, type SiteMediaKey } from "../media/manifest";

interface Layer {
  id: string;
  name: string;
  blend: string;
  visible: boolean;
}

const INITIAL_LAYERS: Layer[] = [
  { id: "bg", name: "Background Video", blend: "Normal", visible: true },
  { id: "avatar", name: "Avatar (Alpha)", blend: "Normal", visible: true },
  { id: "text", name: "Text Title", blend: "Normal", visible: true },
  { id: "graphics", name: "Graphics / HUD", blend: "Overlay", visible: true },
  { id: "effects", name: "Effects (Glow)", blend: "Color Dodge", visible: true },
];

// backgrounds behind the transparent presenter (real footage, light web copies)
const ASSET_LIBRARY: Array<{ id: string; label: string; media: SiteMediaKey }> = [
  { id: "globe", label: "3D Hologram World", media: "globe" },
  { id: "tech", label: "Cyberpunk City", media: "cyberIntro" },
  { id: "jelly", label: "Holographic Ocean", media: "holoJellyfish" },
  { id: "news", label: "Live Newsroom Studio", media: "newsroom" },
  { id: "peaks", label: "Mountain Grid", media: "gridMountain" },
]

export function OverlayCompositionModule() {
  const theme = useResolvedTheme();
  const isLight = theme === "light";
  const [layers, setLayers] = useState<Layer[]>(INITIAL_LAYERS);
  const [activeBgVideo, setActiveBgVideo] = useState<SiteMediaKey>("globe");
  const [activeAvatar, setActiveAvatar] = useState(SITE_IMAGES.presenterAlpha.src);
  const stageRef = useRef<HTMLDivElement>(null);


  const toggleLayer = (id: string) => {
    setLayers((prev) =>
      prev.map((layer) => (layer.id === id ? { ...layer, visible: !layer.visible } : layer))
    );
  };

  const isVisible = (id: string) => layers.find((l) => l.id === id)?.visible ?? true;

  return (
    <div className="w-full relative transition-all duration-500 group">
      {/* Background Ambient Violet Halo */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(99, 85, 240, 0.12) 0%, transparent 70%)" }} />

      {/* Header Info - Floating Borderless Typography */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono font-bold text-sky-400 bg-sky-950/60 border border-sky-800/40 px-2 py-0.5 rounded">
              02
            </span>
            <span className="text-xs font-mono tracking-wider text-purple-300 uppercase">
              Overlay & Composition
            </span>
          </div>

          <h3 className={`text-2xl sm:text-4xl font-extrabold tracking-tight ${isLight ? "text-slate-900" : "text-white"}`}>
            Combine videos, images and avatars
          </h3>

          <p className={`text-xs sm:text-sm leading-relaxed max-w-xl mt-1 ${isLight ? "text-slate-600" : "text-slate-300"}`}>
            Combine videos, images and avatars with real-time preview, layer ordering, and hardware blend modes.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-cyan-300 bg-site-surface/90 px-3.5 py-2 rounded-full border border-purple-500/20 shrink-0 shadow-lg backdrop-blur-md">
          <span className="size-2 rounded-full bg-cyan-400 animate-ping" />
          <span>REAL-TIME COMPOSITOR · ZERO LATENCY</span>
        </div>
      </div>

      {/* Grand Composition Grid: 16:9 Viewport (8 cols) + Layer Stack (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start mb-6">
        {/* Main Visual Stage (8 cols) - Floating Hero Player */}
        <div ref={stageRef} className="lg:col-span-8 relative aspect-video w-full rounded-3xl overflow-hidden border border-white/10 bg-black select-none shadow-[0_25px_80px_rgba(0,0,0,0.9),0_0_60px_rgba(99, 85, 240,0.12)]">
          {/* Background Live Video Layer */}
          {isVisible("bg") && (
            <SiteVideo key={activeBgVideo} media={activeBgVideo} className="absolute inset-0 w-full h-full object-cover filter brightness-90 transition-opacity duration-300 select-none pointer-events-none" />
          )}

          {/* Floating Transparent Avatar Layer (True RGBA Transparent PNG!) */}
          {isVisible("avatar") && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-10">
              <img loading="lazy" decoding="async"
                src={activeAvatar}
                alt="Avatar Alpha"
                draggable={false}
                className="w-auto h-[92%] max-h-full object-contain filter drop-shadow-[0_0_35px_rgba(124, 108, 250,0.5)] transition-opacity duration-300 pointer-events-none select-none"
              />
            </div>
          )}

          {/* Floating Text Overlay */}
          {isVisible("text") && (
            <div className="absolute top-8 left-8 p-3 rounded-2xl bg-black/60 backdrop-blur-md border border-purple-500/20 text-white z-20 transition-opacity duration-300 shadow-xl">
              <span className="text-xs font-mono text-cyan-400 uppercase tracking-widest block">
                ViPlay Studio Title
              </span>
              <span className="text-sm sm:text-base font-bold">
                Cinematic Composition
              </span>
            </div>
          )}

          {/* HUD Graphics Reticle */}
          {isVisible("graphics") && (
            <div className="absolute inset-x-8 bottom-8 flex items-center justify-between p-3 rounded-2xl bg-black/70 backdrop-blur-md border border-cyan-500/40 text-cyan-300 text-xs font-mono z-20 transition-opacity duration-300 shadow-xl">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-cyan-400 animate-pulse" />
                <span>CAMERA TRACK: ACTIVE</span>
              </div>
              <span>FOCAL: 35mm · ISO 400</span>
            </div>
          )}

          {/* Glow Effects */}
          {isVisible("effects") && (
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-purple-500/15 via-transparent to-cyan-500/15 transition-opacity duration-300 z-20" />
          )}

          {/* Live Layer Count Badge */}
          <div className="absolute bottom-4 left-4 px-3 py-1 rounded-full bg-black/80 backdrop-blur-md text-xs font-mono text-white border border-white/10 z-20 shadow-md">
            {layers.filter((l) => l.visible).length} of {layers.length} Layers Active
          </div>
        </div>

        {/* Layer Stack Panel (4 cols) - Floating Sleek Glass Panel */}
        <div className="lg:col-span-4 rounded-3xl border border-white/10 bg-site-surface/80 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.7)] backdrop-blur-xl">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-purple-500/15 text-xs font-mono">
            <span className="text-purple-300/80">LAYER STACK</span>
            <span className="text-cyan-400">BLEND MODE</span>
          </div>

          <div className="space-y-2">
            {layers.map((layer) => (
              <div
                key={layer.id}
                onClick={() => toggleLayer(layer.id)}
                className={`p-3 rounded-2xl transition-all cursor-pointer flex items-center justify-between ${
                  layer.visible
                    ? "bg-site-raised hover:bg-site-raised shadow-md border border-purple-500/30"
                    : "bg-site-surface/40 border border-white/5 opacity-50 hover:opacity-75"
                }`}
              >
                <div className="flex items-center gap-3">
                  <button
                    className={`size-6 rounded-lg flex items-center justify-center text-xs transition ${
                      layer.visible ? "bg-purple-500 text-white font-bold" : "bg-slate-800 text-slate-500"
                    }`}
                  >
                    {layer.visible ? "👁" : "—"}
                  </button>
                  <span className={`text-xs font-medium ${layer.visible ? "text-white" : "text-slate-500"}`}>
                    {layer.name}
                  </span>
                </div>

                <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-black/60 text-slate-400 border border-white/10">
                  {layer.blend}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-purple-500/15 text-xs font-mono text-slate-400 flex items-center justify-between">
            <span>Hardware Composite</span>
            <span className="text-emerald-400 font-bold">60 FPS</span>
          </div>
        </div>
      </div>

      {/* Asset Strip beneath stage - Floating Pills & Previews */}
      <div className="flex items-center gap-3 pt-2 overflow-x-auto pb-1">
        <span className="text-xs font-mono text-slate-400 uppercase whitespace-nowrap">
          Click Asset to Swap:
        </span>
        {ASSET_LIBRARY.map((asset) => {
          const isSelected = activeBgVideo === asset.media;
          return (
            <button
              key={asset.id}
              onClick={() => setActiveBgVideo(asset.media)}
              title={asset.label}
              className={`size-12 rounded-2xl overflow-hidden shrink-0 transition-transform duration-200 cursor-pointer ${
                isSelected
                  ? "ring-2 ring-purple-400 shadow-[0_0_20px_rgba(124, 108, 250,0.7)] scale-105"
                  : "border border-white/10 hover:border-purple-400/50 hover:scale-105 opacity-70 hover:opacity-100"
              }`}
            >
              <img loading="lazy" decoding="async"
                src={SITE_MEDIA[asset.media].poster}
                alt={asset.label}
                draggable={false}
                className="w-full h-full object-cover select-none pointer-events-none"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
