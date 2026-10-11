"use client";

import { useEffect, useState } from "react";
import type { CropBox } from "../edit/geometry";
import { activeRemovalOps, type EditSpec } from "../edit/spec";

export type CropInfo = { status: "off" | "finding" | "ready" | "failed"; box: CropBox | null; frame?: { w: number; h: number }; out?: { w: number; h: number } };

/** Crop box for "Crop empty area" (debounced; only while the option is on). */
export function useCropBox(videoId: string, spec: EditSpec, enabled: boolean): CropInfo {
  // only the key settings, padding and output size change the box
  const key = JSON.stringify({ ops: activeRemovalOps(spec), crop: spec.output.crop, res: spec.output.resolution });
  const [result, setResult] = useState<{ key: string; info: CropInfo } | null>(null);
  useEffect(() => {
    if (!enabled || !videoId) return;
    const ac = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/videos/${videoId}/cropbox`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spec }), signal: ac.signal });
        if (!res.ok) throw new Error();
        const j = (await res.json()) as { box: CropBox | null; frame: { w: number; h: number }; out: { w: number; h: number } };
        setResult({ key, info: { status: "ready", ...j } });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setResult({ key, info: { status: "failed", box: null } });
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
    // spec is read at call time; `key` captures what matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, key, enabled]);
  if (!enabled) return { status: "off", box: null };
  return result?.key === key ? result.info : { status: "finding", box: null };
}
