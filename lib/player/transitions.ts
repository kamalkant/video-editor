import { clipLength, mainStarts, overlapAt, type AnyClip, type ClipTransition, type MainClip, type OverlayClip, type TimelineDoc } from "../edit/doc";

/**
 * Transitions between two clips on Video 1. The clips overlap for the
 * transition's length (the video gets that much shorter, like in Premiere
 * or CapCut). The preview uses transitionState(); the export builds the
 * same curves as FFmpeg expressions (transitionExpr) — the anim.ts pattern.
 */

export const TRANSITION_TYPES = ["crossfade", "dipBlack", "dipWhite", "slideLeft", "slideRight", "slideUp", "slideDown", "pushLeft", "pushRight", "wipeLeft", "wipeRight", "wipeUp", "wipeDown", "zoomIn", "zoomOut", "circleOpen", "circleClose", "spin"] as const;
export type TransitionType = (typeof TRANSITION_TYPES)[number];
export type Transition = { type: TransitionType; duration: number };

export const TRANSITIONS: Record<TransitionType, { label: string; hint: string }> = {
  crossfade: { label: "Crossfade", hint: "The next clip fades in over this one" },
  dipBlack: { label: "Dip to black", hint: "Fade to black, then into the next clip" },
  dipWhite: { label: "Dip to white", hint: "A flash of white between the clips" },
  slideLeft: { label: "Slide left", hint: "The next clip slides in from the right" },
  slideRight: { label: "Slide right", hint: "The next clip slides in from the left" },
  slideUp: { label: "Slide up", hint: "The next clip slides up from below" },
  slideDown: { label: "Slide down", hint: "The next clip slides down from above" },
  pushLeft: { label: "Push left", hint: "The next clip pushes this one out to the left" },
  pushRight: { label: "Push right", hint: "The next clip pushes this one out to the right" },
  wipeLeft: { label: "Wipe left", hint: "A straight edge sweeps from right to left, showing the next clip" },
  wipeRight: { label: "Wipe right", hint: "A straight edge sweeps from left to right" },
  wipeUp: { label: "Wipe up", hint: "A straight edge sweeps up from the bottom" },
  wipeDown: { label: "Wipe down", hint: "A straight edge sweeps down from the top" },
  zoomIn: { label: "Zoom in", hint: "The next clip comes in big and settles to its size" },
  zoomOut: { label: "Zoom out", hint: "The next clip grows in from smaller" },
  circleOpen: { label: "Circle open", hint: "The next clip opens from a circle in the middle" },
  circleClose: { label: "Circle close", hint: "This clip closes into a circle, the next one around it" },
  spin: { label: "Spin", hint: "The next clip spins and grows into place" },
};

export const DEFAULT_TRANSITION: Transition = { type: "crossfade", duration: 0.5 };
export const MIN_TRANSITION = 0.1;
export const MAX_TRANSITION = 3;

/** The overlap actually used: never more than half of either clip. */
export const effectiveDuration = (t: Transition | undefined, prevLen: number, nextLen: number) => (t ? Math.max(0, Math.min(t.duration, prevLen / 2, nextLen / 2)) : 0);

/**
 * How a clip looks during a transition: opacity, offset (a share of the canvas),
 * and for some: a size factor, an extra angle (degrees) and a reveal (the part
 * of the clip that shows: a wipe from one side, or a circle; p = 0…1).
 */
export type Reveal = { kind: "wipeLeft" | "wipeRight" | "wipeUp" | "wipeDown" | "circleOpen" | "circleClose"; p: number };
export type LayerState = { alpha: number; dx: number; dy: number; scale?: number; rot?: number; reveal?: Reveal };
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Smooth start and end (smoothstep). */
export const ease = (p: number) => {
  const q = clamp01(p);
  return q * q * (3 - 2 * q);
};
export const isDip = (t: TransitionType) => t === "dipBlack" || t === "dipWhite";

/**
 * At progress p (0 → 1 through the overlap): how the outgoing and incoming
 * clips look (opacity; offset as a share of the canvas), and the dip color layer.
 */
export function transitionState(type: TransitionType, p: number): { out: LayerState; in: LayerState; dip: { color: string; alpha: number } | null } {
  const e = ease(p);
  const out: LayerState = { alpha: 1, dx: 0, dy: 0 };
  const inn: LayerState = { alpha: 1, dx: 0, dy: 0 };
  let dip: { color: string; alpha: number } | null = null;
  switch (type) {
    case "crossfade":
      inn.alpha = clamp01(p);
      break;
    case "dipBlack":
    case "dipWhite":
      // first half: the color rises over the outgoing clip; second half: it fades off the incoming one
      inn.alpha = p >= 0.5 ? 1 : 0;
      dip = { color: type === "dipBlack" ? "#000000" : "#ffffff", alpha: clamp01(1 - Math.abs(2 * p - 1)) };
      break;
    case "slideLeft":
      inn.dx = 1 - e;
      break;
    case "slideRight":
      inn.dx = -(1 - e);
      break;
    case "slideUp":
      inn.dy = 1 - e;
      break;
    case "slideDown":
      inn.dy = -(1 - e);
      break;
    case "pushLeft":
      inn.dx = 1 - e;
      out.dx = -e;
      break;
    case "pushRight":
      inn.dx = -(1 - e);
      out.dx = e;
      break;
    case "wipeLeft":
    case "wipeRight":
    case "wipeUp":
    case "wipeDown":
    case "circleOpen":
    case "circleClose":
      inn.reveal = { kind: type, p: e };
      break;
    case "zoomIn":
      inn.alpha = clamp01(p);
      inn.scale = 1 + ZOOM * (1 - e);
      break;
    case "zoomOut":
      inn.alpha = clamp01(p);
      inn.scale = 1 - ZOOM * (1 - e);
      break;
    case "spin":
      inn.alpha = clamp01(p);
      inn.scale = 0.3 + 0.7 * e;
      inn.rot = -180 * (1 - e);
      break;
  }
  return { out, in: inn, dip };
}
/** How much bigger / smaller a zoom transition starts. */
const ZOOM = 0.3;

/** Is pixel (x, y) of a w × h clip shown by this reveal? (the export's mask uses the same rule) */
export function revealShows(r: Reveal, x: number, y: number, w: number, h: number): boolean {
  const e = r.p;
  switch (r.kind) {
    case "wipeLeft":
      return x >= w * (1 - e);
    case "wipeRight":
      return x <= w * e;
    case "wipeUp":
      return y >= h * (1 - e);
    case "wipeDown":
      return y <= h * e;
    case "circleOpen":
      return Math.hypot(x - w / 2, y - h / 2) <= (Math.hypot(w, h) / 2) * e;
    case "circleClose":
      return Math.hypot(x - w / 2, y - h / 2) >= (Math.hypot(w, h) / 2) * (1 - e);
  }
}

const n4 = (v: number) => (Math.round(v * 10000) / 10000).toString();

/**
 * The same curves for FFmpeg, for a transition starting at timeline time s
 * lasting d: x / y offsets (pixels) as expressions of t for the incoming and
 * outgoing overlays, the incoming clip's alpha fade, and when it starts to show.
 */
export function transitionExpr(type: TransitionType, s: number, d: number, W: number, H: number) {
  const p = `clip((t-${n4(s)})/${n4(d)}\\,0\\,1)`;
  const e = `(${p}*${p}*(3-2*${p}))`;
  const inn = { x: "", y: "", fade: null as null | { st: number; d: number }, showFrom: s, scale: null as string | null, rot: null as string | null, mask: null as string | null };
  // (inside the clip's own filters: its time starts at the transition's start)
  const pl = `clip(t/${n4(d)}\\,0\\,1)`;
  const el = `(${pl}*${pl}*(3-2*${pl}))`;
  const out = { x: "", y: "" };
  switch (type) {
    case "crossfade":
      inn.fade = { st: 0, d };
      break;
    case "dipBlack":
    case "dipWhite":
      inn.showFrom = s + d / 2;
      break;
    case "slideLeft":
      inn.x = `+(1-${e})*${W}`;
      break;
    case "slideRight":
      inn.x = `-(1-${e})*${W}`;
      break;
    case "slideUp":
      inn.y = `+(1-${e})*${H}`;
      break;
    case "slideDown":
      inn.y = `-(1-${e})*${H}`;
      break;
    case "pushLeft":
      inn.x = `+(1-${e})*${W}`;
      out.x = `-${e}*${W}`;
      break;
    case "pushRight":
      inn.x = `-(1-${e})*${W}`;
      out.x = `+${e}*${W}`;
      break;
    case "wipeLeft":
    case "wipeRight":
    case "wipeUp":
    case "wipeDown":
    case "circleOpen":
    case "circleClose":
      inn.mask = revealExpr(type, d);
      break;
    case "zoomIn":
      inn.fade = { st: 0, d };
      inn.scale = `(1+${ZOOM}*(1-${el}))`;
      break;
    case "zoomOut":
      inn.fade = { st: 0, d };
      inn.scale = `(1-${ZOOM}*(1-${el}))`;
      break;
    case "spin":
      inn.fade = { st: 0, d };
      inn.scale = `(0.3+0.7*${el})`;
      inn.rot = `(-180*(1-${el}))`;
      break;
  }
  return { in: inn, out };
}

/**
 * A reveal as a geq alpha rule (0 / 255) over the clip's own pixels X, Y (of W × H)
 * and the mask's time T (0 … d: it starts with the transition). Its last frame
 * shows the whole clip (and it stays so after).
 */
function revealExpr(type: Reveal["kind"], d: number): string {
  const p = `clip(T/${n4(Math.max(d - 1 / 60, 1e-3))}\\,0\\,1)`;
  const e = `(${p}*${p}*(3-2*${p}))`;
  const r = `hypot(X-W/2\\,Y-H/2)`;
  const R = `hypot(W\\,H)/2`;
  const cond =
    type === "wipeLeft" ? `gte(X\\,W*(1-${e}))` : type === "wipeRight" ? `lte(X\\,W*${e})` : type === "wipeUp" ? `gte(Y\\,H*(1-${e}))` : type === "wipeDown" ? `lte(Y\\,H*${e})` : type === "circleOpen" ? `lte(${r}\\,${R}*${e})` : `gte(${r}\\,${R}*(1-${e}))`;
  return `255*${cond}`;
}

/** Sound through the overlap: the outgoing clip fades out and the incoming one in (dips: one after the other). */
export function transitionAudio(type: TransitionType, d: number): { outFade: { st: number; d: number }; inFade: { st: number; d: number } } {
  return isDip(type) ? { outFade: { st: 0, d: d / 2 }, inFade: { st: d / 2, d: d / 2 } } : { outFade: { st: 0, d }, inFade: { st: 0, d } };
}


/**
 * At timeline time t on Video 1: how each clip in a transition looks (by clip
 * id) and the dip color layer, if any.
 */
export function mainTransitionAt(clips: MainClip[], starts: number[], t: number): { states: Map<string, LayerState>; dip: { color: string; alpha: number } | null } {
  const states = new Map<string, LayerState>();
  let dip: { color: string; alpha: number } | null = null;
  for (let i = 1; i < clips.length; i++) {
    const d = overlapAt(clips, i);
    const tr = clips[i].transitionIn;
    if (!tr || d <= 0) continue;
    const s = starts[i];
    if (t < s - 1e-6 || t >= s + d) continue;
    const st = transitionState(tr.type, (t - s) / d);
    states.set(clips[i].id, st.in);
    states.set(clips[i - 1].id, st.out);
    if (st.dip) dip = st.dip;
  }
  return { states, dip };
}

/** For the export: each Video 1 clip's incoming and outgoing transition (type, start, length). */
export function mainTransitions(clips: MainClip[], starts: number[]): Map<string, { in?: { type: TransitionType; s: number; d: number }; out?: { type: TransitionType; s: number; d: number } }> {
  const out = new Map<string, { in?: { type: TransitionType; s: number; d: number }; out?: { type: TransitionType; s: number; d: number } }>();
  for (let i = 1; i < clips.length; i++) {
    const d = overlapAt(clips, i);
    const tr = clips[i].transitionIn;
    if (!tr || d <= 0) continue;
    const x = { type: tr.type, s: starts[i], d };
    out.set(clips[i].id, { ...(out.get(clips[i].id) ?? {}), in: x });
    out.set(clips[i - 1].id, { ...(out.get(clips[i - 1].id) ?? {}), out: x });
  }
  return out;
}

/** Transitions on an overlay track (by clip id). */
export function overlayTransitions(clips: OverlayClip[]): Map<string, { in?: { type: TransitionType; s: number; d: number }; out?: { type: TransitionType; s: number; d: number } }> {
  const out = new Map<string, { in?: { type: TransitionType; s: number; d: number }; out?: { type: TransitionType; s: number; d: number } }>();
  const sorted = [...clips].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const tr = (curr as { transitionIn?: ClipTransition }).transitionIn;
    if (!tr) continue;
    const prevEnd = prev.start + clipLength(prev);
    const d = Math.max(0, Math.min(tr.duration, prevEnd - curr.start, clipLength(prev) / 2, clipLength(curr) / 2));
    if (d <= 0) continue;
    const x = { type: tr.type, s: curr.start, d };
    out.set(curr.id, { ...(out.get(curr.id) ?? {}), in: x });
    out.set(prev.id, { ...(out.get(prev.id) ?? {}), out: x });
  }
  return out;
}

/** For playback & export: every track's incoming and outgoing transitions (Video 1 + overlays). */
export function docTransitions(doc: TimelineDoc): Map<string, { in?: { type: TransitionType; s: number; d: number }; out?: { type: TransitionType; s: number; d: number } }> {
  const out = new Map<string, { in?: { type: TransitionType; s: number; d: number }; out?: { type: TransitionType; s: number; d: number } }>();
  for (const tr of doc.tracks) {
    if (tr.kind === "main") {
      const mt = mainTransitions(tr.clips, mainStarts(tr.clips));
      for (const [k, v] of mt) out.set(k, v);
    } else if (tr.kind === "overlay" && !tr.hidden) {
      const ot = overlayTransitions(tr.clips as OverlayClip[]);
      for (const [k, v] of ot) out.set(k, v);
    }
  }
  return out;
}

/**
 * At timeline time t across all tracks: how each clip in a transition looks
 * (by clip id) and the active dip color, if any.
 */
export function docTransitionsAt(doc: TimelineDoc, t: number): { states: Map<string, LayerState>; dip: { color: string; alpha: number } | null } {
  const states = new Map<string, LayerState>();
  let dip: { color: string; alpha: number } | null = null;
  for (const tr of doc.tracks) {
    if (tr.kind === "main") {
      const mt = mainTransitionAt(tr.clips, mainStarts(tr.clips), t);
      for (const [k, v] of mt.states) states.set(k, v);
      if (mt.dip) dip = mt.dip;
    } else if (tr.kind === "overlay" && !tr.hidden) {
      const sorted = [...(tr.clips as (AnyClip & { start: number })[])].sort((a, b) => a.start - b.start);
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        const trIn = (curr as { transitionIn?: ClipTransition }).transitionIn;
        if (!trIn) continue;
        const prevEnd = prev.start + clipLength(prev);
        const d = Math.max(0, Math.min(trIn.duration, prevEnd - curr.start, clipLength(prev) / 2, clipLength(curr) / 2));
        if (d <= 0) continue;
        const s = curr.start;
        if (t < s - 1e-6 || t >= s + d) continue;
        const st = transitionState(trIn.type, (t - s) / d);
        states.set(curr.id, st.in);
        states.set(prev.id, st.out);
        if (st.dip) dip = st.dip;
      }
    }
  }
  return { states, dip };
}
