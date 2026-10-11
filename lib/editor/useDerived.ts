"use client";

import { useEffect, useState } from "react";

/**
 * Derived versions of uploads (e.g. the stabilized copy): asks the server to
 * make them (once) and polls until ready. Returns, per upload, the address
 * of the derived file when it's ready and the progress while it's made.
 */
export function useDerived(ids: string[], kind: "stabilize"): { url: Record<string, string | null>; percent: Record<string, number> } {
  const key = [...new Set(ids)].sort().join(",");
  const [state, setState] = useState<Record<string, { url: string | null; percent: number }>>({});
  useEffect(() => {
    if (!key) return;
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const id of key.split(",")) {
      const tick = async () => {
        try {
          const r = await fetch(`/api/videos/${id}/derived`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }), cache: "no-store" });
          const j = (await r.json()) as { state: string; percent: number; url: string | null };
          if (!alive || !r.ok) return;
          setState((m) => ({ ...m, [id]: { url: j.url, percent: j.percent } }));
          if (!j.url && j.state !== "failed") timers.push(setTimeout(tick, 1200));
        } catch {
          /* the preview plays the original meanwhile */
        }
      };
      void tick();
    }
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, [key, kind]);
  const url: Record<string, string | null> = {};
  const percent: Record<string, number> = {};
  for (const id of ids) {
    url[id] = state[id]?.url ?? null;
    percent[id] = state[id]?.percent ?? 0;
  }
  return { url, percent };
}
