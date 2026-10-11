"use client";

import { useEffect, useRef, useState } from "react";
import { toApiError } from "../api/types";
import { activeAiOp, type EditSpec } from "../edit/spec";
import { maskParamsOf } from "../ops/aiMatte";

export type AiMaskState = { state: "off" | "working" | "ready" | "failed"; percent: number; error?: string; packed: string | null };

/**
 * While AI Removal is on: asks the server to make the whole-clip mask (once
 * per clip and mask setting) and polls its progress. `packed` is the address
 * of the playing preview (picture over mask) when it's ready.
 */
export function useAiMask(videoId: string | null, spec: EditSpec, attempt = 0): AiMaskState {
  const op = activeAiOp(spec);
  const key = op && videoId ? `${videoId}|${JSON.stringify(maskParamsOf(op.params))}|${attempt}` : null;
  const [result, setResult] = useState<{ key: string; s: AiMaskState } | null>(null);
  useEffect(() => {
    if (!key || !videoId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const body = JSON.stringify({ spec });
    const tick = async () => {
      try {
        const res = await fetch(`/api/videos/${videoId}/mask`, { method: "POST", headers: { "Content-Type": "application/json" }, body, cache: "no-store" });
        if (!res.ok) throw await toApiError(res);
        const j = (await res.json()) as { state: string; percent: number; error?: string; packed: string | null };
        if (!alive) return;
        const s: AiMaskState = { state: j.state === "failed" ? "failed" : j.state === "ready" ? "ready" : "working", percent: j.percent, error: j.error, packed: j.packed };
        setResult({ key, s });
        // keep polling until the mask and its playing preview are both ready
        if (s.state === "working" || (s.state === "ready" && !s.packed)) timer = setTimeout(tick, 1000);
      } catch (e) {
        if (alive) setResult({ key, s: { state: "failed", percent: 0, error: (e as Error).message, packed: null } });
      }
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // the spec is read when polling starts; `key` holds what changes the mask
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, videoId]);
  if (!key) return { state: "off", percent: 0, packed: null };
  return result?.key === key ? result.s : { state: "working", percent: 0, packed: null };
}

/**
 * The playing AI previews of every clip that uses AI Removal (not only the
 * selected one), so the program preview can show them all keyed. Returns
 * clip id → packed preview address (null while it's being made).
 */
export function useAiMasks(items: { clipId: string; videoId: string; spec: EditSpec }[]): Record<string, string | null> {
  // one request per file + mask setting (split clips of one video share it)
  const jobs = new Map<string, { videoId: string; spec: EditSpec; clips: string[] }>();
  for (const it of items) {
    const op = activeAiOp(it.spec);
    if (!op) continue;
    const key = `${it.videoId}|${JSON.stringify(maskParamsOf(op.params))}`;
    const j = jobs.get(key) ?? { videoId: it.videoId, spec: it.spec, clips: [] };
    j.clips.push(it.clipId);
    jobs.set(key, j);
  }
  const keys = [...jobs.keys()].sort().join("\n");
  const [ready, setReady] = useState<Record<string, string>>({});
  const latest = useRef(jobs);
  useEffect(() => {
    latest.current = jobs;
  });
  useEffect(() => {
    if (!keys) return;
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const key of keys.split("\n")) {
      const j = latest.current.get(key);
      if (!j) continue;
      const body = JSON.stringify({ spec: j.spec });
      const tick = async () => {
        try {
          const res = await fetch(`/api/videos/${j.videoId}/mask`, { method: "POST", headers: { "Content-Type": "application/json" }, body, cache: "no-store" });
          if (!res.ok) return;
          const r = (await res.json()) as { state: string; packed: string | null };
          if (!alive) return;
          if (r.packed) setReady((m) => (m[key] === r.packed ? m : { ...m, [key]: r.packed! }));
          else if (r.state !== "failed") timers.push(setTimeout(tick, 1500));
        } catch {
          /* the clip shows unkeyed; the selected clip's card reports errors */
        }
      };
      void tick();
    }
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, [keys]);
  const out: Record<string, string | null> = {};
  for (const [key, j] of jobs) for (const c of j.clips) out[c] = ready[key] ?? null;
  return out;
}
