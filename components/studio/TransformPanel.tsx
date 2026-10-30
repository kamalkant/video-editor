"use client";

import { useContext, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { LabeledSlider, SliderDensity } from "@/components/ui/LabeledSlider";
import type { Transform } from "@/lib/edit/doc";
import type { MotionClip } from "@/lib/edit/keyframes";
import { elementUnit } from "@/lib/elements/geometry";
import { xyForCenter } from "@/lib/player/handles";
import { placeClip } from "@/lib/player/look";
import { hasCorners, pivotCenter, type BoxLook } from "@/lib/player/quad";
import { BLEND_LABEL, BLEND_MODES, type BlendMode } from "@/lib/render/blend";

/** The Transform numbers folded open or not, remembered in this browser. */
const OPEN_KEY = "VDO:v1:transformOpen";

/**
 * The Transform panel (like the reference): exact numbers for what the preview's handles do.
 * Position and size in project pixels (the box before turning), rotation, scale X / Y, skew,
 * flips, blend mode, rounded corners, the pivot and the perspective corners. Every change goes
 * through the inspector's `onTransform` (with keyframes: at the playhead).
 */
type Clip = MotionClip;

export function TransformPanel({
  clip,
  t,
  size,
  canvas,
  overlay,
  onTransform,
  onPatch,
}: {
  clip: Clip;
  /** its look at the playhead */
  t: Transform;
  /** the picture's own size (videos and pictures) */
  size: { width: number; height: number } | null;
  canvas: { width: number; height: number } | null;
  /** on an overlay track (blend modes: Video 1 is the base) */
  overlay: boolean;
  onTransform: (patch: Partial<Transform>, group?: string) => void;
  onPatch: (p: Record<string, unknown>, group?: string) => void;
}) {
  const [locked, setLocked] = useState(true);
  // (the compact inspector: one slider per row; otherwise pairs side by side)
  const pair = useContext(SliderDensity) === "compact" ? "flex flex-col gap-1" : "grid grid-cols-2 gap-x-2";
  const W = canvas?.width ?? 0;
  const H = canvas?.height ?? 0;
  const look: BoxLook = { rotation: t.rotation, skewX: t.skewX, skewY: t.skewY, pivot: t.pivot, corners: t.corners };
  const sx = t.scaleX ?? 1;
  const sy = t.scaleY ?? 1;
  // the box (before turning): its drawn middle, size, and size at scale 1
  const box = (() => {
    if (!W || !H) return null;
    if ((clip.type === "video" || clip.type === "image") && size) {
      const p = placeClip(size.width, size.height, W, H, t);
      return { cx: p.cx, cy: p.cy, w: p.w, h: p.h, unitW: p.w / Math.max(1e-6, t.scale * sx), unitH: p.h / Math.max(1e-6, t.scale * sy) };
    }
    if (clip.type === "element") {
      const u = elementUnit(clip.el.aspect, W, H);
      const w = u.w * t.scale;
      const h = u.h * t.scale;
      const c = pivotCenter(W / 2 + t.x * W, H / 2 + t.y * H, w, h, u.w, u.h, look);
      return { cx: c.x, cy: c.y, w, h, unitW: u.w, unitH: u.h };
    }
    return null;
  })();
  const isPic = clip.type === "video" || clip.type === "image";
  const g = (k: string) => `transform:${k}`;
  // move the middle to c with a size w × h (the pivot is taken into account)
  const place = (c: { x: number; y: number }, w: number, h: number, extra: Partial<Transform>, group: string) => {
    if (!box) return;
    onTransform({ ...extra, ...xyForCenter(c, w, h, box.unitW, box.unitH, { ...look, ...("pivot" in extra ? { pivot: extra.pivot } : {}) }, W, H) }, group);
  };
  const setW = (v: number) => {
    if (!box || !(v > 0)) return;
    const c = { x: box.cx, y: box.cy };
    if (locked || clip.type === "element") {
      if (clip.type === "element" && !locked) return setAspect(v / box.h, v);
      const scale = Math.min(5, Math.max(0.05, (t.scale * v) / box.w));
      const k = scale / t.scale;
      place(c, box.w * k, box.h * k, { scale: Math.round(scale * 10000) / 10000 }, g("w"));
    } else {
      const s = Math.min(20, Math.max(0.05, (sx * v) / box.w));
      place(c, (box.w * s) / sx, box.h, { scaleX: s === 1 ? undefined : Math.round(s * 10000) / 10000 }, g("w"));
    }
  };
  const setH = (v: number) => {
    if (!box || !(v > 0)) return;
    const c = { x: box.cx, y: box.cy };
    if (locked || clip.type === "element") {
      if (clip.type === "element" && !locked) return setAspect(box.w / v, box.w);
      const scale = Math.min(5, Math.max(0.05, (t.scale * v) / box.h));
      const k = scale / t.scale;
      place(c, box.w * k, box.h * k, { scale: Math.round(scale * 10000) / 10000 }, g("h"));
    } else {
      const s = Math.min(20, Math.max(0.05, (sy * v) / box.h));
      place(c, box.w, (box.h * s) / sy, { scaleY: s === 1 ? undefined : Math.round(s * 10000) / 10000 }, g("h"));
    }
  };
  // an element's free size is its own shape (re-drawn sharp)
  const setAspect = (aspect: number, width: number) => {
    if (!box || clip.type !== "element") return;
    const a = Math.min(200, Math.max(0.02, aspect));
    const u = elementUnit(a, W, H);
    const scale = Math.min(5, Math.max(0.05, width / u.w));
    onPatch({ el: { ...clip.el, aspect: Math.round(a * 10000) / 10000 } }, g("aspect"));
    onTransform({ scale: Math.round(scale * 10000) / 10000, ...xyForCenter({ x: box.cx, y: box.cy }, u.w * scale, u.h * scale, u.w, u.h, look, W, H) }, g("aspect"));
  };
  const radius = isPic ? (!clip.mask || clip.mask.shape === "rect" || clip.mask.shape === "rounded" ? (clip.mask?.shape === "rounded" ? clip.mask.radius : 0) : null) : clip.type === "element" && (clip.el.kind === "rect" || clip.el.kind === "badge" || clip.el.kind === "progress") ? (clip.el.radius ?? 0) : null;
  const setRadius = (share: number) => {
    if (clip.type === "element") return onPatch({ el: { ...clip.el, radius: share > 0 ? share : undefined } }, g("radius"));
    if (!isPic) return;
    const m = clip.mask;
    onPatch({ mask: share > 0 ? { shape: "rounded", radius: share, feather: m?.feather ?? 0, ...(m?.border ? { border: m.border } : {}) } : m?.border?.width ? { shape: "rect", radius: 0, feather: m.feather, border: m.border } : undefined }, g("radius"));
  };
  // (the pivot: videos, pictures, elements; text grows from its anchor)
  const canPivot = isPic || clip.type === "element";
  const pv = t.pivot ?? { x: 0.5, y: 0.5 };
  const setPivot = (next: { x: number; y: number }) => {
    if (!box) return;
    const p = next.x === 0.5 && next.y === 0.5 ? undefined : next;
    place({ x: box.cx, y: box.cy }, box.w, box.h, { pivot: p }, g("pivot"));
  };
  // (shown only for a selected clip, never in the server's first render: the browser's setting can be read at once)
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const rememberOpen = (o: boolean) => {
    setOpen(o);
    try {
      if (o) localStorage.setItem(OPEN_KEY, "1");
      else localStorage.removeItem(OPEN_KEY);
    } catch {
      /* private window */
    }
  };
  const flipBtn = "btn btn-secondary min-h-7 flex-1 px-2 text-xs aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:font-medium aria-pressed:text-primary";

  return (
    // (exact numbers are for the few who need them: folded until opened, and remembered; progressive disclosure)
    <details
      aria-label="Transform"
      data-testid="transform-panel"
      className="group/tf flex flex-col gap-2 rounded-lg bg-canvas/50 p-2 open:[&>*:not(summary)]:mt-2"
      open={open}
      onToggle={(e) => rememberOpen(e.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold text-muted hover:text-ink">
        Advanced position &amp; size
        <Icon name="chevronDown" className="size-3.5 transition-transform group-open/tf:rotate-180" />
      </summary>
      {box && (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <PxField label="X" title="Left edge of the box, before turning (project pixels)" value={box.cx - box.w / 2} onCommit={(v) => place({ x: v + box.w / 2, y: box.cy }, box.w, box.h, {}, g("x"))} />
            <PxField label="Y" title="Top edge of the box, before turning (project pixels)" value={box.cy - box.h / 2} onCommit={(v) => place({ x: box.cx, y: v + box.h / 2 }, box.w, box.h, {}, g("y"))} />
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-1.5">
            <PxField label="W" title="Width (project pixels)" value={box.w} onCommit={setW} />
            <button type="button" aria-pressed={locked} onClick={() => setLocked((v) => !v)} className="mb-0.5 flex size-7 items-center justify-center rounded-md border border-line text-muted hover:text-ink aria-pressed:border-primary aria-pressed:text-primary" aria-label={locked ? "Keep the shape: on (changing W changes H)" : "Keep the shape: off (W and H change on their own)"} title={locked ? "Shape kept: W and H change together" : "Free: W and H change on their own"}>
              <Icon name="lock" className="size-3.5" />
            </button>
            <PxField label="H" title="Height (project pixels)" value={box.h} onCommit={setH} />
          </div>
        </>
      )}
      {clip.type !== "element" && (
        <div className={pair}>
          <LabeledSlider label="Scale X" value={Math.round(sx * 100)} min={5} max={400} step={1} unit={{ short: "%", spoken: "percent" }} valueText={(v) => `${v} percent of its width`} onChange={(v) => (box ? place({ x: box.cx, y: box.cy }, (box.w * v) / 100 / sx, box.h, { scaleX: v === 100 ? undefined : v / 100 }, g("sx")) : onTransform({ scaleX: v === 100 ? undefined : v / 100 }, g("sx")))} />
          <LabeledSlider label="Scale Y" value={Math.round(sy * 100)} min={5} max={400} step={1} unit={{ short: "%", spoken: "percent" }} valueText={(v) => `${v} percent of its height`} onChange={(v) => (box ? place({ x: box.cx, y: box.cy }, box.w, (box.h * v) / 100 / sy, { scaleY: v === 100 ? undefined : v / 100 }, g("sy")) : onTransform({ scaleY: v === 100 ? undefined : v / 100 }, g("sy")))} />
        </div>
      )}
      {clip.type !== "text" && (
        <>
          <LabeledSlider label="Rotation" bipolar value={Math.round(t.rotation ?? 0)} min={-180} max={180} step={1} unit={{ short: "°", spoken: "degrees" }} valueText={(v) => `${v} degrees`} onChange={(v) => onTransform({ rotation: v || undefined }, g("rotation"))} />
          <div className={pair}>
            <LabeledSlider label="Skew X" bipolar value={Math.round(t.skewX ?? 0)} min={-60} max={60} step={1} unit={{ short: "°", spoken: "degrees" }} valueText={(v) => (v ? `${v} degrees` : "None")} onChange={(v) => onTransform({ skewX: v || undefined }, g("skewX"))} />
            <LabeledSlider label="Skew Y" bipolar value={Math.round(t.skewY ?? 0)} min={-60} max={60} step={1} unit={{ short: "°", spoken: "degrees" }} valueText={(v) => (v ? `${v} degrees` : "None")} onChange={(v) => onTransform({ skewY: v || undefined }, g("skewY"))} />
          </div>
          <div role="group" aria-label="Flip" className="flex gap-1.5">
            <button type="button" className={flipBtn} aria-pressed={!!t.flipX} onClick={() => onTransform({ flipX: t.flipX ? undefined : true }, g("flip"))}>
              Flip ↔
            </button>
            <button type="button" className={flipBtn} aria-pressed={!!t.flipY} onClick={() => onTransform({ flipY: t.flipY ? undefined : true }, g("flip"))}>
              Flip ↕
            </button>
          </div>
        </>
      )}
      {radius !== null && (
        <LabeledSlider label="Corner radius" value={Math.round(radius * 200)} min={0} max={100} step={1} unit={{ short: "%", spoken: "percent" }} valueText={(v) => (v ? `${v} percent` : "Square corners")} onChange={(v) => setRadius(v / 200)} help="The dot inside the top-left corner on the preview does the same." />
      )}
      {canPivot && box && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Pivot</span>
            {t.pivot && (
              <button type="button" className="text-2xs text-link underline" onClick={() => setPivot({ x: 0.5, y: 0.5 })}>
                Middle
              </button>
            )}
          </div>
          <div className={pair}>
            <LabeledSlider label="Pivot X" value={Math.round(pv.x * 100)} min={0} max={100} step={1} unit={{ short: "%", spoken: "percent of its width" }} valueText={(v) => `${v} percent across`} onChange={(v) => setPivot({ x: v / 100, y: pv.y })} />
            <LabeledSlider label="Pivot Y" value={Math.round(pv.y * 100)} min={0} max={100} step={1} unit={{ short: "%", spoken: "percent of its height" }} valueText={(v) => `${v} percent down`} onChange={(v) => setPivot({ x: pv.x, y: v / 100 })} />
          </div>
        </div>
      )}
      {hasCorners(t.corners) && (
        <div className="flex items-center justify-between rounded-md border border-line px-2 py-1 text-2xs" data-testid="perspective-row">
          <span>Perspective: corners moved</span>
          <button type="button" className="text-link underline" onClick={() => onTransform({ corners: undefined }, g("corners"))}>
            Reset
          </button>
        </div>
      )}
      {overlay && (
        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium">Blend</span>
          <select className="field max-w-40" aria-label="Blend mode" value={clip.blend ?? "normal"} onChange={(e) => onPatch({ blend: e.target.value === "normal" ? undefined : (e.target.value as BlendMode) }, g("blend"))}>
            {BLEND_MODES.map((m) => (
              <option key={m} value={m}>
                {BLEND_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
      )}
    </details>
  );
}

/** A number in project pixels: typed, then Enter (or leaving the field) sets it. */
function PxField({ label, title, value, onCommit }: { label: string; title: string; value: number; onCommit: (v: number) => void }) {
  const shown = Math.round(value);
  const commit = (el: HTMLInputElement) => {
    const v = Number(el.value);
    if (Number.isFinite(v) && Math.round(v) !== shown) onCommit(v);
    else el.value = String(shown);
  };
  return (
    <label className="flex min-w-0 flex-col gap-0.5 text-2xs" title={title}>
      <span className="font-medium text-muted">{label}</span>
      <span className="flex items-center rounded-md border border-line bg-surface pr-1.5 focus-within:border-primary">
        {/* (a new value from outside — a drag on the preview — shows: the field is made again) */}
        <input key={shown} type="number" inputMode="numeric" defaultValue={shown} aria-label={`${label} (pixels)`} className="min-w-0 flex-1 bg-transparent px-1.5 py-1 text-xs tabular-nums outline-none" onBlur={(e) => commit(e.currentTarget)} onKeyDown={(e) => e.key === "Enter" && commit(e.currentTarget)} />
        <span className="text-2xs text-muted">px</span>
      </span>
    </label>
  );
}
