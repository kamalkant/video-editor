"use client";

import { useState } from "react";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { costOf, money } from "@/lib/ai/pricing";
import type { TimelineDoc } from "@/lib/edit/doc";
import { geminiPost, type GeminiUi } from "@/lib/editor/useGemini";
import { runTask } from "@/lib/editor/tasks";
import { formatTime } from "@/lib/format";
import { languageLabel, segmentsToCaptions, SUB_LANGUAGES, type Caption, type Segment, type SubLanguage } from "@/lib/subtitles/segments";
import { sourceSeconds, subtitleSources, subtitleTracks } from "@/lib/subtitles/sources";
import { toSrt, toVtt } from "@/lib/subtitles/srt";
import { chaptersFromMarkers, youtubeChapters, type Chapter } from "@/lib/edit/chapters";
import { GeminiBadge, GeminiKeyCard, GeminiNote } from "./GeminiBits";

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Subtitles (rail panel): ✦ Gemini writes what is said, with times; the
 * captions land on their own "Subtitles" track as normal text clips (restyle,
 * move, edit them like any text). Translate them, or download .srt / .vtt.
 */
/** Word-by-word caption looks (the word being said is highlighted; "none" = plain captions). */
export type CaptionLook = "pop" | "bounce" | "karaoke" | "glow" | "box" | "none";
export const CAPTION_LOOKS: Array<{ id: CaptionLook; label: string; color: string; className: string }> = [
  { id: "pop", label: "💥 Pop", color: "#facc15", className: "text-amber-300" },
  { id: "bounce", label: "🟡 Bounce", color: "#facc15", className: "text-amber-300" },
  { id: "karaoke", label: "🎵 Karaoke", color: "#eab308", className: "text-yellow-400" },
  { id: "glow", label: "🔮 Glow", color: "#38bdf8", className: "text-cyan-300" },
  { id: "box", label: "⬛ Box", color: "#ffffff", className: "" },
  { id: "none", label: "Plain", color: "#ffffff", className: "text-muted" },
];
const LOOK_KEY = "VDO:caption-look";
const readLook = (): CaptionLook => {
  try {
    const v = localStorage.getItem(LOOK_KEY);
    return CAPTION_LOOKS.some((l) => l.id === v) ? (v as CaptionLook) : "pop";
  } catch {
    return "pop";
  }
};
export const captionLookStyle = (look: CaptionLook) => ({ highlightStyle: look, highlightColor: CAPTION_LOOKS.find((l) => l.id === look)?.color ?? "#facc15" });

export function SubtitlesPanel(p: {
  gemini: GeminiUi;
  doc: TimelineDoc;
  hasAudio: (mediaId: string) => boolean;
  selectedId: string | null;
  /** the selected text clip, if it is on a subtitle track (for "use this style on all") */
  selectedCaptionTrack: string | null;
  onAdd: (name: string, captions: Caption[], hide?: string[], look?: CaptionLook) => void;
  onStyleAll: (trackId: string) => void;
  onSelectTrack: (trackId: string) => void;
  onSeek?: (t: number) => void;
  onSelectClip?: (id: string) => void;
  onDeleteClip?: (id: string) => void;
  /** Open Highlights & Transcript extraction dialog. */
  onExtractHighlights?: () => void;
  /** Open Edit by Transcript dialog */
  onOpenTranscriptEdit?: () => void;
  /** Apply a word-by-word caption style to all captions on a track */
  onApplyCaptionStyle?: (trackId: string, style: { highlightStyle: CaptionLook; highlightColor: string }) => void;
  /** Add one fitting emoji to each caption on a track (lib/subtitles/emoji) */
  onEmojiBoost?: (trackId: string) => void;
  /** open this panel again (a click on its background task) */
  onShow?: () => void;
  /** the timeline's length (chapters run to its end) */
  duration?: number;
  /** YouTube chapters: put these as markers on the timeline (one undo step) */
  onAddChapters?: (chapters: Chapter[]) => void;
}) {
  const [scope, setScope] = useState<"main" | "selected">("main");
  const [lang, setLang] = useState<SubLanguage>("auto");
  const [to, setTo] = useState<SubLanguage>("hi");
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [captionMenu, setCaptionMenu] = useState<{ x: number; y: number; caption: Caption & { id: string } } | null>(null);
  const [expandedTrack, setExpandedTrack] = useState<string | null>(null);
  // the look new subtitles get (remembered), so "Make subtitles" gives styled captions in one click
  const [look, setLookState] = useState<CaptionLook>(readLook);
  const setLook = (l: CaptionLook) => {
    setLookState(l);
    try {
      localStorage.setItem(LOOK_KEY, l);
    } catch {}
  };

  const sources = subtitleSources(p.doc, p.hasAudio, scope, p.selectedId);
  const tracks = subtitleTracks(p.doc);
  const seconds = sourceSeconds(sources);
  const off = !offline && p.gemini !== "ready" && p.gemini !== "fake";

  const make = async () => {
    setError(null);
    setDone(null);
    const all: Caption[] = [];
    let found = "";
    try {
      // (listed in the top bar's background tasks: it keeps going if you open another panel)
      await runTask({ id: "subtitles", kind: "ai", label: offline ? "Making subtitles (offline)" : "Making subtitles" }, p.onShow, async (task) => {
        for (let i = 0; i < sources.length; i++) {
          const s = sources[i];
          const step = sources.length > 1 ? `Listening to clip ${i + 1} of ${sources.length}…` : "Listening…";
          setBusy(step);
          task.update({ detail: step, percent: sources.length > 1 ? (i / sources.length) * 100 : null });
          const r = await geminiPost<{ language: string; segments: Segment[] }>("/api/ai/subtitles", { mediaId: s.mediaId, in: s.in, out: s.out, language: lang, offline });
          found ||= r.language;
          all.push(...segmentsToCaptions(r.segments, s, s.start));
        }
      });
      if (!all.length) {
        setError("No speech was found in these clips.");
        return;
      }
      p.onAdd("Subtitles", all, [], look);
      setDone(`${all.length} subtitles added${found && lang === "auto" ? ` (${languageLabel(found.split("-")[0])})` : ""}. Click one on the timeline to edit its words or style.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const translate = async (trackId: string) => {
    const t = tracks.find((x) => x.id === trackId);
    if (!t || !t.captions.length) return;
    setError(null);
    setDone(null);
    setBusy(`Translating to ${languageLabel(to)}…`);
    try {
      const r = await runTask({ id: "translate", kind: "ai", label: `Translating subtitles to ${languageLabel(to)}` }, p.onShow, () => geminiPost<{ lines: string[] }>("/api/ai/translate", { lines: t.captions.map((c) => c.text), to }));
      p.onAdd(`Subtitles (${languageLabel(to)})`.slice(0, 40), t.captions.map((c, i) => ({ start: c.start, duration: c.duration, text: r.lines[i] ?? c.text })), [trackId]);
      setDone(`Translated. The ${languageLabel(to)} subtitles are on a new track; the original one is hidden (show it again with its eye button).`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const chars = (id: string) => tracks.find((t) => t.id === id)?.captions.reduce((a, c) => a + c.text.length, 0) ?? 0;

  // YouTube chapters: from the markers on the timeline (✦ Gemini can suggest them from the subtitles)
  const duration = p.duration ?? 0;
  const chapters = chaptersFromMarkers(p.doc.markers);
  const yt = youtubeChapters(chapters, duration);
  const [copied, setCopied] = useState(false);
  const transcriptTrack = tracks.find((t) => !t.hidden && t.captions.length) ?? tracks.find((t) => t.captions.length);
  const makeChapters = async () => {
    if (!transcriptTrack || !p.onAddChapters) return;
    setError(null);
    setDone(null);
    setBusy("Finding chapters…");
    try {
      const r = await runTask({ id: "chapters", kind: "ai", label: "Making YouTube chapters" }, p.onShow, () =>
        geminiPost<{ chapters: Chapter[] }>("/api/ai/chapters", {
          lines: transcriptTrack.captions.map((c) => ({ start: c.start, text: c.text })),
          duration,
        }),
      );
      if (!r.chapters.length) {
        setError("No clear chapters were found. Add markers yourself with M.");
        return;
      }
      p.onAddChapters(r.chapters);
      setDone(`${r.chapters.length} chapters added as markers. Rename or move them on the timeline, then copy them for YouTube.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const copyChapters = async () => {
    try {
      await navigator.clipboard.writeText(yt.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Select the chapter lines and copy them yourself.");
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="subtitles-panel">
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            Make subtitles {!offline && <GeminiBadge />}
          </h3>
          <label className="flex items-center gap-1.5 text-[0.6875rem] text-muted cursor-pointer hover:text-ink">
            <input type="checkbox" checked={offline} onChange={(e) => setOffline(e.target.checked)} className="rounded" />
            <span>Offline sample (Beta)</span>
          </label>
        </div>
        {off ? (
          p.gemini === "loading" ? <p className="text-xs text-muted">Checking Gemini…</p> : <GeminiKeyCard />
        ) : (
          <>
            <fieldset className="flex gap-1" aria-label="Which clips">
              {(
                [
                  ["main", "All of Video 1"],
                  ["selected", "The selected clip"],
                ] as const
              ).map(([id, label]) => (
                <label key={id} className={`flex-1 cursor-pointer rounded-md border px-2 py-1.5 text-center text-xs ${scope === id ? "border-primary bg-primary-soft font-semibold" : "border-control text-muted"}`}>
                  <input type="radio" name="sub-scope" className="sr-only" checked={scope === id} onChange={() => setScope(id)} />
                  {label}
                </label>
              ))}
            </fieldset>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Spoken language
              <select className="field" value={lang} onChange={(e) => setLang(e.target.value as SubLanguage)}>
                {SUB_LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Caption look
              <select className="field" value={look} onChange={(e) => setLook(e.target.value as CaptionLook)} data-testid="caption-look">
                {CAPTION_LOOKS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.id === "none" ? "Plain (no word highlight)" : `${l.label.replace(/^\S+ /, "")}: word by word`}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn-primary" onClick={() => void make()} disabled={!!busy || !sources.length} data-testid="make-subtitles">
              <Icon name="subtitles" className="size-4" />
              {busy ?? (offline ? "Make sample subtitles (offline)" : `Make subtitles · ${money(costOf.subtitles(seconds))}`)}
            </button>
            {sources.length ? (
              offline ? (
                <p className="text-xs text-amber-500">Beta: offline mode doesn&apos;t recognise speech yet. It places sample lines so you can try styles and timing. Turn it off for real subtitles.</p>
              ) : (
                <GeminiNote sends={`the sound of ${sources.length === 1 ? "this clip" : `${sources.length} clips`} (${formatTime(seconds)})`} cost={money(costOf.subtitles(seconds))} extra="made once per clip, then reused" />
              )
            ) : (
              <p className="text-xs text-muted">{scope === "selected" ? "Select a video or sound clip that has sound." : "Put a video with sound on Video 1 first."}</p>
            )}
          </>
        )}
        {error && (
          <Notice tone="error" role="alert">
            {error}
          </Notice>
        )}
        {done && <p className="text-xs text-success" role="status">{done}</p>}
      </section>

      {tracks.length > 0 && (
        <section className="flex flex-col gap-2 border-t border-line pt-3" data-testid="subtitle-tracks">
          <h3 className="text-sm font-semibold">Your subtitles</h3>
          {tracks.map((t) => (
            <div key={t.id} className="flex flex-col gap-2 rounded-lg border border-line p-2.5">
              <button type="button" className="flex items-center justify-between gap-2 text-left" onClick={() => p.onSelectTrack(t.id)} title="Show on the timeline">
                <span className="truncate text-xs font-medium">{t.name}</span>
                <span className="shrink-0 text-[0.6875rem] text-muted">
                  {t.captions.length} lines{t.hidden ? " · hidden" : ""}
                </span>
              </button>

              {/* Styled Caption Presets for Reels & Shorts */}
              <div className="flex flex-col gap-1 rounded border border-line bg-surface/30 p-1.5">
                <span className="text-[0.6875rem] font-semibold text-muted">Word-by-word look</span>
                <div className="grid grid-cols-3 gap-1 text-[0.6875rem]">
                  {CAPTION_LOOKS.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      className={`btn btn-secondary min-h-0 py-1 px-1.5 text-xs ${l.className}`}
                      onClick={() => p.onApplyCaptionStyle?.(t.id, captionLookStyle(l.id))}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
                {p.onEmojiBoost && (
                  <button
                    type="button"
                    className="btn btn-secondary min-h-0 py-1 px-1.5 text-xs"
                    onClick={() => p.onEmojiBoost?.(t.id)}
                    title="Adds one fitting emoji to captions with words like money, fire, love, idea (Hinglish too)"
                  >
                    😀 Add emojis
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button type="button" className="btn btn-secondary min-h-0 px-2 py-1 text-xs" onClick={() => download(`${t.name}.srt`, toSrt(t.captions), "application/x-subrip")}>
                  <Icon name="download" className="size-3.5" /> .srt
                </button>
                <button type="button" className="btn btn-secondary min-h-0 px-2 py-1 text-xs" onClick={() => download(`${t.name}.vtt`, toVtt(t.captions), "text/vtt")}>
                  <Icon name="download" className="size-3.5" /> .vtt
                </button>
                <button type="button" className="btn btn-secondary min-h-0 px-2 py-1 text-xs" disabled={p.selectedCaptionTrack !== t.id} onClick={() => p.onStyleAll(t.id)} title={p.selectedCaptionTrack === t.id ? "Give every line the style of the selected one" : "Select one of its lines on the timeline and style it first"}>
                  Use selected line style
                </button>
              </div>

              {/* Caption lines interactive list with right-click context menu */}
              <div className="flex flex-col gap-1 border-t border-line/40 pt-2">
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-[0.6875rem] font-medium text-muted hover:text-ink transition-colors text-left"
                  onClick={() => setExpandedTrack((prev) => (prev === t.id ? null : t.id))}
                  aria-expanded={expandedTrack === t.id}
                >
                  <Icon name={expandedTrack === t.id ? "chevronDown" : "chevronRight"} className="size-3" />
                  <span>{expandedTrack === t.id ? "Hide caption lines" : "Show caption lines"} ({t.captions.length})</span>
                </button>
                {expandedTrack === t.id && (
                  <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded border border-line bg-surface/40 p-1.5 text-xs">
                    {t.captions.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => {
                          p.onSeek?.(c.start);
                          p.onSelectClip?.(c.id);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setCaptionMenu({ x: e.clientX, y: e.clientY, caption: c });
                        }}
                        className="group flex cursor-pointer items-center justify-between gap-2 rounded px-1.5 py-1 hover:bg-raised transition-colors"
                        title="Click to jump playhead, right-click for options"
                      >
                        <span className="shrink-0 font-mono text-[0.625rem] text-primary">{formatTime(c.start)}</span>
                        <span className="min-w-0 flex-1 truncate text-ink">{c.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {!off && (
                <div className="flex flex-col gap-1.5">
                  <select className="field min-h-0 w-full py-1 text-xs" value={to} onChange={(e) => setTo(e.target.value as SubLanguage)} aria-label={`Translate ${t.name} to`}>
                    {SUB_LANGUAGES.filter((l) => l.id !== "auto").map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn btn-secondary min-h-0 w-full px-2 py-1 text-xs" disabled={!!busy} onClick={() => void translate(t.id)}>
                    Translate · {money(costOf.translate(chars(t.id)))}
                  </button>
                </div>
              )}
            </div>
          ))}
          {!off && <GeminiNote sends="the subtitle words (not the video)" cost="translating costs less than 1¢" />}
        </section>
      )}

      {tracks.length > 0 && p.onOpenTranscriptEdit && (
        <section className="flex flex-col gap-2 rounded-lg border border-line bg-canvas p-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-ink">Edit Video by Transcript</h4>
            <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[0.625rem] font-medium text-primary">Text-based edit</span>
          </div>
          <p className="text-xs text-muted">
            Delete spoken words or cut hesitation like &ldquo;um&rdquo; and &ldquo;uh&rdquo; to slice the video directly.
          </p>
          <button
            type="button"
            className="btn btn-secondary flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium"
            onClick={p.onOpenTranscriptEdit}
          >
            <Icon name="cut" className="size-3.5 text-primary" />
            <span>Open Transcript Editor</span>
          </button>
        </section>
      )}

      {p.onExtractHighlights && (
        <section className="flex flex-col gap-2 rounded-lg border border-line bg-canvas p-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-ink">Smart Highlights & Recap</h4>
            <GeminiBadge />
          </div>
          <p className="text-xs text-muted">
            Extract viral hooks and build recap reels from this video transcript.
          </p>
          <button
            type="button"
            className="btn btn-secondary flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium"
            onClick={p.onExtractHighlights}
          >
            <Icon name="magic" className="size-3.5 text-primary" />
            <span>Extract Highlights from Transcript</span>
          </button>
        </section>
      )}

      <section className="flex flex-col gap-2 border-t border-line pt-3" data-testid="youtube-chapters">
        <h3 className="text-sm font-semibold">YouTube chapters</h3>
        {p.onAddChapters && transcriptTrack && !off && (
          <button type="button" className="btn btn-secondary min-h-0 py-1.5 text-xs" onClick={() => void makeChapters()} disabled={!!busy}>
            ✦ Make chapters from the subtitles
          </button>
        )}
        {chapters.length ? (
          <>
            <pre className="max-h-40 overflow-auto rounded-md border border-line bg-canvas p-2 text-[0.6875rem] leading-relaxed whitespace-pre-wrap">{yt.text}</pre>
            {yt.problems.map((msg) => (
              <p key={msg} className="text-[0.6875rem] text-amber-500">
                {msg}
              </p>
            ))}
            <button type="button" className="btn btn-secondary min-h-0 py-1 text-xs" onClick={() => void copyChapters()}>
              {copied ? "Copied ✓" : "Copy for the YouTube description"}
            </button>
          </>
        ) : (
          <p className="text-xs text-muted">Each marker on the timeline (press M) becomes a chapter. Its note is the chapter title.</p>
        )}
      </section>

      {captionMenu && (
        <ContextMenu
          x={captionMenu.x}
          y={captionMenu.y}
          label="Caption"
          onClose={() => setCaptionMenu(null)}
          items={[
            {
              label: `Jump playhead to ${formatTime(captionMenu.caption.start)}`,
              onSelect: () => {
                p.onSeek?.(captionMenu.caption.start);
                p.onSelectClip?.(captionMenu.caption.id);
              },
            },
            {
              label: "Copy caption text",
              onSelect: () => void navigator.clipboard.writeText(captionMenu.caption.text),
            },
            ...(p.onDeleteClip
              ? [
                  "separator" as const,
                  {
                    label: "Delete caption",
                    shortcut: "Del",
                    onSelect: () => p.onDeleteClip?.(captionMenu.caption.id),
                  },
                ]
              : []),
          ]}
        />
      )}
    </div>
  );
}
