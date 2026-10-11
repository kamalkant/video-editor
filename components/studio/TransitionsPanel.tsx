"use client";

import { LabeledSlider } from "@/components/ui/LabeledSlider";
import type { ClipTransition } from "@/lib/edit/doc";
import { MAX_TRANSITION, MIN_TRANSITION, TRANSITION_TYPES, TRANSITIONS, type TransitionType } from "@/lib/player/transitions";

/** Animations for the little previews (clip A → clip B). */
const KEYFRAMES = `
@keyframes tr-fade { 0%,15% { opacity: 0 } 70%,100% { opacity: 1 } }
@keyframes tr-dip { 0%,10% { opacity: 0 } 45%,55% { opacity: 1 } 90%,100% { opacity: 0 } }
@keyframes tr-show { 0%,49% { opacity: 0 } 50%,100% { opacity: 1 } }
@keyframes tr-in-l { 0%,15% { transform: translateX(100%) } 70%,100% { transform: none } }
@keyframes tr-in-r { 0%,15% { transform: translateX(-100%) } 70%,100% { transform: none } }
@keyframes tr-in-u { 0%,15% { transform: translateY(100%) } 70%,100% { transform: none } }
@keyframes tr-in-d { 0%,15% { transform: translateY(-100%) } 70%,100% { transform: none } }
@keyframes tr-out-l { 0%,15% { transform: none } 70%,100% { transform: translateX(-100%) } }
@keyframes tr-out-r { 0%,15% { transform: none } 70%,100% { transform: translateX(100%) } }
@keyframes tr-wipe-l { 0%,15% { clip-path: inset(0 0 0 100%) } 70%,100% { clip-path: inset(0 0 0 0) } }
@keyframes tr-wipe-r { 0%,15% { clip-path: inset(0 100% 0 0) } 70%,100% { clip-path: inset(0 0 0 0) } }
@keyframes tr-wipe-u { 0%,15% { clip-path: inset(100% 0 0 0) } 70%,100% { clip-path: inset(0 0 0 0) } }
@keyframes tr-wipe-d { 0%,15% { clip-path: inset(0 0 100% 0) } 70%,100% { clip-path: inset(0 0 0 0) } }
@keyframes tr-zoom-in { 0%,15% { opacity: 0; transform: scale(1.3) } 70%,100% { opacity: 1; transform: none } }
@keyframes tr-zoom-out { 0%,15% { opacity: 0; transform: scale(0.7) } 70%,100% { opacity: 1; transform: none } }
@keyframes tr-circle-open { 0%,15% { clip-path: circle(0% at 50% 50%) } 70%,100% { clip-path: circle(71% at 50% 50%) } }
@keyframes tr-circle-close { 0%,15% { -webkit-mask: radial-gradient(circle at 50% 50%, transparent 71%, #000 71%); mask: radial-gradient(circle at 50% 50%, transparent 71%, #000 71%) } 45% { -webkit-mask: radial-gradient(circle at 50% 50%, transparent 35%, #000 35%); mask: radial-gradient(circle at 50% 50%, transparent 35%, #000 35%) } 70%,100% { -webkit-mask: none; mask: none } }
@keyframes tr-spin { 0%,15% { opacity: 0; transform: rotate(-180deg) scale(0.3) } 70%,100% { opacity: 1; transform: none } }
`;
const ANIM: Record<TransitionType, { a?: string; b?: string; dip?: string }> = {
  crossfade: { b: "tr-fade" },
  dipBlack: { b: "tr-show", dip: "#000" },
  dipWhite: { b: "tr-show", dip: "#fff" },
  slideLeft: { b: "tr-in-l" },
  slideRight: { b: "tr-in-r" },
  slideUp: { b: "tr-in-u" },
  slideDown: { b: "tr-in-d" },
  pushLeft: { a: "tr-out-l", b: "tr-in-l" },
  pushRight: { a: "tr-out-r", b: "tr-in-r" },
  wipeLeft: { b: "tr-wipe-l" },
  wipeRight: { b: "tr-wipe-r" },
  wipeUp: { b: "tr-wipe-u" },
  wipeDown: { b: "tr-wipe-d" },
  zoomIn: { b: "tr-zoom-in" },
  zoomOut: { b: "tr-zoom-out" },
  circleOpen: { b: "tr-circle-open" },
  circleClose: { b: "tr-circle-close" },
  spin: { b: "tr-spin" },
};

/** A small moving picture of a transition ("none": a plain cut, clip B just appears). */
export function TransitionPreview({ type }: { type: TransitionType | "none" }) {
  const x = type === "none" ? { b: "tr-show" } : ANIM[type];
  const run = (name?: string) => (name ? { animation: `${name} 1.8s ease-in-out infinite` } : undefined);
  return (
    <span aria-hidden="true" className="relative block aspect-video w-full overflow-hidden rounded-md bg-slate-900">
      <style>{KEYFRAMES}</style>
      <span className="absolute inset-0 bg-gradient-to-br from-sky-500 to-indigo-700" style={run(x.a)} />
      <span className="absolute inset-0 bg-gradient-to-br from-amber-400 to-rose-600" style={run(x.b)} />
      {x.dip && <span className="absolute inset-0" style={{ background: x.dip, ...run("tr-dip") }} />}
      <span className="absolute bottom-0.5 left-1 text-[0.5625rem] font-bold text-white/80">A→B</span>
    </span>
  );
}

/** Transitions (rail panel): pick one for the cut at the playhead. */
export function TransitionsPanel({ onApply, onApplyAll, onNone, onNoneAll, hint }: { onApply: (type: TransitionType) => void; onApplyAll: (type: TransitionType) => void; onNone: () => void; onNoneAll: () => void; hint: string | null }) {
  return (
    <div className="flex flex-col gap-3" data-testid="transitions-panel">
      <p className="text-xs text-muted">{hint ?? "Click one to put it on the cut nearest the playhead. The two clips overlap for its length."}</p>
      <ul className="grid grid-cols-2 gap-2">
        <li>
          <button type="button" onClick={onNone} aria-label="No transition: a plain cut" title="A plain cut: the next clip just starts" className="flex w-full flex-col gap-1 rounded-lg border border-line p-1 text-left text-[0.6875rem] hover:border-primary hover:bg-primary-soft" data-testid="transition-none">
            <TransitionPreview type="none" />
            None
          </button>
        </li>
        {TRANSITION_TYPES.map((t) => (
          <li key={t}>
            <button type="button" onClick={() => onApply(t)} aria-label={`Add ${TRANSITIONS[t].label}: ${TRANSITIONS[t].hint}`} title={TRANSITIONS[t].hint} className="flex w-full flex-col gap-1 rounded-lg border border-line p-1 text-left text-[0.6875rem] hover:border-primary hover:bg-primary-soft">
              <TransitionPreview type={t} />
              {TRANSITIONS[t].label}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-1.5">
        <button type="button" className="btn btn-secondary text-xs" onClick={() => onApplyAll("crossfade")}>
          Crossfade every cut on Video 1
        </button>
        <button type="button" className="btn btn-secondary text-xs" onClick={onNoneAll}>
          Remove every transition on Video 1
        </button>
      </div>
      <p className="text-[0.6875rem] text-muted">
        <span className="soon mr-1">Soon</span> Zoom, spin and glitch transitions.
      </p>
    </div>
  );
}

/** Inspector card for the selected transition. */
export function TransitionCard({ between, transition, maxLength, onChange, onRemove, onApplyAll }: { between: string; transition: ClipTransition; maxLength: number; onChange: (t: ClipTransition, group?: string) => void; onRemove: () => void; onApplyAll: () => void }) {
  return (
    <section aria-labelledby="transition-title" className="panel flex flex-col" data-testid="transition-card">
      <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <h2 id="transition-title" className="text-sm font-semibold">
          Transition
        </h2>
        <button type="button" className="text-xs text-danger underline" onClick={onRemove}>
          Remove
        </button>
      </header>
      <div className="flex flex-col gap-2.5 p-3">
        <p className="truncate text-xs text-muted" title={between}>
          {between}
        </p>
        <ul className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Transition type">
          <li>
            <button type="button" role="radio" aria-checked={false} onClick={onRemove} title="A plain cut: removes this transition" className="flex w-full flex-col gap-1 rounded-md border border-line p-1 text-[0.625rem] hover:border-control">
              <TransitionPreview type="none" />
              None
            </button>
          </li>
          {TRANSITION_TYPES.map((t) => (
            <li key={t}>
              <button type="button" role="radio" aria-checked={transition.type === t} onClick={() => onChange({ ...transition, type: t })} className={`flex w-full flex-col gap-1 rounded-md border p-1 text-[0.625rem] ${transition.type === t ? "border-primary bg-primary-soft" : "border-line hover:border-control"}`}>
                <TransitionPreview type={t} />
                {TRANSITIONS[t].label}
              </button>
            </li>
          ))}
        </ul>
        <LabeledSlider label="Length" value={transition.duration} min={MIN_TRANSITION} max={Math.max(MIN_TRANSITION, Math.min(MAX_TRANSITION, maxLength))} step={0.1} decimals={1} unit={{ short: "s", spoken: "seconds" }} valueText={(v) => `${v.toFixed(1)} seconds`} onChange={(v) => onChange({ ...transition, duration: v }, "transition:length")} />
        <p className="-mt-1 text-[0.6875rem] text-muted">At most half of the shorter clip ({maxLength.toFixed(1)} s here).</p>
        <button type="button" className="btn btn-secondary text-xs" onClick={onApplyAll}>
          Use this on every cut
        </button>
      </div>
    </section>
  );
}
