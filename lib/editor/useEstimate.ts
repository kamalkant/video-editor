"use client";

import { useEffect, useState } from "react";
import type { EditSpec } from "../edit/spec";
import type { SizeEstimate } from "../ffmpeg/estimate";

/** Debounced size estimate; only runs while `enabled` (the Export panel is open). */
export function useEstimate(videoId: string, spec: EditSpec, enabled: boolean) {
  const key = JSON.stringify(spec);
  const [result, setResult] = useState<{ key: string; est: SizeEstimate } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const ac = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/videos/${videoId}/estimate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spec: JSON.parse(key) }), signal: ac.signal });
        if (!res.ok) throw new Error();
        setResult({ key, est: (await res.json()) as SizeEstimate });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setFailedKey(key);
      }
    }, 600);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [videoId, key, enabled]);
  const current = result?.key === key ? result.est : null;
  return { estimate: current, estimating: enabled && !current && failedKey !== key, failed: failedKey === key };
}
