"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EditSpec } from "../edit/spec";
import type { PreviewStats } from "../ffmpeg/preview";

export type PreviewResult = { url: string; stats: PreviewStats };

/**
 * Debounced exact preview. Stale requests are aborted, late responses are
 * dropped, and the old image stays on screen until the new one has loaded.
 */
export function usePreview(
  videoId: string,
  spec: EditSpec,
  t: number,
  enabled = true,
  debounceMs = 300,
) {
  const [result, setResult] = useState<PreviewResult | null>(null);
  /** Key of the last request that finished (ok or error); anything else is still pending. */
  const [doneKey, setDoneKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typicalMs, setTypicalMs] = useState(800);
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);
  const first = useRef(true);
  // output settings don't change the preview picture, so only the ops are part of the key
  const key = JSON.stringify({ ops: spec.ops, t, nonce });

  useEffect(() => {
    if (!enabled) return;
    const my = ++seq.current;
    const ac = new AbortController();
    let busyTimer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      busyTimer = setTimeout(() => setBusy(true), 250);
      const started = performance.now();
      try {
        const res = await fetch(`/api/videos/${videoId}/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spec, t }),
          signal: ac.signal,
        });
        if (!res.ok)
          throw new Error(
            (await res.json().catch(() => null))?.error?.message ??
              "Couldn't make the preview.",
          );
        const stats = JSON.parse(
          res.headers.get("X-VDO-Stats") ?? "null",
        ) as PreviewStats;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        await new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Couldn't show the preview."));
          img.src = url;
        });
        if (my !== seq.current) return URL.revokeObjectURL(url);
        setTypicalMs((m) =>
          Math.round(m * 0.6 + (performance.now() - started) * 0.4),
        );
        setResult((old) => {
          if (old) setTimeout(() => URL.revokeObjectURL(old.url), 1000);
          return { url, stats };
        });
        setError(null);
      } catch (e) {
        if ((e as Error).name === "AbortError" || my !== seq.current) return;
        setError((e as Error).message);
      } finally {
        clearTimeout(busyTimer);
        if (my === seq.current) {
          setBusy(false);
          setDoneKey(key);
        }
      }
    };
    const delay = first.current ? 0 : debounceMs;
    first.current = false;
    const timer = setTimeout(run, delay);
    return () => {
      clearTimeout(timer);
      clearTimeout(busyTimer);
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, key, debounceMs, enabled]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return { result, pending: doneKey !== key, busy, error, typicalMs, retry };
}
