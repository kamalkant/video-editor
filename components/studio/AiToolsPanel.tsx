"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { featureById } from "@/lib/roadmap";
import { GeminiBadge } from "./GeminiBits";

/** A card on the AI Tools panel. `id` is the feature in lib/roadmap (its status decides Ready / Soon). */
type Tool = { id: string; name: string; detail: string; icon: IconName; art: string; words: string };

const SECTIONS: { title: string; icon: IconName; tools: Tool[] }[] = [
  {
    title: "Create with AI",
    icon: "magic",
    tools: [
      { id: "gen-video", name: "Generate Video", detail: "Create video from text or image", icon: "film", art: "from-sky-700 via-indigo-800 to-slate-900", words: "generate make create video clip" },
      { id: "grok", name: "Grok Imagine", detail: "Pictures & video with xAI Grok", icon: "magic", art: "from-zinc-700 via-neutral-800 to-black", words: "grok xai imagine picture image video prompt generate" },
      { id: "gen-image", name: "Generate Image", detail: "Create images for your video", icon: "image", art: "from-fuchsia-700 via-purple-800 to-slate-900", words: "generate image picture photo" },
      { id: "gen-bg", name: "Generate Background", detail: "AI background for your scene", icon: "gradient", art: "from-cyan-600 via-blue-800 to-slate-900", words: "generate background scene studio" },
      { id: "text-to-video", name: "Text to Video", detail: "Turn a script into a video", icon: "text", art: "from-amber-600 via-orange-800 to-slate-900", words: "text script to video story" },
      { id: "avatar", name: "AI Avatar", detail: "Create or use an AI presenter", icon: "person", art: "from-rose-600 via-pink-800 to-slate-900", words: "avatar presenter anchor person" },
    ],
  },
  {
    title: "Modify & Edit with AI",
    icon: "wand",
    tools: [
      { id: "ai-remove", name: "Remove Background", detail: "Remove any background", icon: "eraser", art: "from-emerald-600 via-teal-800 to-slate-900", words: "remove background cut out transparent person no green screen" },
      { id: "watermark", name: "Remove Watermark", detail: "Remove, blur or cover a logo", icon: "eraser", art: "from-amber-600 via-orange-800 to-slate-900", words: "watermark logo remove blur cover hide face number plate" },
      { id: "replace-bg", name: "Replace Background", detail: "Change or generate a new background", icon: "background", art: "from-lime-600 via-green-800 to-slate-900", words: "replace change background studio" },
      { id: "remove-object", name: "Remove Object", detail: "Erase unwanted objects", icon: "target", art: "from-red-600 via-rose-800 to-slate-900", words: "remove object erase delete thing" },
      { id: "extend", name: "Extend Video", detail: "Add frames to extend a clip", icon: "resize", art: "from-blue-600 via-sky-800 to-slate-900", words: "extend longer frames" },
      { id: "highlights", name: "Auto Highlights & Recap", detail: "Extract top moments & transcript clips", icon: "magic", art: "from-amber-600 via-rose-800 to-slate-900", words: "highlights recap clips transcript extract moments viral shorts" },
      { id: "smart-crop", name: "Smart Crop", detail: "Auto reframe for any platform", icon: "crop", art: "from-orange-600 via-amber-800 to-slate-900", words: "smart crop reframe vertical 9:16 shorts reels" },
    ],
  },
  {
    title: "Enhance with AI",
    icon: "star",
    tools: [
      { id: "upscale", name: "Upscale Video", detail: "Increase resolution (HD / 4K)", icon: "fullscreen", art: "from-indigo-600 via-violet-800 to-slate-900", words: "upscale 4k hd resolution sharper" },
      { id: "stabilize", name: "Stabilize Video", detail: "Remove shakiness", icon: "hand", art: "from-slate-500 via-slate-700 to-slate-900", words: "stabilize shake shaky steady" },
      { id: "enhance", name: "Enhance Quality", detail: "Improve color, clarity, lighting", icon: "magic", art: "from-violet-600 via-purple-800 to-slate-900", words: "enhance quality better clarity light" },
      { id: "video-denoise", name: "Remove Noise", detail: "Reduce grain and noise", icon: "blur", art: "from-teal-600 via-cyan-800 to-slate-900", words: "grain noise video dark denoise" },
      { id: "auto-color", name: "Auto Color", detail: "Auto adjust color & lighting", icon: "palette", art: "from-yellow-600 via-orange-800 to-slate-900", words: "color colour grade light auto" },
    ],
  },
  {
    title: "Audio & Voice with AI",
    icon: "waveform",
    tools: [
      { id: "tts", name: "Text to Speech", detail: "Convert text to voice", icon: "voice", art: "from-rose-600 via-red-800 to-slate-900", words: "text to speech voice read aloud narration voiceover tts" },
      { id: "voice-clone", name: "Voice Clone", detail: "Use your own voice", icon: "mic", art: "from-blue-600 via-indigo-800 to-slate-900", words: "voice clone my voice" },
      { id: "denoise", name: "Remove Background Noise", detail: "Clean and enhance audio", icon: "waveform", art: "from-sky-600 via-blue-800 to-slate-900", words: "noise hum hiss clean audio sound background noise" },
      { id: "silences", name: "Remove Silences", detail: "Cut the pauses in speech", icon: "cut", art: "from-emerald-600 via-green-800 to-slate-900", words: "silence pause gaps um cut speech" },
      { id: "smart-mix", name: "Smart Audio Mix", detail: "Dialogue ducking & audio balance", icon: "volume", art: "from-blue-600 via-sky-800 to-slate-900", words: "ducking duck audio mix voiceover speech dialogue volume balance" },
      { id: "auto-subs", name: "Auto Subtitles", detail: "Generate subtitles", icon: "subtitles", art: "from-cyan-600 via-sky-800 to-slate-900", words: "subtitles captions transcript" },
      { id: "translate", name: "Translate Audio", detail: "Translate to other languages", icon: "audio", art: "from-purple-600 via-fuchsia-800 to-slate-900", words: "translate dub language hindi english" },
    ],
  },
  {
    title: "Creative Tools",
    icon: "brush",
    tools: [
      { id: "gen-effects", name: "Generate Effects", detail: "Create AI visual effects", icon: "effects", art: "from-fuchsia-600 via-violet-800 to-slate-900", words: "effects vfx generate" },
      { id: "green-screen", name: "Green Screen", detail: "Color key background", icon: "pipette", art: "from-green-500 via-green-700 to-slate-900", words: "green screen blue screen chroma key" },
      { id: "blur-bg", name: "Blur Background", detail: "Blur what's behind you", icon: "blur", art: "from-stone-500 via-stone-700 to-slate-900", words: "blur background bokeh portrait" },
      { id: "replace-sky", name: "Replace Sky", detail: "Change the sky with AI", icon: "image", art: "from-sky-500 via-blue-700 to-slate-900", words: "sky replace clouds" },
      { id: "b-roll", name: "Generate B-Roll", detail: "Relevant cutaway clips", icon: "film", art: "from-orange-600 via-red-800 to-slate-900", words: "b-roll broll cutaway stock footage" },
    ],
  },
];

const STOP = new Set(["the", "and", "for", "from", "into", "with", "want", "make", "can", "how", "you", "your", "this", "that", "what", "please", "some", "all", "out", "get", "use", "any", "our", "are", "was", "want", "need", "my", "me", "it", "in", "to", "of", "a"]);

export type AiToolId =
  | "gen-video"
  | "grok"
  | "gen-image"
  | "gen-bg"
  | "text-to-video"
  | "avatar"
  | "ai-remove"
  | "watermark"
  | "replace-bg"
  | "remove-object"
  | "extend"
  | "highlights"
  | "smart-crop"
  | "upscale"
  | "stabilize"
  | "enhance"
  | "video-denoise"
  | "auto-color"
  | "tts"
  | "voice-clone"
  | "denoise"
  | "silences"
  | "smart-mix"
  | "auto-subs"
  | "translate"
  | "gen-effects"
  | "green-screen"
  | "blur-bg"
  | "replace-sky"
  | "b-roll";

/** The tools that use Google Gemini (online, on the user's key). */
const GEMINI_TOOLS = new Set([
  "gen-video",
  "gen-image",
  "gen-bg",
  "text-to-video",
  "avatar",
  "voice-clone",
  "translate",
  "remove-object",
  "extend",
  "upscale",
  "gen-effects",
  "replace-sky",
  "b-roll",
  "auto-subs",
  "highlights",
  "smart-crop",
]);

/**
 * AI Tools (like the design in prototypes/AI tools UI.png): every tool is
 * shown. Ready ones act on the selected clip (or the first video on Video 1);
 * the others say "Soon" and what they will do.
 */
export function AiToolsPanel({ onClose, target, onTool, whyNot, onSettings }: { onClose: () => void; target: string | null; onTool: (id: AiToolId) => void; whyNot: Partial<Record<AiToolId, string | null>>; onSettings: () => void }) {
  const [query, setQuery] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  // the AI credits left (platform AI costs credits; your own key in Settings doesn't)
  const [credits, setCredits] = useState<number | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(true);
  useEffect(() => {
    let live = true;
    fetch("/api/user/ai-credits")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => live && typeof j?.ledger?.balance === "number" && setCredits(j.ledger.balance))
      .catch(() => {})
      .finally(() => live && setCreditsLoading(false));
    return () => {
      live = false;
    };
  }, []);
  const q = query.trim().toLowerCase();
  // the tools that match the most words of what was typed (small words like "the" don't count)
  const matches = useMemo(() => {
    const out = new Set<string>();
    const words = q.split(/[^a-z0-9-]+/).filter((w) => w.length > 2 && !STOP.has(w));
    if (!words.length) return out;
    const scored = SECTIONS.flatMap((s) => s.tools).map((t) => {
      const hay = `${t.name} ${t.detail} ${t.words}`.toLowerCase();
      return { id: t.id, score: words.filter((w) => hay.includes(w)).length };
    });
    const best = Math.max(...scored.map((x) => x.score));
    if (best > 0) for (const x of scored) if (x.score === best) out.add(x.id);
    return out;
  }, [q]);

  const find = () => {
    const first = SECTIONS.flatMap((s) => s.tools).find((t) => matches.has(t.id));
    if (!first) return setNote(q ? "No tool matches yet. Try words like “background”, “voice”, “noise” or “subtitles”." : null);
    setNote(null);
    const el = list.current?.querySelector<HTMLButtonElement>(`[data-tool="${first.id}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.focus({ preventScroll: true });
  };

  return (
    <section aria-labelledby="ai-tools-title" className="panel relative flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="ai-tools">
      {/* narrow panel: the title (with Settings and ×) on top, the "describe" box on its own row below;
          wide panel (a container query): all on one line */}
      <header className="@container border-b border-line px-4 py-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 @xl:grid-cols-[minmax(0,1fr)_minmax(15rem,1.4fr)_auto]">
          <div className="col-start-1 row-start-1 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 id="ai-tools-title" className="whitespace-nowrap text-lg font-semibold">
                AI Tools
              </h2>
              <button type="button" onClick={onSettings} className="flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-line px-2 text-xs text-muted hover:border-control hover:text-ink" aria-label="AI settings: API keys" title="Your API keys (Gemini, Grok, OpenAI…) and switching AI features on or off" data-testid="ai-settings-button">
                <Icon name="settings" className="size-3.5" />
                Settings
              </button>
            </div>
            <p className="text-xs text-muted">
              Use AI to create, edit and enhance your videos faster.
              {credits === null && creditsLoading && <Skeleton className="ml-1 inline-block h-3 w-24 align-middle" />}
              {credits !== null && (
                <>
                  {" "}
                  <a href="/account/billing" className={`font-semibold ${credits > 0 ? "text-primary" : "text-red-500"} hover:underline`} title="AI tools use credits unless you add your own key in Settings">
                    {credits} AI credits left
                  </a>
                </>
              )}
            </p>
          </div>
          <form
            className="col-span-2 row-start-2 flex min-w-0 items-center gap-2 rounded-lg border border-fuchsia-500/60 bg-canvas px-2.5 py-1.5 focus-within:border-fuchsia-400 @xl:col-span-1 @xl:col-start-2 @xl:row-start-1 @xl:self-center"
            onSubmit={(e) => {
              e.preventDefault();
              find();
            }}
            role="search"
          >
            <Icon name="ai" className="size-4 text-fuchsia-400" />
            <input
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
              placeholder="Describe what you want to do…"
              aria-label="Describe what you want to do (finds the right tool)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" className="flex size-7 items-center justify-center rounded-md bg-primary text-white" aria-label="Find the tool">
              <Icon name="chevronRight" className="size-4" />
            </button>
          </form>
          <button type="button" onClick={onClose} className="col-start-2 row-start-1 flex size-8 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-ink @xl:col-start-3" aria-label="Close AI Tools" title="Back to the inspector">
            <Icon name="close" className="size-4" />
          </button>
        </div>
      </header>
      <p className="border-b border-line px-4 py-1.5 text-xs text-muted" aria-live="polite">
        {note ?? (target ? <>Working on: <strong className="text-ink">{target}</strong></> : "Select a clip on the timeline for the clip tools.")}
      </p>
      <div ref={list} className="relative min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {SECTIONS.map((s) => (
          <section key={s.title} aria-label={s.title} className="mb-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <span className="flex size-6 items-center justify-center rounded-md bg-primary-soft text-link">
                <Icon name={s.icon} className="size-3.5" />
              </span>
              {s.title}
            </h3>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.9rem,1fr))] gap-2">
              {s.tools.map((t) => {
                const feat = featureById(t.id);
                const ready = feat?.status === "ready";
                const why = ready ? whyNot[t.id as AiToolId] : null;
                const hit = matches.has(t.id);
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      data-tool={t.id}
                      aria-disabled={!ready || !!why}
                      title={!ready ? `${t.name} · coming ${feat?.status === "later" ? "later (needs a cloud AI service)" : "soon"}. ${feat?.detail ?? ""}` : (why ?? (feat?.beta ? `Beta: ${feat.beta}` : t.detail))}
                      onClick={() => {
                        if (!ready) return setNote(`${t.name} is coming ${feat?.status === "later" ? "later — it needs a cloud AI service" : "soon"}: ${feat?.detail ?? t.detail}`);
                        if (why) return setNote(why);
                        // a Beta tool still opens, with an honest line about what it does today
                        setNote(feat?.beta ? `${t.name} (Beta): ${feat.beta}` : null);
                        onTool(t.id as AiToolId);
                      }}
                      className={`group flex w-full flex-col overflow-hidden rounded-lg border text-left transition-colors ${hit ? "border-fuchsia-400 ring-2 ring-fuchsia-400/50" : "border-line hover:border-control"} ${ready ? "" : "opacity-80"}`}
                    >
                      <span className={`relative flex aspect-[16/9] items-center justify-center bg-gradient-to-br ${t.art}`}>
                        <Icon name={t.icon} className="size-7 text-white/90 drop-shadow" strokeWidth={1.5} />
                        {ready && feat?.beta && <span className="absolute left-1.5 top-1.5 rounded bg-amber-500/95 px-1.5 py-px text-[0.625rem] font-semibold text-black">Beta</span>}
                        {!ready && <span className="soon absolute right-1.5 top-1.5">{feat?.status === "later" ? "Later" : "Soon"}</span>}
                        {ready && (t.id === "grok" ? <span className="absolute right-1.5 top-1.5 rounded bg-black/90 px-1.5 py-px text-[0.625rem] font-semibold text-white border border-white/20">xAI Grok</span> : GEMINI_TOOLS.has(t.id) ? <GeminiBadge className="absolute right-1.5 top-1.5 !bg-white/90 !text-indigo-700" /> : <span className="absolute right-1.5 top-1.5 rounded bg-emerald-500/90 px-1.5 py-px text-[0.625rem] font-semibold text-white">Ready</span>)}
                      </span>
                      <span className="flex flex-col gap-0.5 px-1.5 py-1.5">
                        <span className="text-xs font-medium leading-tight group-hover:text-ink">{t.name}</span>
                        <span className="text-[0.6875rem] leading-snug text-muted">{t.detail}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <p className="pb-2 text-xs text-muted">
          Ready tools run on this Mac (free, private), except the ones marked Gemini: they send what you ask for to Google, on your Gemini key. “Soon” tools are planned; “Later” ones need a cloud AI service.{" "}
          <a href="/roadmap" target="_blank" rel="noreferrer" className="text-link underline">
            See everything that&apos;s coming
          </a>
        </p>
      </div>
    </section>
  );
}
