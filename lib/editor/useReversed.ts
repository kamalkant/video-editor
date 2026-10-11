"use client";

import { useEffect, useState } from "react";

type Part = { clipId: string; mediaId: string; in: number; out: number };

/**
 * Reversed clips: asks the server for the backwards copy of each clip's part
 * (made once) and polls until ready. Returns clip id → address (null while
 * it's being made) and the progress.
 */
export function useReversed(parts: Part[]): { url: Record<string, string | null>; percent: Record<string, number>; error: Record<string, string> } {
  const keyOf = (p: Part) => `${p.mediaId}|${Math.round(p.in * 1000)}|${Math.round(p.out * 1000)}`;
  const jobs = new Map<string, Part>();
  for (const p of parts) jobs.set(keyOf(p), p);
  const key = [...jobs.keys()].sort().join(",");
  const [state, setState] = useState<Record<string, { url: string | null; percent: number; error?: string }>>({});
  useEffect(() => {
    if (!key) return;
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const k of key.split(",")) {
      const [mediaId, a, b] = k.split("|");
      const tick = async () => {
        try {
          const r = await fetch(`/api/videos/${mediaId}/reversed`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ in: Number(a) / 1000, out: Number(b) / 1000 }), cache: "no-store" });
          const j = (await r.json()) as { state?: string; percent?: number; url?: string | null; error?: { message: string } };
          if (!alive) return;
          if (!r.ok) return setState((m) => ({ ...m, [k]: { url: null, percent: 0, error: j.error?.message ?? "Couldn't reverse this clip." } }));
          setState((m) => ({ ...m, [k]: { url: j.url ?? null, percent: j.percent ?? 0 } }));
          if (!j.url && j.state !== "failed") timers.push(setTimeout(tick, 1200));
        } catch {
          /* plays forward meanwhile */
        }
      };
      void tick();
    }
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, [key]);
  const url: Record<string, string | null> = {};
  const percent: Record<string, number> = {};
  const error: Record<string, string> = {};
  for (const p of parts) {
    const s = state[keyOf(p)];
    url[p.clipId] = s?.url ?? null;
    percent[p.clipId] = s?.percent ?? 0;
    if (s?.error) error[p.clipId] = s.error;
  }
  return { url, percent, error };
}
