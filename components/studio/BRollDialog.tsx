"use client";

import { useState } from "react";
import { GoogleAiModal } from "@/components/ui/GoogleAiModal";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { nearestImageAspect, type ImageAspect } from "@/lib/ai/shapes";
import { geminiPost, type GeminiUi } from "@/lib/editor/useGemini";
import type { VideoMeta } from "@/lib/videos";
import { GeminiKeyCard } from "./GeminiBits";
import { GoogleGeminiPill } from "./GoogleAiBits";

interface BRollIdea {
  id: string;
  title: string;
  prompt: string;
  category: string;
}

const DEFAULT_IDEAS: BRollIdea[] = [
  { id: "1", title: "Drone Aerial establishing shot", prompt: "Cinematic 4K drone aerial view over mountains at golden hour, crisp sunlight, majestic landscape", category: "Establishing" },
  { id: "2", title: "Close-up reaction & details", prompt: "Macro close-up shot of hands working on an intricate craft, soft bokeh background, dramatic studio lighting", category: "Detail" },
  { id: "3", title: "Atmospheric motion & texture", prompt: "Slow-motion rain droplets splashing on a city window with vibrant neon bokeh lights in the distance", category: "Atmosphere" },
  { id: "4", title: "Technology & modern workspace", prompt: "Futuristic digital holographic workspace with glowing data charts, clean aesthetic, depth of field", category: "Modern" },
];

/**
 * AI B-Roll Generator:
 * Suggests and generates relevant contextual cutaway clips and imagery
 * to enrich video pacing and storytelling.
 */
export function BRollDialog(p: {
  open: boolean;
  onClose: () => void;
  gemini: GeminiUi;
  canvas: { width: number; height: number };
  onAddToTimeline: (m: VideoMeta) => void;
}) {
  const [topic, setTopic] = useState("");
  const [ideas, setIdeas] = useState<BRollIdea[]>(DEFAULT_IDEAS);
  const [selectedPrompt, setSelectedPrompt] = useState(DEFAULT_IDEAS[0].prompt);
  const [busy, setBusy] = useState(false);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<VideoMeta | null>(null);
  const aspect: ImageAspect = nearestImageAspect(p.canvas.width, p.canvas.height);

  const off = p.gemini !== "ready" && p.gemini !== "fake";

  const suggestIdeas = async () => {
    if (!topic.trim() || suggestBusy) return;
    setSuggestBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          topic: `Suggest 4 cinematic visual B-roll cutaway shots for a video about: ${topic}. Give concise visual descriptions.`,
          seconds: 20,
        }),
      });
      const data = await res.json();
      if (data.script) {
        const lines = data.script.split("\n").filter((l: string) => l.trim().length > 10).slice(0, 4);
        if (lines.length > 0) {
          const newIdeas = lines.map((l: string, idx: number) => ({
            id: String(idx + 1),
            title: `B-Roll Scene ${idx + 1}`,
            prompt: l.replace(/^\d+[\.\)]\s*/, "").trim(),
            category: "Contextual",
          }));
          setIdeas(newIdeas);
          setSelectedPrompt(newIdeas[0].prompt);
        }
      }
    } catch {
      /* fallback to defaults */
    } finally {
      setSuggestBusy(false);
    }
  };

  const generateBRoll = async () => {
    if (!selectedPrompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const meta = await geminiPost<VideoMeta>("/api/ai/image", {
        prompt: `Cinematic B-roll cutaway: ${selectedPrompt}`,
        purpose: "picture",
        aspect,
        quality: "high",
      });
      setGenerated(meta);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <GoogleAiModal
      open={p.open}
      onClose={p.onClose}
      size="xl"
      title="Google B-Roll Studio"
      subtitle="Generate contextual cinematic cutaways and stock footage matching your video theme"
      badge={<GoogleGeminiPill label="Gemini Cutaways" />}
      busy={busy}
      busyLabel="Synthesizing B-Roll cutaway…"
      testId="b-roll-dialog"
    >
      {off ? (
        p.gemini === "loading" ? (
          <p className="text-sm text-muted py-6 text-center">Connecting to Google Gemini…</p>
        ) : (
          <GeminiKeyCard />
        )
      ) : (
        <div className="flex flex-col gap-5">
          {/* Topic search / suggest bar */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="b-roll-topic-input" className="text-xs font-semibold text-muted">
              What is your video about?
            </label>
            <div className="flex gap-2">
              <input
                id="b-roll-topic-input"
                className="flex-1 rounded-xl border border-line bg-canvas/80 px-3.5 py-2 text-xs text-ink placeholder:text-muted outline-none focus:border-primary"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Electric sports cars on coastal highway, or artificial intelligence workflow..."
              />
              <button
                type="button"
                disabled={suggestBusy || !topic.trim()}
                onClick={() => void suggestIdeas()}
                className="rounded-xl border border-primary bg-primary/15 px-4 py-2 text-xs font-semibold text-link hover:bg-primary/25 transition-all disabled:opacity-40"
              >
                {suggestBusy ? "Analyzing…" : "✨ Suggest Cutaways"}
              </button>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* Cutaway Suggestions */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted">Select B-Roll Scene Idea</span>
              <div className="flex flex-col gap-2">
                {ideas.map((idea) => {
                  const active = selectedPrompt === idea.prompt;
                  return (
                    <button
                      key={idea.id}
                      type="button"
                      onClick={() => setSelectedPrompt(idea.prompt)}
                      className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all ${
                        active
                          ? "border-primary bg-primary/15 text-ink shadow-md ring-1 ring-primary"
                          : "border-line bg-raised text-muted hover:border-line hover:bg-hover"
                      }`}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="text-xs font-semibold text-white">{idea.title}</span>
                        <span className="rounded bg-raised px-1.5 py-0.5 text-2xs text-muted">
                          {idea.category}
                        </span>
                      </div>
                      <p className="text-2xs text-muted mt-1 line-clamp-2 leading-relaxed">
                        {idea.prompt}
                      </p>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                disabled={busy || !selectedPrompt.trim()}
                onClick={() => void generateBRoll()}
                className="mt-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 hover:brightness-110 active:scale-[0.99] disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                <Icon name="film" className="size-4" />
                {busy ? "Generating B-Roll Cutaway…" : "Generate Selected B-Roll"}
              </button>
            </div>

            {/* Generated Preview & Insert Action */}
            <div className="flex flex-col gap-3 rounded-2xl border border-line bg-canvas/80 p-4 shadow-inner">
              <span className="text-xs font-semibold text-muted">Generated B-Roll Preview</span>
              {generated ? (
                <div className="flex flex-col gap-3">
                  <div className="overflow-hidden rounded-xl bg-black/40 flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/videos/${generated.id}/source`}
                      alt="Generated B-Roll"
                      className="max-h-60 w-full rounded-xl object-contain shadow-md"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      p.onAddToTimeline(generated);
                      p.onClose();
                    }}
                    className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-emerald-600/20 hover:brightness-110 transition-all flex items-center justify-center gap-2"
                  >
                    <Icon name="plus" className="size-4" />
                    Insert as Overlay B-Roll on Timeline
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center text-muted gap-2">
                  <Icon name="film" className="size-8 opacity-40" />
                  <p className="text-xs text-muted">Select an idea and generate to preview B-roll cutaway.</p>
                </div>
              )}
            </div>
          </div>

          {error && <Notice tone="error">{error}</Notice>}
        </div>
      )}
    </GoogleAiModal>
  );
}
