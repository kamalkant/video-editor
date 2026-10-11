"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { VideoMeta } from "@/lib/videos";

const SUGGESTIONS = [
  "Futuristic cyberpunk city at sunset with neon reflections",
  "Photorealistic majestic mountain lake with morning mist",
  "Close-up cinematic portrait of an astronaut with glowing helmet visor",
  "Vintage 1980s retro wave supercar driving into the horizon",
  "Cozy warm coffee shop on a rainy afternoon in Tokyo",
];

export function GrokImagineDialog({
  onClose,
  onAddMedia,
}: {
  onClose: () => void;
  onAddMedia: (meta: VideoMeta) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [type, setType] = useState<"image" | "video">("image");
  const [aspect, setAspect] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VideoMeta | null>(null);

  const generate = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/ai/grok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, type, aspect }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message ?? "Grok Imagine generation failed.");
      }

      setResult(data.media);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="grok-title"
    >
      <div className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl text-neutral-100">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-neutral-800 px-5 py-4 bg-gradient-to-r from-neutral-900 via-neutral-800 to-black">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-black border border-neutral-700 font-bold text-white shadow-inner">
              𝕏
            </span>
            <div>
              <h2 id="grok-title" className="text-base font-bold flex items-center gap-2">
                xAI Grok Imagine
                <span className="rounded bg-neutral-800 px-2 py-0.5 text-[0.6875rem] font-semibold text-neutral-300 border border-neutral-700">
                  Ready
                </span>
              </h2>
              <p className="text-xs text-neutral-400">Generative visuals powered by Grok</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-white"
            aria-label="Close"
          >
            <Icon name="close" className="size-4" />
          </button>
        </header>

        {/* Content */}
        <div className="flex flex-col gap-4 p-5 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="rounded-lg border border-red-500/50 bg-red-950/40 p-3 text-xs text-red-200">
              {error}
            </div>
          )}

          {/* Mode & Aspect */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 rounded-lg border border-neutral-800 bg-neutral-950 p-1">
              <button
                type="button"
                onClick={() => setType("image")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  type === "image" ? "bg-neutral-800 text-white" : "text-neutral-400 hover:text-white"
                }`}
              >
                Picture
              </button>
              <button
                type="button"
                onClick={() => setType("video")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  type === "video" ? "bg-neutral-800 text-white" : "text-neutral-400 hover:text-white"
                }`}
              >
                Video Clip
              </button>
            </div>

            <div className="flex items-center gap-1">
              {(["16:9", "9:16", "1:1"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setAspect(r)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                    aspect === r
                      ? "border-neutral-500 bg-neutral-800 text-white"
                      : "border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-white"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="grok-prompt" className="text-xs font-medium text-neutral-300">
              Prompt description
            </label>
            <textarea
              id="grok-prompt"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your scene or motion in detail..."
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 p-3 text-xs text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              disabled={busy}
            />
          </div>

          {/* Prompt inspiration */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[0.6875rem] font-medium text-neutral-400">Inspiration prompts:</span>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPrompt(s)}
                  className="rounded-full border border-neutral-800 bg-neutral-950 px-2.5 py-1 text-[0.6875rem] text-neutral-400 hover:border-neutral-600 hover:text-neutral-200 transition-colors text-left"
                >
                  {s.slice(0, 36)}…
                </button>
              ))}
            </div>
          </div>

          {/* Result view */}
          {result && (
            <div className="flex flex-col gap-3 rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-3">
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <Icon name="check" className="size-4" />
                Generated successfully with Grok Imagine!
              </span>
              <div className="aspect-video w-full overflow-hidden rounded bg-black flex items-center justify-center">
                {type === "video" ? (
                  <video src={`/api/videos/${result.id}/source`} controls autoPlay loop className="h-full w-full object-contain" />
                ) : (
                  <img src={`/api/videos/${result.id}/source`} alt={prompt} className="h-full w-full object-contain" />
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    onAddMedia(result);
                    onClose();
                  }}
                  className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-neutral-200 shadow"
                >
                  Add to Timeline
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between border-t border-neutral-800 bg-neutral-950 px-5 py-3">
          <span className="text-[0.6875rem] text-neutral-400">Uses your xAI API key (or local simulation)</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={generate}
              disabled={busy || !prompt.trim()}
              className="flex items-center gap-1.5 rounded-md bg-white px-4 py-1.5 text-xs font-semibold text-black hover:bg-neutral-200 disabled:opacity-50"
            >
              {busy ? (
                <>
                  <span className="size-3 animate-spin rounded-full border-2 border-black border-t-transparent" />
                  Generating…
                </>
              ) : (
                <>
                  <Icon name="magic" className="size-3.5" />
                  Generate {type === "video" ? "Video" : "Picture"}
                </>
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
