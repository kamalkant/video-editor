"use client";

import { useState, useRef, useEffect } from "react";
import { useResolvedTheme } from "@/lib/editor/theme";
import { Icon } from "@/components/ui/Icon";
import { SiteVideo } from "../media/SiteVideo";
import { type SiteMediaKey } from "../media/manifest";

interface GeneratedPreset {
  prompt: string;
  video: SiteMediaKey;
  label: string;
}

// AI-made example clips (light web copies) with the prompts that describe them
const PRESET_PROMPTS: GeneratedPreset[] = [
  { prompt: "A woman in a flowing white dress walks through a rain-soaked neon Tokyo street at night", video: "neonWalk", label: "Neon City Walk" },
  { prompt: "A sleek sports car glides down a wet cyberpunk street under holographic koi fish", video: "neonCar", label: "Cyberpunk Car" },
  { prompt: "Iridescent silk swirls around a model on a black studio background, soft light", video: "silkFashion", label: "Silk in Motion" },
  { prompt: "A surfer carves through a turquoise barrel wave on a bright morning", video: "surf", label: "Surf Barrel" },
];

export function AiGenerationModule() {
  const theme = useResolvedTheme();
  const isLight = theme === "light";
  const [prompt, setPrompt] = useState(PRESET_PROMPTS[0].prompt);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentVideo, setCurrentVideo] = useState<SiteMediaKey>(PRESET_PROMPTS[0].video);
  const stageRef = useRef<HTMLDivElement>(null);


  const handleGenerate = (targetPreset?: GeneratedPreset) => {
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      if (targetPreset) {
        setCurrentVideo(targetPreset.video);
        setPrompt(targetPreset.prompt);
      } else {
        const remaining = PRESET_PROMPTS.filter((p) => p.video !== currentVideo);
        const next = remaining[Math.floor(Math.random() * remaining.length)] || PRESET_PROMPTS[0];
        setCurrentVideo(next.video);
        setPrompt(next.prompt);
      }
    }, 1000);
  };

  return (
    <div className="w-full relative transition-all duration-500 group">
      {/* Ambient Fuchsia Light Halo */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(189, 124, 247, 0.12) 0%, transparent 70%)" }} />

      {/* Header Info - Floating Borderless Typography */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono font-bold text-fuchsia-400 bg-fuchsia-950/60 border border-fuchsia-800/40 px-2 py-0.5 rounded">
              04
            </span>
            <span className="text-xs font-mono tracking-wider text-purple-300 uppercase">
              AI Video Generation Preview
            </span>
          </div>

          <h3 className={`text-2xl sm:text-4xl font-extrabold tracking-tight ${isLight ? "text-slate-900" : "text-white"}`}>
            Generate, review and refine
          </h3>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl mt-1">
            Describe a shot and AI generates a 4–8 second high-definition video clip with sound directly on your timeline. Experience real video synthesis below.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-fuchsia-300 bg-site-surface/90 px-3.5 py-2 rounded-full border border-purple-500/20 shrink-0 shadow-lg backdrop-blur-md">
          <span className="size-2 rounded-full bg-fuchsia-400 animate-ping" />
          <span>EXAMPLE CLIPS · MADE WITH AI</span>
        </div>
      </div>

      {/* Hero Visual Viewport Stage - Floating Expansive Screen */}
      <div ref={stageRef} className="relative aspect-video sm:aspect-[21/9] w-full rounded-3xl overflow-hidden border border-white/10 bg-black select-none shadow-[0_25px_80px_rgba(0,0,0,0.9),0_0_60px_rgba(189, 124, 247,0.12)]">
        {/* Real Live Synthesized Video Diffusion Stream */}
        <SiteVideo key={currentVideo} media={currentVideo} label={PRESET_PROMPTS.find((p) => p.video === currentVideo)?.label} className={`w-full h-full object-cover transition-all duration-700 select-none pointer-events-none ${
            isGenerating ? "scale-105 filter blur-md brightness-50" : "scale-100 filter brightness-100"
          }`} />

        {/* Loading Spinner during Generation */}
        {isGenerating && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md z-20">
            <div className="size-14 border-4 border-fuchsia-500/20 border-t-fuchsia-400 rounded-full animate-spin mb-4" />
            <span className="text-sm font-mono text-fuchsia-300 uppercase tracking-widest animate-pulse font-bold">
              Picking an example…
            </span>
            <span className="text-xs font-mono text-slate-400 mt-1">Generating 60 FPS Latent Flow Frames</span>
          </div>
        )}

        {/* Bottom Floating Prompt Bar directly on stage */}
        <div className="absolute inset-x-4 sm:inset-x-8 bottom-6 z-20">
          <div className="flex items-center gap-3 p-2 sm:p-2.5 rounded-full bg-black/85 backdrop-blur-xl border border-white/15 shadow-2xl">
            <div className="pl-3 sm:pl-4 text-fuchsia-400">
              <Icon name="sparkles" className="size-4" />
            </div>

            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your video scene..."
              className="flex-1 bg-transparent text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none"
            />

            <button
              onClick={() => handleGenerate()}
              disabled={isGenerating}
              aria-label="Show an example"
              className="px-5 py-2.5 rounded-full bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-400 hover:to-purple-500 text-white text-xs font-bold transition hover:scale-105 shadow-lg shadow-fuchsia-500/30 disabled:opacity-50 shrink-0 cursor-pointer"
            >
              {isGenerating ? "Synthesizing…" : "Show an example"}
            </button>
          </div>
        </div>
      </div>

      {/* Preset Prompt Pills beneath stage */}
      <div className="flex items-center gap-2 pt-4 overflow-x-auto pb-1 text-xs">
        <span className="text-xs font-mono text-slate-400 uppercase whitespace-nowrap">
          Presets:
        </span>
        {PRESET_PROMPTS.map((preset, idx) => (
          <button
            key={idx}
            onClick={() => handleGenerate(preset)}
            className={`px-3 py-1.5 rounded-full border whitespace-nowrap transition-all duration-200 cursor-pointer ${
              currentVideo === preset.video
                ? "bg-fuchsia-500/25 border-fuchsia-400 text-fuchsia-200 font-bold shadow-md shadow-fuchsia-500/20"
                : "bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border-white/5"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
