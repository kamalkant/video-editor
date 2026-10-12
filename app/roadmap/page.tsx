import type { Metadata } from "next";
import { Icon } from "@/components/ui/Icon";
import Link from "next/link";
import { AREAS, FEATURES, STATUS_LABEL, type Area, type Status } from "@/lib/roadmap";

const ROADMAP_TITLE = "Product Roadmap & What's New · ViPlay Studio";
const ROADMAP_DESC = "Explore the live feature roadmap for ViPlay Studio: AI video editing tools, word-by-word captions, neural dubbing, transparent web avatars, and upcoming releases.";

export const metadata: Metadata = {
  title: ROADMAP_TITLE,
  description: ROADMAP_DESC,
  alternates: {
    canonical: "/roadmap",
  },
  openGraph: {
    title: ROADMAP_TITLE,
    description: ROADMAP_DESC,
    url: "/roadmap",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: ROADMAP_TITLE,
    description: ROADMAP_DESC,
  },
};

const ORDER: Area[] = ["edit", "record", "text", "audio", "background", "ai", "subtitles", "effects", "transitions", "elements", "brand", "templates", "export"];
const DOT: Record<Status, string> = { ready: "bg-emerald-400", next: "bg-sky-400", later: "bg-fuchsia-400" };
const PILL: Record<Status, string> = {
  ready: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  next: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  later: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300",
};

/** "What's coming": the whole plan on one page, to share with others (reads lib/roadmap). */
export default function RoadmapPage() {
  // "Ready" counts only what fully does what it says; Beta tools are counted on their own
  const count = (s: Status) => FEATURES.filter((f) => f.status === s && !(s === "ready" && f.beta)).length;
  const betaCount = FEATURES.filter((f) => f.status === "ready" && f.beta).length;
  return (
    <main id="main" className="min-h-dvh bg-app px-4 py-8 text-ink sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center">
              <img src="/vdo-icon.png" alt="ViPlay Studio" className="size-full object-contain drop-shadow-[0_2px_8px_rgba(59,130,246,0.3)]" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                ViPlay <span className="text-muted">Studio</span>
              </h1>
              <p className="text-sm text-muted">What it does today, and what&apos;s coming next.</p>
            </div>
          </div>
          <Link href="/editor" className="btn btn-primary">
            Open the editor
          </Link>
        </header>

        <section aria-label="Summary" className="grid gap-3 sm:grid-cols-3">
          {(["ready", "next", "later"] as const).map((s) => (
            <div key={s} className="panel flex flex-col gap-1 p-4">
              <span className="flex items-center gap-2 text-sm text-muted">
                <span className={`size-2.5 rounded-full ${DOT[s]}`} aria-hidden="true" />
                {STATUS_LABEL[s]}
              </span>
              <span className="text-3xl font-bold tabular-nums">{count(s)}</span>
              <span className="text-xs text-muted">{s === "ready" ? `Working in the editor now (+ ${betaCount} in Beta)` : s === "next" ? "Planned, free, running on the Mac" : "Needs a cloud AI service (API key)"}</span>
            </div>
          ))}
        </section>

        {ORDER.map((area) => {
          const list = FEATURES.filter((f) => f.area === area);
          if (!list.length) return null;
          return (
            <section key={area} aria-labelledby={`area-${area}`} className="flex flex-col gap-3">
              <div>
                <h2 id={`area-${area}`} className="text-lg font-semibold">
                  {AREAS[area].label}
                </h2>
                <p className="text-sm text-muted">{AREAS[area].blurb}</p>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {list
                  .slice()
                  .sort((a, b) => ["ready", "next", "later"].indexOf(a.status) - ["ready", "next", "later"].indexOf(b.status))
                  .map((f) => (
                    <li key={f.id} className="panel flex items-start justify-between gap-3 p-3">
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-medium">{f.name}</span>
                        <span className="text-xs text-muted">{f.detail}</span>
                        {f.beta && <span className="text-xs text-amber-500">Beta: {f.beta}</span>}
                      </span>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold ${f.beta ? "border-amber-500/40 bg-amber-500/10 text-amber-400" : PILL[f.status]}`}>{f.status === "ready" ? (f.beta ? "Beta" : "Ready") : f.status === "next" ? "Soon" : "Later"}</span>
                    </li>
                  ))}
              </ul>
            </section>
          );
        })}

        <footer className="border-t border-line pt-4 text-xs text-muted">
          Editing runs on your own computer. Features marked ✦ Gemini (or Grok) send only what they need (the sound, a frame or your words) to Google or xAI, when you click them. “Beta” means usable today but not yet everything the name promises: the amber line says what it really does. “Soon” features are planned in this order, easy ones first. “Later” features need a paid cloud AI service.
        </footer>
      </div>
    </main>
  );
}
