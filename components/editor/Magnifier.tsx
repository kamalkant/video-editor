"use client";

import { useEffect, useRef, useState } from "react";

const CELLS = 11; // source pixels shown across
const SCALE = 10; // screen pixels per source pixel

/**
 * Loupe that follows the pointer while picking: zoomed pixels from the current
 * frame, a crosshair on the pixel that will be picked, and its hex color.
 */
export function Magnifier({ getSource, point, box, stageWidth }: { getSource: () => HTMLVideoElement | HTMLImageElement | null; point: { x: number; y: number; px: number; py: number } | null; box: { width: number; height: number }; stageWidth: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hex, setHex] = useState<string>("");
  useEffect(() => {
    const c = ref.current;
    const source = getSource();
    if (!c || !source || !point) return;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const sw = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
    const sh = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
    if (!sw || !sh) return;
    // point.x/y are in preview pixels; map to the source element's pixels
    const sx = Math.round((point.x / box.width) * sw) - Math.floor(CELLS / 2);
    const sy = Math.round((point.y / box.height) * sh) - Math.floor(CELLS / 2);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    try {
      ctx.drawImage(source, sx, sy, CELLS, CELLS, 0, 0, CELLS * SCALE, CELLS * SCALE);
      const d = ctx.getImageData(Math.floor(CELLS / 2) * SCALE + SCALE / 2, Math.floor(CELLS / 2) * SCALE + SCALE / 2, 1, 1).data;
      setHex("#" + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase());
    } catch {
      setHex("");
    }
  }, [getSource, point, box.width, box.height]);

  if (!point) return null;
  const size = CELLS * SCALE;
  // keep the loupe inside the stage: flip left/up near the right/bottom edge
  const left = point.px + 20 + size > stageWidth ? Math.max(4, point.px - size - 20) : point.px + 20;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute z-30" style={{ left, top: point.py > size + 40 ? point.py - size - 36 : point.py + 20 }}>
      <div className="relative overflow-hidden rounded-lg border-2 border-white bg-black shadow-xl" style={{ width: size, height: size }}>
        <canvas ref={ref} width={size} height={size} className="block" />
        <span className="absolute border-2 border-white shadow-[0_0_0_1px_#000]" style={{ left: Math.floor(CELLS / 2) * SCALE - 1, top: Math.floor(CELLS / 2) * SCALE - 1, width: SCALE + 2, height: SCALE + 2 }} />
      </div>
      <div className="mt-1 flex items-center gap-1 rounded bg-black/85 px-2 py-0.5 text-xs text-white">
        <span className="inline-block size-3 rounded-sm border border-white" style={{ background: hex || "transparent" }} />
        <span className="font-mono">{hex || "…"}</span>
        <span>· click to remove</span>
      </div>
    </div>
  );
}
