"use client";

import { fadeAlpha } from "./layout";
import { transitionAudio, type TransitionType } from "./transitions";
import { evaluateVolumeAutomation } from "../audio/smartMix";
import type { VolumeKeyframe } from "../edit/doc";

/**
 * How loud a clip plays in the preview, the same rules as the export
 * (lib/render/compose): volume (0–200%) × its fades × the Video 1 transition
 * fades × ducking. The sound goes through a WebAudio gain per element, so
 * 150% is louder than 100% (an element's own `volume` stops at 100%, and
 * iPhone / iPad ignore it). Without WebAudio the element's volume is used.
 */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type Tr = { type: TransitionType; s: number; d: number };

/** The loudness (0 – 2) of a video / sound clip `off` seconds into it (timeline time `t`). */
export function soundLevel(c: { volume: number; fadeIn: number; fadeOut: number; volumeAutomation?: VolumeKeyframe[] }, off: number, len: number, o: { t?: number; trIn?: Tr; trOut?: Tr; duck?: number } = {}): number {
  const baseVol = evaluateVolumeAutomation(c, off);
  let g = baseVol * fadeAlpha(off, len, c.fadeIn, c.fadeOut) * (o.duck ?? 1);
  const t = o.t ?? off;
  // Video 1 transitions: the incoming clip's sound rises, the outgoing one's falls (dips: one after the other)
  if (o.trIn) {
    const a = transitionAudio(o.trIn.type, o.trIn.d).inFade;
    g *= a.d > 0 ? clamp((t - o.trIn.s - a.st) / a.d, 0, 1) : t >= o.trIn.s + a.st ? 1 : 0;
  }
  if (o.trOut) {
    const a = transitionAudio(o.trOut.type, o.trOut.d).outFade;
    g *= a.d > 0 ? clamp(1 - (t - o.trOut.s - a.st) / a.d, 0, 1) : t < o.trOut.s + a.st ? 1 : 0;
  }
  return clamp(g, 0, 2);
}

type Win = Window & { webkitAudioContext?: typeof AudioContext };
let ctx: AudioContext | null | undefined;
const gains = new WeakMap<HTMLMediaElement, GainNode>();

function audioCtx(): AudioContext | null {
  if (ctx !== undefined) return ctx;
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as Win).webkitAudioContext;
  try {
    ctx = AC ? new AC() : null;
  } catch {
    ctx = null;
  }
  if (ctx) {
    // browsers start it paused until the user clicks or types
    const wake = () => void ctx?.resume().catch(() => undefined);
    for (const ev of ["pointerdown", "keydown"]) window.addEventListener(ev, wake, { capture: true });
  }
  return ctx;
}

/**
 * Play `el` at `level` (0 = silent … 2 = 200%). The level is also written to
 * `data-level` (for the tests and for looking at it in the browser).
 */
const isSafari = typeof navigator !== "undefined" && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

export function setLevel(el: HTMLMediaElement, level: number) {
  const v = clamp(Number.isFinite(level) ? level : 0, 0, 2);
  el.dataset.level = v.toFixed(3);

  // In Safari, createMediaElementSource on video/audio elements causes severe audio underrun,
  // cracking, and micro-pauses in video playback.
  // Furthermore, for levels <= 1.0 in any browser, native element volume is 100% hardware
  // accelerated, has zero WebAudio latency, and perfect AV sync.
  let g = gains.get(el);
  const needsWebAudio = !isSafari && (v > 1.0 || !!g);

  if (needsWebAudio) {
    const c = audioCtx();
    if (c && !g) {
      try {
        const src = c.createMediaElementSource(el);
        g = c.createGain();
        src.connect(g).connect(c.destination);
        gains.set(el, g);
      } catch {
        g = undefined;
      }
    }
    if (g && c) {
      el.muted = false;
      el.volume = 1;
      if (Math.abs(g.gain.value - v) > 1e-3) {
        g.gain.value = v;
      }
      if (c.state === "suspended" && !el.paused) void c.resume().catch(() => undefined);
      return;
    }
  }

  // Native hardware volume (up to 100%): buttery smooth, zero WebAudio latency
  el.muted = v === 0;
  el.volume = Math.min(1, v);
}

/** Silence an element (a preloading "next" clip, a leftover one). */
export const silence = (el: HTMLMediaElement) => setLevel(el, 0);
