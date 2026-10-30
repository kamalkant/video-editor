"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { LabeledSlider } from "@/components/ui/LabeledSlider";
import { Notice } from "@/components/ui/Notice";
import type { VideoMeta } from "@/lib/api/types";
import { costOf, money } from "@/lib/ai/pricing";
import { GEMINI_VOICES, VOICE_STYLES } from "@/lib/ai/voices";
import { useServerCaps } from "@/lib/editor/useServerCaps";
import { useGemini } from "@/lib/editor/useGemini";
import { formatTime } from "@/lib/format";
import { GeminiBadge, GeminiKeyCard, GeminiNote } from "./GeminiBits";

type Engine = "mac" | "gemini";
const ENGINE_KEY = "VDO:tts-engine";
const readEngine = (): Engine => {
  try {
    return localStorage.getItem(ENGINE_KEY) === "gemini" ? "gemini" : "mac";
  } catch {
    return "mac";
  }
};

type Voice = { name: string; locale: string; sample: string };
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

function TtsBody({ onAdd }: { onAdd: (m: VideoMeta) => void }) {
  const gemini = useGemini();
  const [chosen, setEngineState] = useState<Engine>(readEngine);
  // a server without the Mac's voices (Linux hosting) uses Gemini's
  const { macVoices } = useServerCaps();
  const engine: Engine = macVoices ? chosen : "gemini";
  const setEngine = (e: Engine) => {
    setEngineState(e);
    try {
      localStorage.setItem(ENGINE_KEY, e);
    } catch {
      /* not remembered */
    }
  };
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("");
  const [gVoice, setGVoice] = useState("Kore");
  const [style, setStyle] = useState("");
  const [rate, setRate] = useState(175);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ key: string; meta: VideoMeta } | null>(
    null,
  );
  const key = JSON.stringify(
    engine === "gemini"
      ? ["g", text.trim(), gVoice, style.trim()]
      : [text.trim(), voice, rate],
  );
  const geminiOff =
    engine === "gemini" && gemini !== "ready" && gemini !== "fake";

  useEffect(() => {
    let alive = true;
    void fetch("/api/tts/voices")
      .then(async (r) => {
        const j = await r.json();
        if (!alive) return;
        // (no Mac voices on this server: Gemini's are used, nothing to report)
        if (j?.error?.code === "tts_unavailable") return;
        if (!r.ok)
          throw new Error(
            j?.error?.message ?? "Text to speech isn't available.",
          );
        setVoices(j.voices);
        setVoice((v) => v || (j.voices[0]?.name ?? ""));
      })
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, []);

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      const body =
        engine === "gemini"
          ? { engine: "gemini", text, voice: gVoice, style }
          : { text, voice, rate };
      const r = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok)
        throw new Error(j?.error?.message ?? "Couldn't make the voice.");
      setMade({ key, meta: j as VideoMeta });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const fresh = made?.key === key ? made.meta : null;
  const groups = voices ? [...new Set(voices.map((v) => v.locale))] : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1" role="radiogroup" aria-label="Voices">
        {(
          [
            ["mac", "Mac voices", "free, offline"],
            ["gemini", "Gemini voices", "natural, 130 languages"],
          ] as const
        ).map(([id, label, note]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={engine === id}
            onClick={() => setEngine(id)}
            disabled={id === "mac" && !macVoices}
            title={id === "mac" && !macVoices ? "Mac voices need the ViPlay app on a Mac. Gemini voices work here." : undefined}
            className={`flex flex-1 flex-col items-center rounded-md border px-2 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50 ${engine === id ? "border-primary bg-primary-soft font-semibold" : "border-control text-muted"}`}
          >
            <span className="flex items-center gap-1">
              {label} {id === "gemini" && <GeminiBadge />}
            </span>
            <span className="text-2xs font-normal">{id === "mac" && !macVoices ? "needs the Mac app" : note}</span>
          </button>
        ))}
      </div>
      {geminiOff &&
        (gemini === "loading" ? (
          <p className="text-xs text-muted">Checking Gemini…</p>
        ) : (
          <GeminiKeyCard />
        ))}
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Script</span>
        <textarea
          className="field min-h-32 resize-y py-2 text-sm leading-relaxed"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={5000}
          placeholder="Type or paste what the voice should say…"
          aria-describedby="tts-count"
        />
        <span id="tts-count" className="self-end text-2xs text-muted">
          {text.length} / 5000
        </span>
      </label>
      {engine === "gemini" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Voice</span>
            <select
              className="field"
              value={gVoice}
              onChange={(e) => setGVoice(e.target.value)}
              aria-label="Gemini voice"
            >
              {GEMINI_VOICES.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} · {v.character}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">How to say it</span>
            <input
              className="field"
              list="tts-styles"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              maxLength={200}
              placeholder="e.g. like a calm news anchor"
            />
            <datalist id="tts-styles">
              {VOICE_STYLES.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Voice</span>
            <select
              className="field"
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              disabled={!voices}
            >
              {!voices && <option>Loading voices…</option>}
              {groups.map((g) => (
                <optgroup key={g} label={LOCALE[g] ?? g}>
                  {voices!
                    .filter((v) => v.locale === g)
                    .map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <LabeledSlider
            label="Speed"
            value={rate}
            min={110}
            max={260}
            step={5}
            unit={{ short: "wpm", spoken: "words per minute" }}
            valueText={(v) => `${v} words per minute`}
            onChange={setRate}
          />
        </div>
      )}
      {error && (
        <Notice tone="error" role="alert" title="No voice yet">
          {error}
        </Notice>
      )}
      {fresh && (
        <div
          className="flex flex-col gap-1 rounded-lg border border-line bg-canvas p-3"
          data-testid="tts-result"
        >
          <span className="text-xs text-muted">
            {fresh.fileName} · {formatTime(fresh.info.duration)}
          </span>
          <audio
            src={`/api/videos/${fresh.id}/source`}
            controls
            className="w-full"
            aria-label="Listen to the voice"
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {fresh ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onAdd(fresh)}
          >
            <Icon name="plus" className="size-4" /> Add to timeline
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void make()}
            disabled={
              busy || !text.trim() || (engine === "mac" ? !voice : geminiOff)
            }
          >
            <Icon name="voice" className="size-4" />{" "}
            {busy
              ? "Making the voice…"
              : engine === "gemini"
                ? `Make voice · ${money(costOf.voice(text.trim().length))}`
                : "Make voice"}
          </button>
        )}
        {fresh && (
          <span className="text-xs text-muted">
            Changed the text, voice or {engine === "gemini" ? "style" : "speed"}
            ? It makes a new one.
          </span>
        )}
      </div>
      {engine === "gemini" ? (
        !geminiOff && (
          <GeminiNote
            sends="your script"
            cost={money(costOf.voice(text.trim().length))}
            extra="the same script and voice are made only once"
          />
        )
      ) : (
        <p className="text-2xs text-muted">
          Uses the voices built into your Mac: free and offline. More voices:
          System Settings → Accessibility → Spoken Content.
        </p>
      )}
    </div>
  );
}

import { VoiceoverStudioDialog } from "./VoiceoverStudioDialog";

/** Text to Speech: delegates to the unified Google Voiceover Studio. */
export function TtsDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (m: VideoMeta) => void;
}) {
  return (
    <VoiceoverStudioDialog
      open={open}
      onClose={onClose}
      onAdd={onAdd}
      initialMode="tts"
    />
  );
}
