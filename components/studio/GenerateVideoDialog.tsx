"use client";

import { useEffect, useRef, useState } from "react";
import { GoogleAiModal } from "@/components/ui/GoogleAiModal";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { costOf, money, VEO_DEFAULT, VEO_PRICE, VEO_TIERS, veoSecondsFor, type VeoResolution, type VeoSeconds, type VeoTier } from "@/lib/ai/pricing";
import { veoAspectFor, type ImageAspect } from "@/lib/ai/shapes";
import { geminiPost, type GeminiUi } from "@/lib/editor/useGemini";
import type { VeoView } from "@/lib/editor/useVeoJob";
import { formatTime } from "@/lib/format";
import type { VideoMeta } from "@/lib/videos";
import { GeminiKeyCard } from "./GeminiBits";
import { AspectTileSelector, GoogleGeminiPill, PromptEnhancerButton } from "./GoogleAiBits";

const CAMERA_MOTIONS = [
  { id: "pan-left", label: "Pan Left", cue: "slow cinematic pan left" },
  { id: "pan-right", label: "Pan Right", cue: "smooth pan right" },
  { id: "tilt-up", label: "Tilt Up", cue: "dramatic vertical tilt up" },
  { id: "tilt-down", label: "Tilt Down", cue: "slow tilt down" },
  { id: "zoom-in", label: "Zoom In", cue: "gradual push-in zoom" },
  { id: "zoom-out", label: "Zoom Out", cue: "slow pull-out zoom" },
  { id: "drone", label: "FPV Drone", cue: "sweeping dynamic drone flyover" },
  { id: "orbit", label: "Orbital", cue: "360 orbital camera rotation" },
  { id: "handheld", label: "Handheld", cue: "natural handheld documentary camera motion" },
  { id: "static", label: "Static Tripod", cue: "locked-off static tripod shot" },
];

const STYLE_PRESETS = [
  { id: "film35", label: "35mm Film", cue: "shot on 35mm film, anamorphic lens, subtle grain" },
  { id: "drone-view", label: "Drone Aerial", cue: "ultra-wide cinematic aerial photography, 4k" },
  { id: "hyperlapse", label: "Hyperlapse", cue: "fast-motion hyperlapse, motion blur streaks" },
  { id: "commercial", label: "Commercial 4K", cue: "clean studio commercial lighting, shallow depth of field" },
  { id: "cyberpunk", label: "Cyberpunk", cue: "volumetric neon lighting, rainy reflective surfaces" },
  { id: "golden-hour", label: "Golden Hour", cue: "warm golden hour sunset lighting, soft lens flare" },
  { id: "vintage16", label: "Vintage 16mm", cue: "vintage 16mm kodachrome, nostalgic color palette" },
];

/**
 * Google Veo 3.1 Studio (Flagship 2-Column Video Generation Experience)
 * Supports Text-to-Video and Animate Image (Image-to-Video) with director-level
 * camera motion chips, visual aspect ratio tiles, and instant timeline placement.
 */
export function GenerateVideoDialog(p: {
  open: boolean;
  onClose: () => void;
  gemini: GeminiUi;
  canvas: { width: number; height: number };
  pictures: VideoMeta[];
  job: VeoView | null;
  onStarted: (jobId: string) => void;
  onAddToTimeline: (m: VideoMeta, atPlayhead?: boolean) => void;
  onNew: () => void;
}) {
  return (
    <GoogleAiModal
      open={p.open}
      onClose={p.onClose}
      size="xl"
      title="Google Veo Studio"
      subtitle="Generate high-definition cinematic video with natural audio powered by Google Veo 3.1"
      badge={<GoogleGeminiPill label="Veo 3.1 / Gemini" />}
      busy={p.job?.state === "working"}
      busyLabel="Veo is generating your video clip…"
      testId="generate-video-dialog"
    >
      {p.open && <Body {...p} />}
    </GoogleAiModal>
  );
}

function Elapsed({ from }: { from: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <>{formatTime(Math.max(0, (now - from) / 1000))}</>;
}

function Body(p: Parameters<typeof GenerateVideoDialog>[0]) {
  const [mode, setMode] = useState<"text" | "image">("text");
  const [prompt, setPrompt] = useState("");
  const [tier, setTier] = useState<VeoTier>(VEO_DEFAULT.tier);
  const [resolution, setResolution] = useState<VeoResolution>(VEO_DEFAULT.resolution);
  const [seconds, setSeconds] = useState<VeoSeconds>(VEO_DEFAULT.seconds);
  const [startId, setStartId] = useState<string>("");
  const [aspect, setAspect] = useState<ImageAspect>(() => veoAspectFor(p.canvas.width, p.canvas.height));
  const [motionStrength, setMotionStrength] = useState<"subtle" | "natural" | "dynamic">("natural");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const off = p.gemini !== "ready" && p.gemini !== "fake";
  if (off) return p.gemini === "loading" ? <p className="text-sm text-slate-400 py-6 text-center">Checking Gemini…</p> : <GeminiKeyCard />;

  const job = p.job;
  const secs = veoSecondsFor(resolution);
  const len = secs.includes(seconds) ? seconds : secs[secs.length - 1];
  const cost = money(costOf.video(tier, resolution, len));

  const appendCue = (cue: string) => {
    setPrompt((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return cue;
      if (trimmed.toLowerCase().includes(cue.toLowerCase())) return trimmed;
      return `${trimmed}, ${cue}`;
    });
  };

  const start = async () => {
    if (!prompt.trim() || starting) return;
    setStarting(true);
    setError(null);
    try {
      let finalPrompt = prompt.trim();
      if (mode === "image" && motionStrength !== "natural") {
        finalPrompt += `, ${motionStrength} motion`;
      }
      const j = await geminiPost<{ id: string }>("/api/ai/video", {
        prompt: finalPrompt,
        aspect,
        seconds: len,
        tier,
        resolution,
        startImageId: mode === "image" && startId ? startId : null,
      });
      p.onStarted(j.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  const imageAssets = p.pictures.filter((m) => m.kind === "image");
  const selectedImageMeta = imageAssets.find((m) => m.id === startId);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12" data-testid="generate-video">
      {/* LEFT COLUMN: Controls & Prompt Studio */}
      <div className="flex flex-col gap-4 lg:col-span-7">
        {/* Mode Switcher */}
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="inline-flex rounded-xl bg-slate-900/80 p-1 border border-white/10">
            <button
              type="button"
              onClick={() => setMode("text")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                mode === "text"
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Icon name="text" className="size-3.5" />
              <span>Text to Video</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("image");
                if (!startId && imageAssets.length > 0) setStartId(imageAssets[0].id);
              }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                mode === "image"
                  ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Icon name="image" className="size-3.5" />
              <span>Animate Image</span>
            </button>
          </div>

          <div className="flex items-center gap-1 text-[0.6875rem] text-slate-400">
            <span className="font-mono text-indigo-400">Veo 3.1</span>
            <span>· High-Definition Motion</span>
          </div>
        </div>

        {/* Animate Image: Visual Image Selector */}
        {mode === "image" && (
          <div className="flex flex-col gap-2 rounded-xl border border-purple-500/20 bg-purple-950/20 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-purple-200">Starting Picture to Animate</span>
              <span className="text-[0.6875rem] text-slate-400">
                {imageAssets.length} image{imageAssets.length === 1 ? "" : "s"} in project
              </span>
            </div>

            {imageAssets.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">
                No images in project yet. Import an image in My Assets to animate it with Veo.
              </p>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1.5 scrollbar-thin">
                {imageAssets.map((img) => {
                  const active = startId === img.id;
                  return (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => setStartId(img.id)}
                      className={`group relative flex-shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                        active
                          ? "border-pink-500 shadow-md shadow-pink-500/20 scale-105"
                          : "border-white/10 opacity-70 hover:opacity-100 hover:border-white/30"
                      }`}
                    >
                      <img
                        src={`/api/videos/${img.id}/poster`}
                        alt={img.fileName}
                        className="w-full h-full object-cover"
                      />
                      {active && (
                        <div className="absolute top-1 right-1 rounded-full bg-pink-500 p-0.5 text-white">
                          <Icon name="check" className="size-2.5" strokeWidth={3} />
                        </div>
                      )}
                      <span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-1 py-0.5 text-[0.5625rem] text-slate-200">
                        {img.fileName}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Motion Dynamics */}
            <div className="flex items-center justify-between pt-1 border-t border-white/5 text-xs">
              <span className="text-slate-400">Camera Dynamics:</span>
              <div className="flex gap-1">
                {(["subtle", "natural", "dynamic"] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setMotionStrength(lvl)}
                    className={`rounded px-2 py-0.5 text-[0.6875rem] font-medium capitalize transition-all ${
                      motionStrength === lvl
                        ? "bg-purple-600 text-white"
                        : "bg-white/5 text-slate-400 hover:text-white"
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Prompt Input Box */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="veo-prompt" className="text-xs font-semibold text-slate-200">
              {mode === "image" ? "Describe how this scene animates" : "Describe the video scene"}
            </label>
            <PromptEnhancerButton prompt={prompt} onEnhanced={(p) => setPrompt(p)} type="video" />
          </div>

          <div className="relative rounded-2xl border border-white/10 bg-slate-950/60 p-3 shadow-inner focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
            <textarea
              id="veo-prompt"
              className="w-full min-h-24 resize-y bg-transparent text-sm leading-relaxed text-slate-100 placeholder:text-slate-500 outline-none"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={2000}
              placeholder={
                mode === "image"
                  ? "e.g. Water flows gently over the rocks, sun rays shift through the mist, cinematic slow camera zoom..."
                  : "e.g. Slow cinematic drone shot gliding through Tokyo streets in rain at dusk, neon reflections on wet asphalt, authentic city soundscape..."
              }
            />
            <div className="flex items-center justify-between border-t border-white/5 pt-2 text-[0.6875rem] text-slate-400">
              <span className="flex items-center gap-1">
                <Icon name="ai" className="size-3 text-indigo-400" />
                Veo Prompt Builder
              </span>
              <span>{prompt.length} / 2000</span>
            </div>
          </div>
        </div>

        {/* Camera Motion Chips */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-slate-400">
            Director Camera Motion
          </span>
          <div className="flex flex-wrap gap-1.5">
            {CAMERA_MOTIONS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => appendCue(m.cue)}
                className="group flex items-center gap-1 rounded-lg border border-white/10 bg-slate-900/60 px-2 py-1 text-xs text-slate-300 transition-all hover:border-indigo-500/50 hover:bg-indigo-950/30 hover:text-white active:scale-95"
              >
                <span className="text-indigo-400 transition-transform group-hover:scale-110">+</span>
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Cinematic Style Chips */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-slate-400">
            Cinematic Style & Atmosphere
          </span>
          <div className="flex flex-wrap gap-1.5">
            {STYLE_PRESETS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => appendCue(s.cue)}
                className="group flex items-center gap-1 rounded-lg border border-white/10 bg-slate-900/60 px-2 py-1 text-xs text-slate-300 transition-all hover:border-purple-500/50 hover:bg-purple-950/30 hover:text-white active:scale-95"
              >
                <span className="text-purple-400 transition-transform group-hover:scale-110">+</span>
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Aspect Ratio Tiles */}
        <AspectTileSelector
          value={aspect}
          onChange={setAspect}
          className="pt-1 border-t border-white/5"
        />

        {/* Quality Tier & Duration Grid */}
        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-white/5">
          {/* Quality Tier */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-300">Model Tier</span>
            <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Quality">
              {VEO_TIERS.map((t) => {
                const active = tier === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setTier(t.id)}
                    className={`flex flex-col items-center justify-center rounded-xl border p-2 text-xs transition-all ${
                      active
                        ? "border-indigo-500 bg-indigo-950/40 text-white shadow-sm"
                        : "border-white/10 bg-slate-900/40 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <span className="font-semibold">{t.label}</span>
                    <span className="text-[0.625rem] text-slate-400">
                      ${VEO_PRICE[t.id][resolution].toFixed(2)}/s
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Duration Pills */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-300">Length & Resolution</span>
            <div className="flex gap-1.5">
              {secs.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeconds(s)}
                  className={`flex-1 rounded-xl border py-2 text-xs font-medium transition-all ${
                    len === s
                      ? "border-indigo-500 bg-indigo-950/40 text-white shadow-sm"
                      : "border-white/10 bg-slate-900/40 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {s}s
                </button>
              ))}
              <select
                aria-label="Resolution"
                className="rounded-xl border border-white/10 bg-slate-900/80 px-2 py-1 text-xs text-slate-200 outline-none"
                value={resolution}
                onChange={(e) => setResolution(e.target.value as VeoResolution)}
              >
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
              </select>
            </div>
          </div>
        </div>

        {/* Generate Action Button */}
        <button
          type="button"
          disabled={starting || !prompt.trim() || job?.state === "working"}
          onClick={() => void start()}
          data-testid="generate-video-button"
          className="group relative flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40 hover:brightness-110 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none"
        >
          <Icon name="ai" className="size-4 transition-transform group-hover:rotate-12" />
          <span>{starting ? "Starting Veo Engine…" : `Generate Video · ${cost}`}</span>
        </button>

        <p className="text-[0.6875rem] text-slate-400 text-center">
          Sends your scene prompt to Google Veo 3.1 · {cost} billed to your Google Gemini account · Watermarked with Google SynthID
        </p>

        {error && (
          <Notice tone="error" role="alert">
            {error}
          </Notice>
        )}
      </div>

      {/* RIGHT COLUMN: Interactive Canvas & Video Player */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4 lg:col-span-5 flex-1 min-h-[380px]">
        {job?.state === "working" ? (
          <div
            className="flex flex-1 flex-col items-center justify-center gap-4 text-center p-6"
            data-testid="veo-working"
            aria-live="polite"
          >
            <div className="relative flex size-20 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-indigo-500/20" />
              <span className="size-16 animate-spin rounded-full border-4 border-indigo-500/20 border-t-indigo-400" />
              <Icon name="ai" className="size-8 text-indigo-400" />
            </div>

            <div className="flex flex-col gap-1">
              <h4 className="text-base font-semibold text-slate-100">Veo is generating your video</h4>
              <p className="font-mono text-sm text-indigo-300">
                Elapsed: <strong className="tabular-nums"><Elapsed from={job.startedAt} /></strong>
              </p>
            </div>

            <div className="rounded-xl border border-white/5 bg-slate-900/60 p-3 max-w-sm">
              <p className="text-xs text-slate-300 italic line-clamp-3">“{job.prompt}”</p>
            </div>

            <div className="rounded-xl border border-blue-500/20 bg-blue-950/20 p-3 text-left">
              <p className="text-xs text-blue-200 font-medium">✦ Background Generation Active</p>
              <p className="text-[0.6875rem] text-slate-400 mt-1">
                Veo rendering takes ~1 to 3 minutes. You can safely close this window and continue editing; your clip will automatically land in My Assets and the timeline when ready.
              </p>
            </div>
          </div>
        ) : job?.state === "ready" && job.media ? (
          <div className="flex flex-1 flex-col gap-3" data-testid="veo-ready">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                <Icon name="check" className="size-4" strokeWidth={3} />
                Video Generated Successfully
              </span>
              <span className="text-[0.6875rem] font-mono text-slate-400">
                {resolution} · {len}s
              </span>
            </div>

            {/* Video Player */}
            <div className="relative flex-1 overflow-hidden rounded-xl border border-white/10 bg-black flex items-center justify-center">
              <video
                src={`/api/videos/${job.media.id}/source`}
                controls
                autoPlay
                loop
                playsInline
                className="max-h-[320px] w-full object-contain"
                data-testid="veo-result"
              />
            </div>

            {/* Placement Action Buttons */}
            <div className="flex flex-col gap-2 pt-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-500 active:scale-95 transition-all"
                  onClick={() => p.onAddToTimeline(job.media!, true)}
                >
                  <Icon name="play" className="size-3.5" />
                  <span>Insert at Playhead</span>
                </button>
                <button
                  type="button"
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 active:scale-95 transition-all"
                  onClick={() => p.onAddToTimeline(job.media!, false)}
                >
                  <Icon name="plus" className="size-3.5" />
                  <span>Add to End of Video 1</span>
                </button>
              </div>

              <button
                type="button"
                className="flex items-center justify-center gap-1.5 rounded-xl border border-white/5 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-all"
                onClick={p.onNew}
              >
                <span>Make Another Video</span>
              </button>
            </div>

            <p className="text-[0.625rem] text-slate-500 text-center">
              Saved in My Assets with audio. Verified with Google SynthID metadata.
            </p>
          </div>
        ) : (
          /* IDLE PREVIEW CANVAS */
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center p-6 text-slate-400">
            <div className="flex size-16 items-center justify-center rounded-2xl border border-white/10 bg-slate-900/60 shadow-inner">
              <Icon name="film" className="size-8 text-indigo-400/80" />
            </div>

            <div className="flex flex-col gap-1 max-w-xs">
              <h4 className="text-sm font-semibold text-slate-200">Google Veo 3.1 Video Canvas</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Describe a visual concept or select an image to animate on the left. Click director chips to add camera dynamics.
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-1.5 rounded-xl border border-white/5 bg-slate-900/40 p-3 text-left w-full text-[0.6875rem]">
              <span className="font-semibold text-slate-300">💡 Director Tips:</span>
              <p className="text-slate-400">
                • Use camera motions like <em>FPV Drone</em> or <em>Orbital</em> for dynamic motion.
              </p>
              <p className="text-slate-400">
                • Specify lighting terms like <em>Golden hour</em> or <em>Volumetric fog</em>.
              </p>
              <p className="text-slate-400">
                • Click <em>✨ Enhance prompt</em> to turn simple keywords into vivid cinematography.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
