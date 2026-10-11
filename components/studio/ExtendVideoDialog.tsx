"use client";

import { useState } from "react";
import { GoogleAiModal } from "@/components/ui/GoogleAiModal";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import type { MainClip } from "@/lib/edit/doc";
import { geminiPost, type GeminiUi } from "@/lib/editor/useGemini";
import { GeminiKeyCard } from "./GeminiBits";
import { GoogleGeminiPill } from "./GoogleAiBits";

/**
 * Google Extend Studio:
 * Seamlessly generates continuous additional seconds for an existing video clip
 * using Google Veo video extrapolation.
 */
export function ExtendVideoDialog(p: {
  open: boolean;
  onClose: () => void;
  clip: MainClip | null;
  gemini: GeminiUi;
  onStarted: (jobId: string) => void;
}) {
  const [continuationPrompt, setContinuationPrompt] = useState("");
  const [extensionSec, setExtensionSec] = useState<4 | 6 | 8>(4);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const off = p.gemini !== "ready" && p.gemini !== "fake";

  const startExtension = async () => {
    if (!continuationPrompt.trim() || starting) return;
    setStarting(true);
    setError(null);
    try {
      const j = await geminiPost<{ id: string }>("/api/ai/video", {
        prompt: `Continuation of scene: ${continuationPrompt}`,
        aspect: "16:9",
        seconds: extensionSec,
        tier: "fast",
        resolution: "720p",
      });
      p.onStarted(j.id);
      p.onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  return (
    <GoogleAiModal
      open={p.open}
      onClose={p.onClose}
      size="md"
      title="Google Extend Video"
      subtitle="Extend the duration of your scene seamlessly with Veo generative video continuation"
      badge={<GoogleGeminiPill label="Veo Extender" />}
      busy={starting}
      busyLabel="Initiating Veo continuation pipeline…"
      testId="extend-video-dialog"
    >
      {off ? (
        p.gemini === "loading" ? (
          <p className="text-sm text-slate-400 py-6 text-center">Connecting to Google Gemini…</p>
        ) : (
          <GeminiKeyCard />
        )
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="extend-prompt-input" className="text-xs font-semibold text-slate-300">
              How should the action continue?
            </label>
            <textarea
              id="extend-prompt-input"
              className="w-full min-h-24 resize-y rounded-xl border border-white/10 bg-slate-950/80 p-3 text-xs leading-relaxed text-slate-100 placeholder:text-slate-500 outline-none focus:border-indigo-400"
              value={continuationPrompt}
              onChange={(e) => setContinuationPrompt(e.target.value)}
              placeholder="e.g. Continue panning smoothly across the horizon, camera follows the subject moving forward..."
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-300">Additional Duration</span>
            <div className="flex gap-2">
              {([4, 6, 8] as const).map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setExtensionSec(sec)}
                  className={`flex-1 rounded-xl border py-2 text-xs font-semibold transition-all ${
                    extensionSec === sec
                      ? "border-indigo-400 bg-indigo-500/20 text-white shadow-sm"
                      : "border-white/10 bg-white/[0.02] text-slate-400 hover:text-white"
                  }`}
                >
                  +{sec} Seconds
                </button>
              ))}
            </div>
          </div>

          {error && <Notice tone="error">{error}</Notice>}

          <button
            type="button"
            disabled={starting || !continuationPrompt.trim()}
            onClick={() => void startExtension()}
            className="rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 hover:brightness-110 active:scale-[0.99] disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            <Icon name="resize" className="size-3.5" />
            {starting ? "Starting Veo Extension…" : `Extend Video by +${extensionSec}s with Veo`}
          </button>
        </div>
      )}
    </GoogleAiModal>
  );
}
