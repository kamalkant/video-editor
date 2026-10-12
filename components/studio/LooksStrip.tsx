"use client";

import { useEffect, useRef, useState } from "react";
import { LabeledSlider } from "@/components/ui/LabeledSlider";
import { Skeleton } from "@/components/ui/Skeleton";
import type { ColorAdjust } from "@/lib/edit/doc";
import { applyMat, colorMatrix, LOOKS, NEUTRAL, vignetteGain, vignetteOf } from "@/lib/player/look";
import { deleteMyLook, readMyLooks, saveMyLook, type MyLook } from "@/lib/editor/myLooks";

/** A small picture of the clip with a look applied (the same matrix as the preview and the export). */
function LookThumb({ src, look }: { src: string | null; look: string | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // the clip's picture is on its way: a shimmer until it's drawn
  const [drawnFor, setDrawnFor] = useState<string | null>(null);
  const loading = !!src && drawnFor !== src;
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d", { willReadFrequently: true });
    if (!cv || !ctx) return;
    const draw = (img: CanvasImageSource | null) => {
      if (img) ctx.drawImage(img, 0, 0, cv.width, cv.height);
      else {
        const g = ctx.createLinearGradient(0, 0, cv.width, cv.height);
        g.addColorStop(0, "#f59e0b");
        g.addColorStop(0.5, "#10b981");
        g.addColorStop(1, "#3b82f6");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, cv.width, cv.height);
      }
      if (!look) return;
      const m = colorMatrix({ ...NEUTRAL, look });
      const v = vignetteOf({ ...NEUTRAL, look });
      const d = ctx.getImageData(0, 0, cv.width, cv.height);
      for (let y = 0; y < cv.height; y++)
        for (let x = 0; x < cv.width; x++) {
          const i = (y * cv.width + x) * 4;
          const o = applyMat(m, [d.data[i] / 255, d.data[i + 1] / 255, d.data[i + 2] / 255, 1]);
          const k = v ? vignetteGain(v, x, y, cv.width, cv.height) : 1;
          d.data[i] = o[0] * 255 * k;
          d.data[i + 1] = o[1] * 255 * k;
          d.data[i + 2] = o[2] * 255 * k;
        }
      ctx.putImageData(d, 0, 0);
    };
    if (!src) return draw(null);
    const img = new Image();
    img.onload = () => (draw(img), setDrawnFor(src));
    img.onerror = () => (draw(null), setDrawnFor(src));
    img.src = src;
  }, [src, look]);
  return (
    <span className="relative block">
      <canvas ref={ref} width={96} height={54} aria-hidden="true" className="block aspect-video w-full rounded" />
      {loading && <Skeleton className="absolute inset-0 rounded" />}
    </span>
  );
}

/** Looks (filters) for a clip: one click, then a vignette strength. */
export function LooksStrip({ color, thumb, onChange, onAll }: { color: ColorAdjust | undefined; thumb: string | null; onChange: (c: ColorAdjust | undefined, group?: string) => void; onAll?: () => void }) {
  const c = color ?? NEUTRAL;
  const set = (x: Partial<ColorAdjust>, group?: string) => {
    const n = { ...c, ...x };
    const neutral = n.brightness === 0 && n.contrast === 1 && n.saturation === 1 && n.temperature === 0 && !n.look && !n.vignette && !n.sharpen;
    onChange(neutral ? undefined : n, group);
  };
  const ids = Object.keys(LOOKS);
  // "My looks": grades saved in this browser, one click to reuse on any clip
  const [mine, setMine] = useState<MyLook[]>(() => readMyLooks());
  const graded = !!color;
  const saveCurrent = () => {
    if (!color) return;
    const name = window.prompt("Name this look", c.look ? `${LOOKS[c.look]?.label ?? "Look"} (mine)` : "My look");
    if (name === null) return;
    setMine(saveMyLook(name, color));
  };
  return (
    <div className="flex flex-col gap-2" data-testid="looks">
      {(mine.length > 0 || graded) && (
        <div className="flex flex-col gap-1" data-testid="my-looks">
          <span className="text-[0.6875rem] font-semibold text-muted">My looks</span>
          <div className="flex flex-wrap gap-1">
            {mine.map((l) => (
              <span key={l.id} className="inline-flex items-center rounded-md border border-line text-[0.6875rem]">
                <button type="button" className="px-2 py-0.5 hover:text-primary" onClick={() => onChange(l.color, "clip:my-look")} title="Use this look on the clip">
                  {l.name}
                </button>
                <button type="button" aria-label={`Delete ${l.name}`} className="px-1 text-muted hover:text-red-500" onClick={() => setMine(deleteMyLook(l.id))}>
                  ×
                </button>
              </span>
            ))}
            {graded && (
              <button type="button" className="rounded-md border border-dashed border-control px-2 py-0.5 text-[0.6875rem] text-muted hover:text-ink" onClick={saveCurrent}>
                + Save this look
              </button>
            )}
          </div>
        </div>
      )}
      <ul className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Look">
        {[null, ...ids].map((id) => {
          const on = (c.look ?? null) === id;
          return (
            <li key={id ?? "none"}>
              <button type="button" role="radio" aria-checked={on} onClick={() => set({ look: id ?? undefined, vignette: undefined })} className={`flex w-full flex-col gap-0.5 rounded-md border p-1 text-[0.625rem] ${on ? "border-primary bg-primary-soft" : "border-line hover:border-control"}`}>
                <LookThumb src={thumb} look={id} />
                {id ? LOOKS[id].label : "None"}
              </button>
            </li>
          );
        })}
      </ul>
      <LabeledSlider label="Vignette" value={Math.round(vignetteOf(c) * 100)} min={0} max={100} step={5} unit={{ short: "%", spoken: "percent" }} valueText={(v) => `${v} percent`} onChange={(v) => set({ vignette: v / 100 }, "clip:vignette")} />
      {onAll && (
        <button type="button" className="self-start text-xs text-link underline" onClick={onAll}>
          Use this look on every clip
        </button>
      )}
    </div>
  );
}
