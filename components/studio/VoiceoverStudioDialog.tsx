"use client";

import { useEffect, useRef, useState } from "react";
import { GoogleAiModal } from "@/components/ui/GoogleAiModal";
import { Icon } from "@/components/ui/Icon";
import { LabeledSlider } from "@/components/ui/LabeledSlider";
import { Notice } from "@/components/ui/Notice";
import { uploadVideo } from "@/lib/api/upload";
import type { VideoMeta } from "@/lib/api/types";
import { costOf, money } from "@/lib/ai/pricing";
import { GEMINI_VOICES, VOICE_STYLES } from "@/lib/ai/voices";
import { useGemini } from "@/lib/editor/useGemini";
import { useServerCaps } from "@/lib/editor/useServerCaps";
import { formatTime } from "@/lib/format";
import { useRecorder } from "@/lib/record/useRecorder";
import { GeminiBadge, GeminiKeyCard, GeminiNote } from "./GeminiBits";
import { AudioWaveformCanvas, GoogleGeminiPill } from "./GoogleAiBits";

type StudioTab = "tts" | "mic";
type Engine = "mac" | "gemini";
const ENGINE_KEY = "VDO:tts-engine";

const readEngine = (): Engine => {
  try {
    return localStorage.getItem(ENGINE_KEY) === "mac" ? "mac" : "gemini";
  } catch {
    return "gemini";
  }
};

type MacVoice = { name: string; locale: string; sample: string };
const LOCALE: Record<string, string> = {
  en_IN: "English (India)",
  hi_IN: "Hindi",
  en_US: "English (US)",
  en_GB: "English (UK)",
  en_AU: "English (Australia)",
  en_IE: "English (Ireland)",
  en_ZA: "English (South Africa)",
  en_SC: "English (Scotland)",
};

const VOICE_PERSONAS: Record<
  string,
  { category: string; description: string; avatar: string }
> = {
  Puck: {
    category: "Warm & Friendly",
    description: "Approachable, conversational narrator",
    avatar: "🎙️",
  },
  Kore: {
    category: "Warm & Friendly",
    description: "Gentle, reassuring, clear feminine tone",
    avatar: "✨",
  },
  Fenrir: {
    category: "Warm & Friendly",
    description: "Warm, grounded, relaxed baritone",
    avatar: "🎧",
  },
  Aoede: {
    category: "Authoritative News",
    description: "Crisp, articulate broadcast anchor",
    avatar: "📰",
  },
  Charon: {
    category: "Authoritative News",
    description: "Deep, commanding, documentary narrator",
    avatar: "🎬",
  },
  Leda: {
    category: "Dynamic & Energetic",
    description: "Upbeat, lively, modern presenter",
    avatar: "⚡",
  },
  Zephyr: {
    category: "Dynamic & Energetic",
    description: "Engaging, enthusiastic tech reviewer",
    avatar: "🚀",
  },
  Orus: {
    category: "Storyteller & Deep",
    description: "Cinematic, rich, emotional storyteller",
    avatar: "📖",
  },
  Castor: {
    category: "Storyteller & Deep",
    description: "Poised, resonant, timeless narrator",
    avatar: "🌌",
  },
};

/**
 * Google Voiceover Studio:
 * Unified Google-style Voiceover and TTS suite combining Gemini Neural Voices,
 * voice emotion tuning, live microphone recording with audio visualizer,
 * and intelligent Gemini Teleprompter script generation.
 */
export function VoiceoverStudioDialog({
  open,
  onClose,
  onAdd,
  initialMode = "tts",
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (m: VideoMeta) => void;
  initialMode?: StudioTab;
}) {
  const [tab, setTab] = useState<StudioTab>(initialMode);

  return (
    <GoogleAiModal
      open={open}
      onClose={onClose}
      size="xl"
      title="Google Voiceover Studio"
      subtitle="Craft professional spoken voiceovers with Gemini neural speech or record live narration with an AI teleprompter"
      badge={<GoogleGeminiPill label="Gemini Audio" />}
      testId="voiceover-studio-dialog"
    >
      <div className="flex flex-col gap-5">
        {/* Top Tab Bar */}
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div
            className="inline-flex rounded-xl border border-line bg-raised p-1"
            role="tablist"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "tts"}
              onClick={() => setTab("tts")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
                tab === "tts"
                  ? "bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/20"
                  : "text-muted hover:text-ink"
              }`}
            >
              <Icon name="voice" className="size-4" />✦ AI Text-to-Speech
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "mic"}
              onClick={() => setTab("mic")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
                tab === "mic"
                  ? "bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 text-white shadow-md shadow-pink-500/20"
                  : "text-muted hover:text-ink"
              }`}
            >
              <Icon name="mic" className="size-4" />
              🎙️ Record Mic Voiceover
            </button>
          </div>

          <span className="text-2xs text-muted">
            {tab === "tts"
              ? "30 Gemini neural voices in 130+ languages"
              : "Real-time waveform · Teleprompter"}
          </span>
        </div>

        {tab === "tts" ? (
          <TtsStudioSection
            onAdd={(m) => {
              onAdd(m);
              onClose();
            }}
          />
        ) : (
          <MicVoiceoverSection
            onAdd={(m) => {
              onAdd(m);
              onClose();
            }}
          />
        )}
      </div>
    </GoogleAiModal>
  );
}

// -------------------------------------------------------------
// SECTION 1: AI Text-to-Speech (Gemini & Mac Voices)
// -------------------------------------------------------------
function TtsStudioSection({ onAdd }: { onAdd: (m: VideoMeta) => void }) {
  const gemini = useGemini();
  const [chosen, setEngineState] = useState<Engine>(readEngine);
  // a server without the Mac's voices (Linux hosting) uses Gemini's
  const { macVoices: macHere } = useServerCaps();
  const engine: Engine = macHere ? chosen : "gemini";
  const setEngine = (e: Engine) => {
    setEngineState(e);
    try {
      localStorage.setItem(ENGINE_KEY, e);
    } catch {
      /* not saved */
    }
  };

  const [macVoices, setMacVoices] = useState<MacVoice[] | null>(null);
  const [macVoice, setMacVoice] = useState("");
  const [gVoice, setGVoice] = useState("Kore");
  const [text, setText] = useState("");
  const [style, setStyle] = useState("");
  const [rate, setRate] = useState(175);
  const [busy, setBusy] = useState(false);
  const [scriptBusy, setScriptBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ key: string; meta: VideoMeta } | null>(
    null,
  );

  const geminiOff =
    engine === "gemini" && gemini !== "ready" && gemini !== "fake";
  const key = JSON.stringify(
    engine === "gemini"
      ? ["g", text.trim(), gVoice, style.trim()]
      : [text.trim(), macVoice, rate],
  );

  useEffect(() => {
    let alive = true;
    void fetch("/api/tts/voices")
      .then(async (r) => {
        const j = await r.json();
        if (!alive) return;
        if (r.ok) {
          setMacVoices(j.voices);
          setMacVoice((v) => v || (j.voices[0]?.name ?? ""));
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const draftScript = async (action: "generate" | "polish") => {
    if (scriptBusy) return;
    setScriptBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          topic: text,
          text,
          tone: style || "engaging and natural for video narration",
          seconds: 20,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data?.error?.message ?? "Couldn't draft script.");
      if (data.script) setText(data.script);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScriptBusy(false);
    }
  };

  const make = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body =
        engine === "gemini"
          ? { engine, text, voice: gVoice, style }
          : { text, voice: macVoice, rate };
      const r = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok)
        throw new Error(j?.error?.message ?? "Couldn't generate voiceover.");
      setMade({ key, meta: j as VideoMeta });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const fresh = made?.key === key ? made.meta : null;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const estimatedSeconds = Math.round(wordCount / (rate / 60));

  return (
    <div className="flex flex-col gap-4">
      {/* Engine Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex gap-2"
          role="radiogroup"
          aria-label="Speech Engine"
        >
          <button
            type="button"
            role="radio"
            aria-checked={engine === "gemini"}
            onClick={() => setEngine("gemini")}
            className={`flex items-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs transition-all ${
              engine === "gemini"
                ? "border-primary bg-primary/15 font-semibold text-white shadow-sm ring-1 ring-primary"
                : "border-line bg-raised text-muted hover:text-ink"
            }`}
          >
            <span>✦ Google Gemini Neural Voices</span>
            <span className="rounded bg-primary/20 px-1.5 py-px text-2xs text-link">
              130+ Languages
            </span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={engine === "mac"}
            onClick={() => setEngine("mac")}
            disabled={!macHere}
            title={macHere ? undefined : "Mac voices need the ViPlay app on a Mac. Gemini voices work here."}
            className={`flex items-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
              engine === "mac"
                ? "border-line bg-slate-500/20 font-semibold text-white shadow-sm"
                : "border-line bg-raised text-muted hover:text-ink"
            }`}
          >
            <span>Mac System Voices</span>
            <span className="rounded bg-raised px-1.5 py-px text-2xs text-muted">
              {macHere ? "Offline & Free" : "Needs the Mac app"}
            </span>
          </button>
        </div>

        {engine === "gemini" && (
          <span className="text-xs text-link font-medium">
            Estimated Cost: {money(costOf.voice(text.trim().length))}
          </span>
        )}
      </div>

      {geminiOff && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
          {gemini === "loading" ? (
            <p className="text-xs text-muted">Connecting to Gemini…</p>
          ) : (
            <GeminiKeyCard />
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Left Column: Script Editor & Gemini Script Tools */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <label
              htmlFor="tts-script-box"
              className="text-xs font-semibold text-muted"
            >
              Voiceover Script
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={scriptBusy || !text.trim()}
                onClick={() => void draftScript("polish")}
                className="inline-flex items-center gap-1 rounded-md border border-line bg-raised px-2 py-0.5 text-2xs text-muted hover:border-primary hover:text-ink transition-all disabled:opacity-40"
                title="Gemini polishes sentence structure and pauses for natural spoken delivery"
              >
                ✨ Polish with Gemini
              </button>
              <button
                type="button"
                disabled={scriptBusy}
                onClick={() => void draftScript("generate")}
                className="inline-flex items-center gap-1 rounded-md border border-primary bg-primary/10 px-2 py-0.5 text-2xs text-link hover:bg-primary/20 hover:text-ink transition-all disabled:opacity-40"
                title="Gemini drafts a compelling voiceover script from your topic"
              >
                ✨ Draft script
              </button>
            </div>
          </div>

          <div className="relative rounded-2xl border border-line bg-canvas/60 p-3 shadow-inner focus-within:border-primary focus-within:ring-2 focus-within:ring-primary transition-all">
            <textarea
              id="tts-script-box"
              className="w-full min-h-36 resize-y bg-transparent text-sm leading-relaxed text-ink placeholder:text-muted outline-none"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={5000}
              placeholder="Type or paste your voiceover script here, or click 'Draft script' to have Gemini write one for you…"
            />
            <div className="flex items-center justify-between border-t border-line pt-2 text-2xs text-muted">
              <span>
                {wordCount} words · ~{estimatedSeconds}s duration
              </span>
              <span>{text.length} / 5000</span>
            </div>
          </div>

          {/* Delivery Style & Emotion */}
          {engine === "gemini" ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted">
                  Tone & Delivery Style
                </span>
                <span className="text-2xs text-muted">
                  Tell Gemini how to say it
                </span>
              </div>
              <input
                className="rounded-xl border border-line bg-canvas/60 px-3 py-2 text-xs text-ink placeholder:text-muted outline-none focus:border-primary"
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                maxLength={200}
                placeholder="e.g. enthusiastic tech reviewer, calm news anchor, warm story narrator"
                list="voice-style-presets"
              />
              <datalist id="voice-style-presets">
                {VOICE_STYLES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>

              {/* Style preset tags */}
              <div className="flex flex-wrap gap-1">
                {[
                  "Professional News",
                  "Conversational Story",
                  "Energetic & Upbeat",
                  "Calm & Meditative",
                  "Dramatic Movie Trailer",
                ].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setStyle(p)}
                    className={`rounded-full border px-2.5 py-0.5 text-2xs transition-colors ${
                      style === p
                        ? "border-primary bg-primary/20 text-white"
                        : "border-line bg-raised text-muted hover:text-ink"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-muted">
                Mac Voice
              </label>
              <select
                className="rounded-xl border border-line bg-canvas/80 px-3 py-2 text-xs text-ink outline-none focus:border-primary"
                value={macVoice}
                onChange={(e) => setMacVoice(e.target.value)}
                disabled={macVoices === null}
                aria-busy={macVoices === null}
              >
                {macVoices === null && <option value="">Loading voices…</option>}
                {macVoices?.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({LOCALE[v.locale] ?? v.locale})
                  </option>
                ))}
              </select>
              <LabeledSlider
                label="Speaking Rate"
                value={rate}
                min={110}
                max={260}
                step={5}
                unit={{ short: "wpm", spoken: "words per minute" }}
                valueText={(v) => `${v} wpm`}
                onChange={setRate}
              />
            </div>
          )}

          {/* Action button */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              disabled={
                busy || !text.trim() || (engine === "gemini" && geminiOff)
              }
              onClick={() => void make()}
              className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 hover:brightness-110 active:scale-[0.99] disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {busy ? (
                <>
                  <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Synthesizing Speech…
                </>
              ) : (
                <>
                  <Icon name="voice" className="size-4" />
                  {fresh ? "Regenerate Voice" : "Generate Voiceover"} ·{" "}
                  {engine === "gemini"
                    ? money(costOf.voice(text.trim().length))
                    : "Free"}
                </>
              )}
            </button>
          </div>

          {error && <Notice tone="error">{error}</Notice>}
        </div>

        {/* Right Column: Voice Selection & Audio Waveform Player */}
        <div className="flex flex-col gap-4">
          {engine === "gemini" && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted">
                Select Voice Persona
              </span>
              <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                {GEMINI_VOICES.map((v) => {
                  const active = gVoice === v.name;
                  const persona = VOICE_PERSONAS[v.name] || {
                    category: "Voice",
                    description: v.character,
                    avatar: "🎙️",
                  };
                  return (
                    <button
                      key={v.name}
                      type="button"
                      onClick={() => setGVoice(v.name)}
                      className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition-all ${
                        active
                          ? "border-primary bg-primary/20 text-white shadow-md ring-1 ring-primary"
                          : "border-line bg-raised text-muted hover:border-line hover:bg-hover"
                      }`}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="text-sm font-semibold flex items-center gap-1.5">
                          <span>{persona.avatar}</span>
                          <span>{v.name}</span>
                        </span>
                        {active && (
                          <span className="size-2 rounded-full bg-indigo-400 animate-pulse" />
                        )}
                      </div>
                      <span className="text-2xs text-link font-medium mt-0.5">
                        {persona.category}
                      </span>
                      <span className="text-2xs text-muted leading-tight mt-1 line-clamp-1">
                        {v.character}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Audio Waveform Player Output */}
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-canvas/80 p-4 shadow-inner">
            <span className="text-xs font-semibold text-muted flex items-center gap-2">
              <Icon name="waveform" className="size-4 text-link" />
              Generated Voiceover Preview
            </span>

            {fresh ? (
              <div className="flex flex-col gap-3" data-testid="tts-result">
                <AudioWaveformCanvas
                  isRecording={false}
                  className="h-14 w-full rounded-xl bg-surface border border-line"
                />
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>{fresh.fileName}</span>
                  <span className="font-mono text-muted">
                    {formatTime(fresh.info.duration)}
                  </span>
                </div>
                <audio
                  src={`/api/videos/${fresh.id}/source`}
                  controls
                  className="w-full h-9"
                />
                <button
                  type="button"
                  onClick={() => onAdd(fresh)}
                  className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-emerald-600/20 hover:brightness-110 transition-all flex items-center justify-center gap-2"
                >
                  <Icon name="plus" className="size-4" />
                  Insert onto Timeline at Playhead
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted gap-2">
                <AudioWaveformCanvas
                  isRecording={false}
                  className="h-12 w-full rounded-xl bg-surface/50 border border-line opacity-40"
                />
                <p className="text-xs text-muted">
                  Enter a script and click &apos;Generate Voiceover&apos; to
                  preview audio here.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// SECTION 2: Record Live Mic Voiceover with Teleprompter
// -------------------------------------------------------------
function MicVoiceoverSection({ onAdd }: { onAdd: (m: VideoMeta) => void }) {
  const rec = useRecorder(1800); // up to 30 mins
  const [micId, setMicId] = useState("");
  const [script, setScript] = useState("");
  const [scrollSpeed, setScrollSpeed] = useState(1);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scriptBusy, setScriptBusy] = useState(false);
  const prompterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void rec.listDevices();
  }, [rec.listDevices]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prepare microphone stream on mount
  useEffect(() => {
    void rec.prepare("voice", {
      micId: micId || undefined,
      mic: true,
      systemAudio: false,
    });
    return () => {
      rec.release();
      rec.discard();
    };
  }, [micId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Teleprompter smooth auto-scroll when recording
  useEffect(() => {
    if (rec.phase !== "recording" || !prompterRef.current) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const el = prompterRef.current;
      if (el) el.scrollTop += ((now - last) / 1000) * 26 * scrollSpeed;
      last = now;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [rec.phase, scrollSpeed]);

  const draftPrompterScript = async () => {
    if (scriptBusy) return;
    setScriptBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          topic: script || "engaging voiceover for this video",
          tone: "clear, compelling, and punchy",
          seconds: 30,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data?.error?.message ?? "Couldn't draft script.");
      if (data.script) setScript(data.script);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScriptBusy(false);
    }
  };

  const saveRecording = async () => {
    const t = rec.take;
    if (!t) return;
    setSaving("Saving voiceover to My Assets…");
    setError(null);
    try {
      const meta = await uploadVideo(t.main, () => {}, undefined, {
        name: t.mainName,
        recording: true,
      });
      setSaving(null);
      onAdd(meta);
    } catch (e) {
      setSaving(null);
      setError((e as Error).message);
    }
  };

  const isRecording = rec.phase === "recording";
  const hasTake = !!rec.take;

  return (
    <div className="flex flex-col gap-4" data-testid="mic-voiceover-section">
      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Left Column: Gemini Teleprompter */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted flex items-center gap-1.5">
              <span>📖</span>
              <span>Intelligent Teleprompter</span>
            </span>
            <div className="flex items-center gap-2">
              <span className="text-2xs text-muted">
                Scroll Speed:
              </span>
              {[0.75, 1, 1.5, 2].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScrollSpeed(s)}
                  className={`rounded px-1.5 py-0.5 text-2xs font-medium transition-colors ${
                    scrollSpeed === s
                      ? "bg-purple-500/20 text-purple-300 font-semibold"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {s}x
                </button>
              ))}
              <button
                type="button"
                disabled={scriptBusy}
                onClick={() => void draftPrompterScript()}
                className="inline-flex items-center gap-1 rounded-md border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-2xs text-purple-300 hover:bg-purple-500/20 hover:text-ink transition-all disabled:opacity-40"
              >
                ✨ Draft script with Gemini
              </button>
            </div>
          </div>

          {/* Prompter Reader / Editor */}
          <div className="relative flex flex-col rounded-2xl border border-line bg-canvas/70 p-3 shadow-inner">
            {isRecording ? (
              <div
                ref={prompterRef}
                className="h-52 overflow-y-auto px-3 py-4 text-lg font-medium leading-loose text-ink select-none scroll-smooth"
              >
                {script ||
                  "No teleprompter script provided. Speak naturally into your microphone…"}
              </div>
            ) : (
              <textarea
                className="h-52 w-full resize-none bg-transparent p-2 text-sm leading-relaxed text-ink placeholder:text-muted outline-none"
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="Type or paste your script here for the auto-scrolling teleprompter, or click 'Draft script with Gemini'..."
              />
            )}
            <div className="flex items-center justify-between border-t border-line pt-2 text-2xs text-muted">
              <span>
                {isRecording
                  ? "🔴 Teleprompter is scrolling automatically"
                  : "Teleprompter ready"}
              </span>
              <span>{script.split(/\s+/).filter(Boolean).length} words</span>
            </div>
          </div>

          {/* Microphone Selector */}
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted font-medium">Microphone:</span>
            <select
              value={micId}
              onChange={(e) => setMicId(e.target.value)}
              className="flex-1 rounded-xl border border-line bg-canvas/80 px-3 py-1.5 text-xs text-ink outline-none focus:border-purple-400"
            >
              {rec.devices.mics.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || "Microphone"}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right Column: Audio Waveform Visualizer & Record Controls */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-canvas/80 p-5 shadow-inner">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted flex items-center gap-1.5">
                <Icon name="waveform" className="size-4 text-purple-400" />
                Live Microphone Monitor
              </span>
              <span
                className={`flex items-center gap-1 text-xs font-mono font-semibold ${isRecording ? "text-rose-400 animate-pulse" : "text-muted"}`}
              >
                {isRecording && (
                  <span className="size-2 rounded-full bg-rose-500" />
                )}
                {formatTime(rec.seconds)}
              </span>
            </div>

            {/* Live Audio Visualizer Canvas */}
            <AudioWaveformCanvas
              level={rec.level}
              isRecording={isRecording}
              className="h-24 w-full rounded-xl bg-canvas border border-line"
            />

            {/* Countdown Banner */}
            {rec.phase === "countdown" && (
              <div className="flex items-center justify-center py-4 text-center">
                <span className="text-5xl font-black text-rose-400 animate-bounce">
                  {rec.countdown}
                </span>
              </div>
            )}

            {/* Record / Stop Action */}
            <div className="flex flex-col items-center gap-3 pt-2">
              {rec.phase === "idle" || rec.phase === "ready" ? (
                <button
                  type="button"
                  onClick={() => void rec.start()}
                  className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-rose-600 to-pink-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-600/30 hover:brightness-110 active:scale-95 transition-all"
                >
                  <span className="size-3 rounded-full bg-white animate-pulse" />
                  Start Voiceover Recording
                </button>
              ) : rec.phase === "recording" ? (
                <button
                  type="button"
                  onClick={() => rec.stop()}
                  className="flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-ink shadow-lg hover:bg-hover active:scale-95 transition-all"
                >
                  <span className="size-3.5 rounded bg-rose-600" />
                  Stop Recording
                </button>
              ) : null}
            </div>

            {/* Review Take */}
            {hasTake && (
              <div className="flex flex-col gap-3 border-t border-line pt-4 mt-2">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span className="font-semibold">Review Voiceover Take:</span>
                  <button
                    type="button"
                    onClick={() => rec.discard()}
                    className="text-muted hover:text-rose-400 text-2xs underline"
                  >
                    Retake / Discard
                  </button>
                </div>
                {rec.take?.url && (
                  <audio src={rec.take.url} controls className="w-full h-9" />
                )}
                <button
                  type="button"
                  disabled={!!saving}
                  onClick={() => void saveRecording()}
                  className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-emerald-600/20 hover:brightness-110 transition-all flex items-center justify-center gap-2"
                >
                  <Icon name="plus" className="size-4" />
                  {saving
                    ? saving
                    : "Insert Voiceover into Timeline at Playhead"}
                </button>
              </div>
            )}
          </div>

          {error && <Notice tone="error">{error}</Notice>}
        </div>
      </div>
    </div>
  );
}
