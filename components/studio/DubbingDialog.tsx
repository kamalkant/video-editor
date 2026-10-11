"use client";

import { useState } from "react";
import { GoogleAiModal } from "@/components/ui/GoogleAiModal";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import type { AudioClip, VideoClip } from "@/lib/edit/doc";
import { costOf, money } from "@/lib/ai/pricing";
import { GEMINI_VOICES } from "@/lib/ai/voices";
import { geminiPost, type GeminiUi } from "@/lib/editor/useGemini";
import { runTask } from "@/lib/editor/tasks";
import { languageLabel, segmentsToCaptions, SUB_LANGUAGES, type Caption, type Segment, type SubLanguage } from "@/lib/subtitles/segments";
import type { VideoMeta } from "@/lib/videos";
import { GeminiBadge, GeminiKeyCard } from "./GeminiBits";

/** At most this many spoken lines per run (each is one voice request). */
export const MAX_DUB_LINES = 60;

export type DubResult = {
  /** the translated voice lines, each placed where its original line starts (timeline seconds) */
  lines: { meta: VideoMeta; at: number }[];
  /** the translated subtitles (timeline seconds), to add as a track if wanted */
  captions: Caption[];
  language: SubLanguage;
};

/**
 * Translate audio (dubbing): ✦ Gemini hears the clip's speech (subtitles), translates each line
 * and speaks it in a voice you pick. Each spoken line goes on an audio track at the time of the
 * original line, and the original is turned down underneath. Hindi ↔ English and 20+ languages.
 */
export function DubbingDialog(p: {
  open: boolean;
  onClose: () => void;
  gemini: GeminiUi;
  /** the clip whose speech is dubbed, and where it starts on the timeline */
  clip: (VideoClip | AudioClip) | null;
  clipStart: number;
  onDone: (r: DubResult, opts: { duck: boolean; subtitles: boolean }) => void;
  onShow?: () => void;
}) {
  const [from, setFrom] = useState<SubLanguage>("auto");
  const [to, setTo] = useState<SubLanguage>("hi");
  const [voice, setVoice] = useState(GEMINI_VOICES[0]?.name ?? "Kore");
  const [duck, setDuck] = useState(true);
  const [subtitles, setSubtitles] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const off = p.gemini !== "ready" && p.gemini !== "fake";
  const seconds = p.clip ? (p.clip.out - p.clip.in) / (p.clip.type === "video" ? (p.clip.speed ?? 1) : 1) : 0;

  const run = async () => {
    const clip = p.clip;
    if (!clip) return setError("Select a clip with speech first.");
    if (clip.type === "video" && clip.reversed) return setError("A reversed clip can't be dubbed.");
    setError(null);
    try {
      const result = await runTask({ id: "dub", kind: "ai", label: `Dubbing into ${languageLabel(to)}` }, p.onShow, async (task) => {
        setBusy("Listening…");
        task.update({ detail: "Listening…", percent: 5 });
        const subs = await geminiPost<{ language: string; segments: Segment[] }>("/api/ai/subtitles", { mediaId: clip.mediaId, in: clip.in, out: clip.out, language: from });
        const captions = segmentsToCaptions(subs.segments, clip, p.clipStart).slice(0, MAX_DUB_LINES);
        if (!captions.length) throw new Error("No speech was found in this clip.");
        setBusy(`Translating ${captions.length} lines…`);
        task.update({ detail: "Translating…", percent: 15 });
        const tr = await geminiPost<{ lines: string[] }>("/api/ai/translate", { lines: captions.map((c) => c.text.replace(/\n/g, " ")), to });
        const translated = captions.map((c, i) => ({ ...c, text: tr.lines[i] ?? c.text }));
        const lines: DubResult["lines"] = [];
        for (let i = 0; i < translated.length; i++) {
          const c = translated[i];
          setBusy(`Speaking line ${i + 1} of ${translated.length}…`);
          task.update({ detail: `Voice ${i + 1}/${translated.length}`, percent: 20 + (75 * i) / translated.length });
          const meta = await geminiPost<VideoMeta>("/api/tts", {
            engine: "gemini",
            text: c.text.replace(/\n/g, " "),
            voice,
            // keep each line close to the length of the original so the dub stays in sync
            style: `Speak naturally, clearly and a little briskly, so it takes about ${Math.max(1, Math.round(c.duration))} seconds.`,
          });
          lines.push({ meta, at: c.start });
        }
        return { lines, captions: translated, language: to };
      });
      p.onDone(result, { duck, subtitles });
      p.onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <GoogleAiModal
      open={p.open}
      onClose={p.onClose}
      size="md"
      title="Translate audio (dubbing)"
      subtitle="Hear the clip in another language: each line is translated and spoken in a new voice, in sync with the original"
      badge={<GeminiBadge />}
      busy={!!busy}
      busyLabel={busy ?? ""}
      testId="dubbing-dialog"
    >
      {off ? (
        <GeminiKeyCard />
      ) : (
        <div className="flex flex-col gap-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-slate-300">
              Spoken now
              <select className="field" value={from} onChange={(e) => setFrom(e.target.value as SubLanguage)}>
                {SUB_LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-slate-300">
              Dub into
              <select className="field" value={to} onChange={(e) => setTo(e.target.value as SubLanguage)}>
                {SUB_LANGUAGES.filter((l) => l.id !== "auto").map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-slate-300">
              Voice
              <select className="field" value={voice} onChange={(e) => setVoice(e.target.value)}>
                {GEMINI_VOICES.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name} · {v.character}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-slate-300">
            <input type="checkbox" checked={duck} onChange={(e) => setDuck(e.target.checked)} /> Keep the original voice quietly underneath
          </label>
          <label className="flex items-center gap-2 text-slate-300">
            <input type="checkbox" checked={subtitles} onChange={(e) => setSubtitles(e.target.checked)} /> Also add {languageLabel(to)} subtitles
          </label>
          <p className="text-slate-400">
            Sends the clip&apos;s sound and the words to Google Gemini. About {money(costOf.subtitles(seconds) + costOf.voice(Math.round(seconds * 15)))} for{" "}
            {Math.round(seconds)} s; up to {MAX_DUB_LINES} lines per run.
          </p>
          {error && (
            <Notice tone="error" role="alert">
              {error}
            </Notice>
          )}
          <button type="button" disabled={!!busy || !p.clip} onClick={() => void run()} className="btn btn-primary">
            <Icon name="audio" className="size-4" /> Dub into {languageLabel(to)}
          </button>
        </div>
      )}
    </GoogleAiModal>
  );
}
