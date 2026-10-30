"use client";

import { AREAS, featuresIn, STATUS_LABEL, type Area, type Status } from "@/lib/roadmap";
import { ACCOUNTS_URL } from "@/lib/apps";

const BADGE: Record<Status, string> = {
  ready: "rounded bg-emerald-500/90 px-1.5 py-px text-2xs font-semibold text-white",
  next: "soon",
  later: "soon opacity-80",
};

/**
 * A panel for a part of the editor (Audio, Subtitles, Brand Kit…): what works
 * today (click to use it) and what's coming, from lib/roadmap.
 */
export function SoonPanel({ area, actions = {}, hideReady = false }: { area: Area; actions?: Record<string, () => void>; /** under a real panel: only what's coming */ hideReady?: boolean }) {
  const a = AREAS[area];
  const items = featuresIn(area).filter((f) => !hideReady || f.status !== "ready");
  const groups = (["ready", "next", "later"] as const).map((s) => ({ s, list: items.filter((f) => f.status === s) })).filter((g) => g.list.length);
  return (
    <div className="flex flex-col gap-3" data-testid={`soon-${area}`}>
      {!hideReady && <p className="text-xs text-muted">{a.blurb}</p>}
      {groups.map((g) => (
        <section key={g.s} aria-label={STATUS_LABEL[g.s]} className="flex flex-col gap-1.5">
          <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted">{STATUS_LABEL[g.s]}</h3>
          <ul className="flex flex-col gap-1.5">
            {g.list.map((f) => {
              const act = actions[f.id] as (() => void) | undefined;
              const body = (
                <>
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{f.name}</span>
                    <span className={BADGE[f.status]}>{f.status === "ready" ? (act ? "Use" : f.beta ? "Beta" : "Ready") : f.status === "next" ? "Soon" : "Later"}</span>
                  </span>
                  <span className="text-2xs leading-snug text-muted">{f.detail}</span>
                  {f.beta && <span className="text-2xs leading-snug text-amber-500">Beta: {f.beta}</span>}
                </>
              );
              return (
                <li key={f.id}>
                  {act ? (
                    <button type="button" onClick={act} className="flex w-full flex-col gap-0.5 rounded-lg border border-line bg-raised/40 px-2.5 py-2 text-left hover:border-primary hover:bg-primary-soft">
                      {body}
                    </button>
                  ) : (
                    <div className={`flex flex-col gap-0.5 rounded-lg border border-line px-2.5 py-2 ${f.status === "ready" ? "bg-raised/40" : "border-dashed"}`} title={f.status === "ready" ? undefined : `${f.name} · coming ${f.status === "later" ? "later (needs a cloud AI service)" : "soon"}`}>
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <a href={`${ACCOUNTS_URL}/roadmap`} target="_blank" rel="noreferrer" className="text-xs text-link underline">
        See everything that&apos;s coming (a page you can share)
      </a>
    </div>
  );
}
