"use client";

import { useEffect, useRef, useState } from "react";
import type { VideoMeta } from "../videos";

export type VeoView = {
  id: string;
  state: "working" | "ready" | "failed";
  startedAt: number;
  error?: string;
  media?: VideoMeta | null;
  prompt: string;
  seconds: number;
};

const KEY = "VDO:veo-job";

/**
 * The Veo video being made (it keeps going while the dialog is closed; the id
 * is remembered in this browser so a reload keeps showing it). Polls every 3 s.
 */
export function useVeoJob(onReady?: (media: VideoMeta) => void) {
  const readyRef = useRef(onReady);
  useEffect(() => {
    readyRef.current = onReady;
  });
  const [id, setIdState] = useState<string | null>(() => {
    try {
      return typeof window === "undefined" ? null : localStorage.getItem(KEY);
    } catch {
      return null;
    }
  });
  const [job, setJob] = useState<VeoView | null>(null);
  const setId = (v: string | null) => {
    setIdState(v);
    setJob(null);
    try {
      if (v) localStorage.setItem(KEY, v);
      else localStorage.removeItem(KEY);
    } catch {
      /* private window: only this visit remembers it */
    }
  };
  useEffect(() => {
    if (!id) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last: VeoView["state"] | null = null;
    const tick = async () => {
      const r = await fetch(`/api/ai/video/${id}`, { cache: "no-store" }).catch(
        () => null,
      );
      if (!alive) return;
      if (r?.status === 404) {
        setIdState(null);
        return;
      }
      const j = r?.ok ? ((await r.json()) as VeoView) : null;
      if (!alive) return;
      if (j) {
        // it just finished while we watched (not an old finished job being shown again)
        if (j.state === "ready" && j.media && last === "working")
          readyRef.current?.(j.media);
        last = j.state;
        setJob(j);
      }
      if (!j || j.state === "working") timer = setTimeout(tick, 3000);
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id]);
  return { id, job, setId };
}
