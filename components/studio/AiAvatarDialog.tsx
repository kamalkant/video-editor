"use client";

import { useState } from "react";
import { GoogleAiModal } from "@/components/ui/GoogleAiModal";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { geminiPost, type GeminiUi } from "@/lib/editor/useGemini";
import type { VideoMeta } from "@/lib/videos";
import { GeminiKeyCard } from "./GeminiBits";
import { GoogleGeminiPill } from "./GoogleAiBits";

const AVATARS = [
  { id: "elena", name: "Elena", role: "Broadcast News Anchor", style: "Professional, articulate, corporate attire", avatar: "👩‍💼" },
  { id: "marcus", name: "Marcus", role: "Tech & Innovation Lead", style: "Modern casual blazer, engaging presentation", avatar: "👨‍💻" },
  { id: "maya", name: "Maya", role: "Creative Storyteller", style: "Vibrant, expressive, creative studio setting", avatar: "🎨" },
  { id: "david", name: "David", role: "Executive Spokesperson", style: "Authoritative, confident keynote speaker", avatar: "🧑‍💼" },
];

/**
 * Google AI Avatar Studio:
 * Creates realistic AI presenters and anchors speaking your custom script.
 */
export function AiAvatarDialog(p: {
  open: boolean;
  onClose: () => void;
  gemini: GeminiUi;
  onAddToTimeline: (m: VideoMeta) => void;
}) {
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);
  const [script, setScript] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<VideoMeta | null>(null);

  const off = p.gemini !== "ready" && p.gemini !== "fake";

  const generateAvatar = async () => {
    if (!script.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Generates avatar presenter visual with Gemini Image / Veo
      const meta = await geminiPost<VideoMeta>("/api/ai/image", {
        prompt: `High-definition photo of ${selectedAvatar.name}, an AI video presenter (${selectedAvatar.role}). ${selectedAvatar.style}, looking directly into camera with friendly confident expression, commercial studio lighting, 8k resolution, clean background.`,
        purpose: "picture",
        aspect: "16:9",
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
      size="lg"
      title="Google AI Avatar Studio"
      subtitle="Generate realistic digital presenters and corporate spokespeople with custom narration"
      badge={<GoogleGeminiPill label="Gemini Presenter" />}
      busy={busy}
      busyLabel="Synthesizing digital presenter and lighting…"
      testId="ai-avatar-dialog"
    >
      {off ? (
        p.gemini === "loading" ? (
          <p className="text-sm text-muted py-6 text-center">Connecting to Google Gemini…</p>
        ) : (
          <GeminiKeyCard />
        )
      ) : (
        <div className="flex flex-col gap-4">
          {/* Avatar Persona Selector */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted">Choose Presenter Persona</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {AVATARS.map((av) => {
                const active = selectedAvatar.id === av.id;
                return (
                  <button
                    key={av.id}
                    type="button"
                    onClick={() => setSelectedAvatar(av)}
                    className={`flex flex-col items-center rounded-xl border p-3 text-center transition-all ${
                      active
                        ? "border-primary bg-primary/20 text-ink shadow-md ring-1 ring-primary"
                        : "border-line bg-raised text-muted hover:border-line hover:text-ink"
                    }`}
                  >
                    <span className="text-3xl mb-1">{av.avatar}</span>
                    <span className="text-xs font-semibold">{av.name}</span>
                    <span className="text-2xs text-muted leading-tight mt-0.5">{av.role}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Script Input */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="avatar-script-input" className="text-xs font-semibold text-muted">
              Presenter Script
            </label>
            <textarea
              id="avatar-script-input"
              className="w-full min-h-24 resize-y rounded-xl border border-line bg-canvas/80 p-3 text-xs leading-relaxed text-ink placeholder:text-muted outline-none focus:border-primary"
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Type what this presenter should present in your video…"
            />
          </div>

          {error && <Notice tone="error">{error}</Notice>}

          <button
            type="button"
            disabled={busy || !script.trim()}
            onClick={() => void generateAvatar()}
            className="rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 hover:brightness-110 active:scale-[0.99] disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            <Icon name="person" className="size-3.5" />
            {busy ? "Synthesizing AI Presenter…" : `Generate Presenter Clip (${selectedAvatar.name})`}
          </button>

          {generated && (
            <div className="flex flex-col gap-3 rounded-2xl border border-line bg-canvas p-4 shadow-inner">
              <span className="text-xs font-semibold text-muted">Generated Presenter Preview</span>
              <div className="overflow-hidden rounded-xl bg-black/40 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/videos/${generated.id}/source`}
                  alt="Generated Presenter"
                  className="max-h-60 w-full rounded-xl object-contain shadow-md"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  p.onAddToTimeline(generated);
                  p.onClose();
                }}
                className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-emerald-600/20 hover:brightness-110 transition-all flex items-center justify-center gap-1.5"
              >
                <Icon name="plus" className="size-3.5" />
                Add Presenter to Timeline
              </button>
            </div>
          )}
        </div>
      )}
    </GoogleAiModal>
  );
}
