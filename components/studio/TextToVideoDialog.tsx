"use client";

import { useState } from "react";
import { GoogleAiModal } from "@/components/ui/GoogleAiModal";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { costOf, money, VEO_DEFAULT, type VeoResolution, type VeoSeconds, type VeoTier } from "@/lib/ai/pricing";
import { veoAspectFor, type ImageAspect } from "@/lib/ai/shapes";
import { geminiPost, type GeminiUi } from "@/lib/editor/useGemini";
import type { VideoMeta } from "@/lib/videos";
import { GeminiKeyCard } from "./GeminiBits";
import { AspectTileSelector, GoogleGeminiPill, PromptEnhancerButton } from "./GoogleAiBits";

/**
 * Text to Video (Script to Studio):
 * Turns scripts, stories and concepts into cinematic video clips powered by Google Veo.
 */
export function TextToVideoDialog(p: {
  open: boolean;
  onClose: () => void;
  gemini: GeminiUi;
  canvas: { width: number; height: number };
  onStarted: (jobId: string) => void;
}) {
  const [script, setScript] = useState("");
  const [tier, setTier] = useState<VeoTier>(VEO_DEFAULT.tier);
  const [resolution, setResolution] = useState<VeoResolution>(VEO_DEFAULT.resolution);
  const [seconds, setSeconds] = useState<VeoSeconds>(VEO_DEFAULT.seconds);
  const [aspect, setAspect] = useState<ImageAspect>(() => veoAspectFor(p.canvas.width, p.canvas.height));
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const off = p.gemini !== "ready" && p.gemini !== "fake";
  const cost = money(costOf.video(tier, resolution, seconds));

  const start = async () => {
    if (!script.trim() || starting) return;
    setStarting(true);
    setError(null);
    try {
      const j = await geminiPost<{ id: string }>("/api/ai/video", {
        prompt: script,
        aspect,
        seconds,
        tier,
        resolution,
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
      size="lg"
      title="Google Text-to-Studio"
      subtitle="Transform descriptive scripts, storyboards, and scenes into cinematic videos with Google Veo 3.1"
      badge={<GoogleGeminiPill label="Google Veo" />}
      busy={starting}
      busyLabel="Initializing Veo video generation…"
      testId="text-to-video-dialog"
    >
      {off ? (
        p.gemini === "loading" ? (
          <p className="text-sm text-muted py-6 text-center">Connecting to Google Gemini…</p>
        ) : (
          <GeminiKeyCard />
        )
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="script-to-video-input" className="text-xs font-semibold text-muted">
                Scene Script / Visual Description
              </label>
              <PromptEnhancerButton prompt={script} onEnhanced={(exp) => setScript(exp)} type="video" />
            </div>

            <div className="relative rounded-2xl border border-line bg-canvas/60 p-3 shadow-inner focus-within:border-primary focus-within:ring-2 focus-within:ring-primary transition-all">
              <textarea
                id="script-to-video-input"
                className="w-full min-h-32 resize-y bg-transparent text-sm leading-relaxed text-ink placeholder:text-muted outline-none"
                value={script}
                onChange={(e) => setScript(e.target.value)}
                maxLength={2000}
                placeholder="e.g. Drone camera sweeps over misty redwood trees at sunrise, golden sunlight filtering through fog, 4k cinematic lighting, ultra-realistic..."
              />
              <div className="flex items-center justify-between border-t border-line pt-2 text-2xs text-muted">
                <span>Veo Generative Storyboard</span>
                <span>{script.length} / 2000</span>
              </div>
            </div>
          </div>

          {/* Aspect Ratio */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted">Target Framing</span>
            <AspectTileSelector value={aspect} onChange={setAspect} />
          </div>

          {/* Duration & Resolution */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted">Duration</label>
              <div className="flex gap-1.5">
                {([4, 6, 8] as VeoSeconds[]).map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setSeconds(sec)}
                    className={`flex-1 rounded-xl border py-2 text-xs font-semibold transition-all ${
                      seconds === sec
                        ? "border-primary bg-primary/20 text-white shadow-sm"
                        : "border-line bg-raised text-muted hover:text-ink"
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted">Resolution</label>
              <div className="flex gap-1.5">
                {(["720p", "1080p"] as VeoResolution[]).map((res) => (
                  <button
                    key={res}
                    type="button"
                    onClick={() => setResolution(res)}
                    className={`flex-1 rounded-xl border py-2 text-xs font-semibold transition-all ${
                      resolution === res
                        ? "border-primary bg-primary/20 text-white shadow-sm"
                        : "border-line bg-raised text-muted hover:text-ink"
                    }`}
                  >
                    {res}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && <Notice tone="error">{error}</Notice>}

          <div className="pt-2">
            <button
              type="button"
              disabled={starting || !script.trim()}
              onClick={() => void start()}
              className="w-full rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 hover:brightness-110 active:scale-[0.99] disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {starting ? (
                <>
                  <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Sending to Veo Pipeline…
                </>
              ) : (
                <>
                  <Icon name="film" className="size-4" />
                  Generate Video with Veo · {cost}
                </>
              )}
            </button>
            <p className="mt-2 text-center text-2xs text-muted">
              Generates in background (1–3 min). Once started, your video automatically appears in My Assets.
            </p>
          </div>
        </div>
      )}
    </GoogleAiModal>
  );
}
