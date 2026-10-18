"use client";

import { useEffect, useState } from "react";
import { bppOf, STILL_BPP, TYPICAL_BPP, type SizeBasis } from "../export/size";
import { localInfo, localItem, notOnServer } from "../media/localMedia";

type Measured = { key: string; bpp: number; measuredAt: { width: number; height: number } };

/**
 * How busy the project's picture is, for the export size estimate: its longest
 * video clips are test-encoded on the server (a couple of seconds each, cached).
 * Only while `enabled` (the Export dialog is open and nothing is being made).
 * Changing the format, size or quality needs no new measurement.
 */
export function useExportSize(basis: SizeBasis | null, enabled: boolean) {
  const key = basis ? JSON.stringify(basis) : "";
  const [res, setRes] = useState<Measured | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || !key) return;
    const b = JSON.parse(key) as SizeBasis;
    if (!b.samples.length) return;
    // For local-first media, estimate bpp directly and accurately from the local file's actual bitrate
    if (b.samples.some((x) => notOnServer(x.mediaId))) {
      const localSamples = b.samples.map((s) => {
        const item = localItem(s.mediaId);
        if (item && item.size > 0) {
          const fps = Math.max(1, b.fps || 30);
          const px = Math.max(1, b.width * b.height);
          const info = localInfo(s.mediaId);
          const dur = Math.max(1, info?.duration || s.len || 10);
          const bpp = (item.size * 8) / (px * fps * dur);
          return Math.min(0.06, Math.max(0.015, bpp));
        }
        return TYPICAL_BPP;
      });
      setRes({
        key,
        bpp: bppOf(b, localSamples),
        measuredAt: { width: b.width, height: b.height },
      });
      return;
    }
    const ac = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const got = await Promise.all(
          b.samples.map(async (s) => {
            const q = new URLSearchParams({ at: String(s.at), w: String(b.width), h: String(b.height), fps: String(b.fps) });
            const r = await fetch(`/api/videos/${s.mediaId}/busyness?${q}`, { signal: ac.signal });
            if (!r.ok) throw new Error("measure failed");
            return (await r.json()) as { bpp: number; width: number; height: number };
          }),
        );
        setRes({ key, bpp: bppOf(b, got.map((x) => x.bpp)), measuredAt: { width: got[0].width, height: got[0].height } });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setFailedKey(key);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [key, enabled]);
  if (!basis) return { bpp: null, measuredAt: undefined, estimating: false, failed: false };
  // nothing to measure (pictures and text only): a calm picture
  if (!basis.samples.length) return { bpp: STILL_BPP, measuredAt: undefined, estimating: false, failed: false };
  const cur = res?.key === key ? res : null;
  return { bpp: cur?.bpp ?? null, measuredAt: cur?.measuredAt, estimating: !cur && failedKey !== key, failed: failedKey === key };
}
