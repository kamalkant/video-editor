"use client";

import { useState } from "react";
import { GoogleAiModal } from "@/components/ui/GoogleAiModal";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { costOf, IMAGE_QUALITY, money, type ImageQuality } from "@/lib/ai/pricing";
import { nearestImageAspect } from "@/lib/ai/shapes";
import type { ImageAspect } from "@/lib/ai/shapes";
import { geminiPost, type GeminiUi } from "@/lib/editor/useGemini";
import type { VideoMeta } from "@/lib/videos";
import { GeminiKeyCard, GeminiNote } from "./GeminiBits";
import { AspectTileSelector, GoogleGeminiPill, PromptEnhancerButton, StyleChipGroup } from "./GoogleAiBits";

type Purpose = "picture" | "background";

const STYLE_CATEGORIES = {
  styles: [
    { label: "Photorealistic", words: "ultra-photorealistic 8K, highly detailed texture, shot on 35mm lens" },
    { label: "Cinematic Film", words: "cinematic film still, anamorphic lens flare, dramatic depth of field" },
    { label: "Modern 3D", words: "clean 3D render, Pixar style, soft ambient occlusion, octane render" },
    { label: "Anime / Manga", words: "vibrant anime illustration, Makoto Shinkai style, crisp lineart" },
    { label: "Cyberpunk", words: "futuristic cyberpunk city, neon glowing reflections, rain wet streets" },
    { label: "Minimalist Vector", words: "clean minimalist flat vector art, bold harmonious color palette" },
  ],
  lighting: [
    { label: "Golden Hour", words: "warm golden hour sunlight, soft radiant glows, long shadows" },
    { label: "Studio Lighting", words: "commercial studio three-point lighting, clean crisp background" },
    { label: "Moody & Dramatic", words: "chiaroscuro, deep contrast, atmospheric rim lighting, foggy volumetric rays" },
    { label: "Neon Cyber", words: "duotone neon cyan and magenta illumination, nocturnal ambient glow" },
  ],
  backgrounds: [
    { label: "Newsroom Studio", words: "a modern broadcast news studio with video screens and sleek desk" },
    { label: "Modern Tech Office", words: "bright contemporary open-plan studio office, softly blurred background" },
    { label: "Abstract Geometry", words: "elegant smooth 3D floating geometric ribbons with satin texture" },
    { label: "Nature Sanctuary", words: "serene sunlit forest clearing with morning mist and soft bokeh" },
    { label: "Urban Skyline", words: "penthouse window overlooking a modern metropolitan skyline at twilight" },
  ],
};

/**
 * Google Flow Visual Studio:
 * Full Google Flow / ImageFX experience for generating high-definition pictures
 * and backgrounds using Google Gemini & Imagen.
 */
export function GenerateImageDialog(p: {
  open: boolean;
  onClose: () => void;
  gemini: GeminiUi;
  purpose: Purpose;
  canvas: { width: number; height: number };
  onMade: (m: VideoMeta) => void;
  onAddToTimeline: (m: VideoMeta) => void;
  onUseAsBackground: (m: VideoMeta) => void;
}) {
  return (
    <GoogleAiModal
      open={p.open}
      onClose={p.onClose}
      size="xl"
      title={p.purpose === "background" ? "Google Flow · Background Studio" : "Google Flow · Image Studio"}
      subtitle={
        p.purpose === "background"
          ? "Create custom 8K video backdrops, newsrooms, and 3D scenes for your video"
          : "Create high-fidelity visuals, overlays, and graphics directly from natural language prompts"
      }
      badge={<GoogleGeminiPill label="Imagen 3 / Gemini" />}
      testId="generate-image-dialog"
    >
      {p.open && <Body key={p.purpose} {...p} />}
    </GoogleAiModal>
  );
}

function Body(p: Parameters<typeof GenerateImageDialog>[0]) {
  const [purpose, setPurpose] = useState<Purpose>(p.purpose);
  const [prompt, setPrompt] = useState("");
  const [quality, setQuality] = useState<ImageQuality>(p.purpose === "background" ? "high" : "standard");
  const [aspect, setAspect] = useState<ImageAspect>(() => nearestImageAspect(p.canvas.width, p.canvas.height));
  const [chipTab, setChipTab] = useState<"styles" | "lighting" | "backgrounds">(
    p.purpose === "background" ? "backgrounds" : "styles",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<VideoMeta | null>(null);

  const off = p.gemini !== "ready" && p.gemini !== "fake";
  if (off) return p.gemini === "loading" ? <p className="text-sm text-slate-400 py-6 text-center">Connecting to Google Gemini…</p> : <GeminiKeyCard />;

  const generate = async (fromId?: string) => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const m = await geminiPost<VideoMeta>("/api/ai/image", { prompt, purpose, aspect, quality, fromId });
      setMade(m);
      p.onMade(m);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const cost = money(costOf.image(quality));

  const addChip = (c: { label: string; words: string }) => {
    setPrompt((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return c.words;
      if (trimmed.toLowerCase().includes(c.label.toLowerCase())) return trimmed;
      return `${trimmed}, ${c.words}`;
    });
  };

  return (
    <div className="flex flex-col gap-5" data-testid="generate-image">
      {/* Top Controls: Mode Switcher & Quality Tier */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        {/* Purpose pills */}
        <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1" role="radiogroup" aria-label="Creation Mode">
          <button
            type="button"
            role="radio"
            aria-checked={purpose === "picture"}
            onClick={() => setPurpose("picture")}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all ${
              purpose === "picture"
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-indigo-500/20"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Icon name="image" className="size-3.5" />
            Picture / Overlay
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={purpose === "background"}
            onClick={() => setPurpose("background")}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all ${
              purpose === "background"
                ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md shadow-pink-500/20"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Icon name="gradient" className="size-3.5" />
            Scene Background
          </button>
        </div>

        {/* Quality selector chips */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-400 mr-1 text-[0.6875rem] uppercase tracking-wider font-semibold">Quality:</span>
          {(Object.keys(IMAGE_QUALITY) as ImageQuality[]).map((q) => {
            const active = quality === q;
            return (
              <button
                key={q}
                type="button"
                onClick={() => setQuality(q)}
                className={`rounded-lg border px-2.5 py-1 text-xs transition-all ${
                  active
                    ? "border-indigo-400 bg-indigo-500/20 font-semibold text-white shadow-sm"
                    : "border-white/10 bg-white/[0.02] text-slate-400 hover:text-slate-200"
                }`}
              >
                {IMAGE_QUALITY[q].label}
                <span className="text-[0.625rem] text-slate-400 ml-1 font-normal">{IMAGE_QUALITY[q].size}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Left Column: Visual Prompt Builder */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="flow-prompt-input" className="text-xs font-semibold text-slate-300">
                {made ? "Prompt (Modify or generate anew)" : "Visual Prompt"}
              </label>
              <PromptEnhancerButton prompt={prompt} onEnhanced={(exp) => setPrompt(exp)} type="image" />
            </div>

            <div className="relative rounded-2xl border border-white/10 bg-slate-950/60 p-2.5 shadow-inner focus-within:border-indigo-400/80 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
              <textarea
                id="flow-prompt-input"
                className="w-full min-h-28 resize-y bg-transparent text-sm leading-relaxed text-slate-100 placeholder:text-slate-500 outline-none"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                maxLength={2000}
                placeholder={
                  purpose === "background"
                    ? "e.g. Modern high-tech glass studio with floating neon charts, city view through panoramic windows, cinematic rim lighting..."
                    : "e.g. Cinematic macro shot of a golden pocket watch resting on velvet, dramatic lighting, 8k..."
                }
              />
              <div className="flex items-center justify-between border-t border-white/5 pt-2 text-[0.6875rem] text-slate-400">
                <span>Google Flow Prompt Builder</span>
                <span>{prompt.length} / 2000</span>
              </div>
            </div>
          </div>

          {/* Interactive Style Pills */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300">Inspiration & Keywords</span>
              <div className="flex gap-1 text-[0.6875rem]">
                {(["styles", "lighting", "backgrounds"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setChipTab(t)}
                    className={`rounded px-2 py-0.5 capitalize transition-colors ${
                      chipTab === t ? "bg-white/15 text-white font-medium" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <StyleChipGroup chips={STYLE_CATEGORIES[chipTab]} onSelect={addChip} />
          </div>

          {/* Visual Aspect Ratio Selector */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300">Aspect Ratio</span>
              <span className="text-[0.6875rem] text-slate-400">Project Canvas: {p.canvas.width}×{p.canvas.height}</span>
            </div>
            <AspectTileSelector value={aspect} onChange={setAspect} />
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              disabled={busy || !prompt.trim()}
              onClick={() => void generate()}
              data-testid="generate-image-button"
              className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 hover:brightness-110 active:scale-[0.99] disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {busy ? (
                <>
                  <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Generating with Gemini Flow…
                </>
              ) : (
                <>
                  <span className="text-sm">✨</span>
                  {made ? "Generate Variations" : "Generate Visual"} · {cost}
                </>
              )}
            </button>

            {made && (
              <button
                type="button"
                disabled={busy || !prompt.trim()}
                onClick={() => void generate(made.id)}
                className="rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/[0.1] hover:text-white transition-all"
                title="Feed this picture back with updated prompt guidance"
              >
                Remix This · {cost}
              </button>
            )}
          </div>

          <GeminiNote
            sends={made ? "your prompt words and reference image" : "your prompt words"}
            cost={cost}
            extra="saved directly to My Assets with Google SynthID"
          />

          {error && (
            <Notice tone="error" role="alert">
              {error}
            </Notice>
          )}
        </div>

        {/* Right Column: Generation Canvas & Result Actions */}
        <div className="flex flex-col gap-3">
          <div className="relative flex min-h-64 flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80 p-3 shadow-inner">
            {busy ? (
              <div className="flex flex-col items-center gap-3 text-center p-6" aria-live="polite">
                <div className="relative flex size-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-500 via-indigo-500 to-fuchsia-500 shadow-xl shadow-indigo-500/30 animate-pulse">
                  <span className="text-2xl text-white">✨</span>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-semibold text-slate-100">Creating your visual…</p>
                  <p className="text-xs text-slate-400">Gemini is synthesizing light, texture and composition</p>
                </div>
              </div>
            ) : made ? (
              <div className="flex h-full w-full flex-col gap-3" data-testid="generated-image">
                <div className="relative flex-1 overflow-hidden rounded-xl bg-black/40 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/videos/${made.id}/source`}
                    alt={`Generated by Gemini: ${prompt}`}
                    className="max-h-80 w-full rounded-xl object-contain shadow-2xl"
                  />
                  <div className="absolute top-2 right-2 rounded-md bg-black/60 backdrop-blur-md px-2 py-0.5 text-[0.625rem] text-slate-300 font-mono">
                    {aspect} · SynthID
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-500/20 hover:brightness-110 transition-all flex items-center justify-center gap-1.5"
                    onClick={() => p.onUseAsBackground(made)}
                  >
                    <Icon name="gradient" className="size-3.5" />
                    Set as Background
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-white/15 bg-white/[0.08] px-3 py-2 text-xs font-semibold text-white hover:bg-white/[0.15] transition-all flex items-center justify-center gap-1.5"
                    onClick={() => p.onAddToTimeline(made)}
                  >
                    <Icon name="plus" className="size-3.5" />
                    Add to Timeline
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-center p-6 text-slate-500">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/5 text-slate-400">
                  <Icon name="image" className="size-6" />
                </div>
                <p className="text-xs font-medium text-slate-400">Ready to create</p>
                <p className="text-[0.6875rem] max-w-xs text-slate-400">
                  Enter your prompt or choose keywords on the left to generate imagery with Google Flow.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
