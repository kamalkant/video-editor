"use client";

import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";

/**
 * Playback rules for every website video (see SiteVideo):
 *  - the file is attached only when the video comes near the screen (one shared observer for the page);
 *  - it plays muted while at least a quarter of it is visible, and pauses offscreen or in a hidden tab;
 *  - with "reduce motion", Save-Data or a 2G connection it never starts on its own (poster + play button);
 *  - without IntersectionObserver / matchMedia (old browsers, tests) it stays a poster.
 */

type Seen = { near: boolean; visible: boolean };
const watchers = new Map<Element, (s: Seen) => void>();
let observer: IntersectionObserver | null = null;

function watch(el: Element, cb: (s: Seen) => void): () => void {
  if (typeof IntersectionObserver === "undefined") return () => {};
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) watchers.get(e.target)?.({ near: e.isIntersecting, visible: e.isIntersecting && e.intersectionRatio >= 0.25 });
    },
    { rootMargin: "300px 0px", threshold: [0, 0.25, 0.5] },
  );
  watchers.set(el, cb);
  observer.observe(el);
  return () => {
    watchers.delete(el);
    observer?.unobserve(el);
  };
}

const REDUCE = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (l: () => void) => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(REDUCE);
  mq.addEventListener?.("change", l);
  return () => mq.removeEventListener?.("change", l);
};
/** "auto": may start by itself; "manual": only on a click (reduced motion, data saver, or no browser support). */
function autoplayMode(): "auto" | "manual" {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function" || typeof IntersectionObserver === "undefined") return "manual";
  if (window.matchMedia(REDUCE).matches) return "manual";
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (c?.saveData || c?.effectiveType === "slow-2g" || c?.effectiveType === "2g") return "manual";
  return "auto";
}
export function useAutoplayMode(): "auto" | "manual" {
  // (the server and the first client render agree on "manual": a poster, then videos once the page runs)
  return useSyncExternalStore(subscribeMotion, autoplayMode, () => "manual");
}

const noSubscribe = () => () => {};

const subscribeVisibility = (l: () => void) => {
  document.addEventListener("visibilitychange", l);
  return () => document.removeEventListener("visibilitychange", l);
};
const useTabVisible = () =>
  useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState !== "hidden",
    () => true,
  );

export function useSiteVideo(
  ref: RefObject<HTMLVideoElement | null>,
  opts: { paused?: boolean; eager?: boolean } = {},
): { attach: boolean; near: boolean; mode: "auto" | "manual"; userStarted: boolean; start: () => void } {
  const mode = useAutoplayMode();
  const tabVisible = useTabVisible();
  const [seen, setSeen] = useState<Seen>({ near: false, visible: false });
  const [userStarted, setUserStarted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return watch(el, (s) => setSeen((p) => (p.near === s.near && p.visible === s.visible ? p : s)));
  }, [ref]);

  // once loaded, keep the file (scrolling back doesn't download it again)
  const [attached, setAttached] = useState(false);
  const wantAttach = opts.eager || seen.near || userStarted;
  if (wantAttach && !attached) setAttached(true);

  const shouldPlay = !opts.paused && seen.visible && tabVisible && (mode === "auto" || userStarted);

  useEffect(() => {
    const el = ref.current;
    if (!el || !attached) return;
    if (shouldPlay) {
      el.muted = true; // (React doesn't always set the attribute; browsers only autoplay muted video)
      el.play().catch(() => {});
    } else if (!el.paused) {
      el.pause();
    }
  }, [ref, attached, shouldPlay]);

  // (posters wait until the video is close too; without an observer, e.g. old browsers, show them at once.
  //  The server always says "not near", so the first render matches the page the server sent.)
  const noObserver = useSyncExternalStore(noSubscribe, () => typeof IntersectionObserver === "undefined", () => false);
  const near = attached || seen.near || noObserver;
  return { attach: attached, near, mode, userStarted, start: () => setUserStarted(true) };
}
