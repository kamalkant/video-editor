"use client";

import { useState, type ReactNode, useContext } from "react";
import { Icon } from "@/components/ui/Icon";
import { LabeledSlider, SliderDensity } from "@/components/ui/LabeledSlider";
import type { ClipMask, ColorAdjust, Patch, Transform } from "@/lib/edit/doc";
import { newPatch } from "@/lib/player/patches";
import { clampCrop, cropForAspect, cropOf, hasCrop, NEUTRAL, rotationOf } from "@/lib/player/look";

/** A folding section inside a clip card. */
export function Fold({ title, children, defaultOpen = false, action, testId }: { title: string; children: ReactNode; defaultOpen?: boolean; action?: ReactNode; testId?: string }) {
  return (
    <details className="group rounded-md border border-line" open={defaultOpen} data-testid={testId}>
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 px-2 text-xs font-semibold">
        <span className="flex items-center gap-1.5">
          <Icon name="chevronRight" className="size-3.5 text-muted transition-transform group-open:rotate-90" />
          {title}
        </span>
        {action}
      </summary>
      <div className="flex flex-col gap-2.5 border-t border-line px-2 pb-2 pt-2">{children}</div>
    </details>
  );
}

const ASPECTS: { label: string; value: number | null }[] = [
  { label: "Free", value: null },
  { label: "16:9", value: 16 / 9 },
  { label: "9:16", value: 9 / 16 },
  { label: "1:1", value: 1 },
  { label: "4:5", value: 4 / 5 },
];

const pctText = (v: number) => `${Math.round(v)} percent`;

/** Crop and quarter turns of a picture clip (its angle, skew and flips are in the Transform panel). */
export function CropRotateSection({ t, size, onChange, onCropMode, open }: { t: Transform; size: { width: number; height: number } | null; onChange: (t: Transform, group?: string) => void; onCropMode?: () => void; /** start unfolded (inside an inspector tab) */ open?: boolean }) {
  const k = cropOf(t);
  const rot = rotationOf(t);
  const compact = useContext(SliderDensity) === "compact";
  // cropping shows on the preview as an outline over the still picture (crop mode)
  const setCrop = (c: Partial<typeof k>, group = "clip:crop") => {
    onCropMode?.();
    const n = clampCrop({ ...k, ...c });
    onChange({ ...t, crop: n.l || n.t || n.r || n.b ? n : undefined }, group);
  };
  const edited = hasCrop(t) || !!rot;
  const btn = "flex min-h-8 flex-1 items-center justify-center gap-1 rounded-md border border-line px-1.5 text-2xs hover:border-control aria-pressed:border-primary aria-pressed:bg-primary-soft";
  return (
    <Fold
      title="Crop & turn"
      testId="crop-rotate"
      defaultOpen={open}
      action={
        edited ? (
          <button type="button" className="text-2xs font-normal text-link underline" onClick={(e) => (e.preventDefault(), onChange({ ...t, crop: undefined, rotation: undefined }))}>
            Reset
          </button>
        ) : undefined
      }
    >
      {onCropMode && (
        <button type="button" className="btn btn-secondary w-full text-xs" onClick={onCropMode} data-testid="crop-mode">
          <Icon name="crop" className="size-4" /> Crop on the preview
        </button>
      )}
      <div role="group" aria-label="Crop to a shape" className="flex gap-1">
        {ASPECTS.map((a) => (
          <button
            key={a.label}
            type="button"
            className={btn}
            aria-pressed={a.value === null ? !hasCrop(t) : false}
            onClick={() => {
              onCropMode?.();
              onChange({ ...t, crop: size ? cropForAspect(size.width, size.height, a.value) : undefined });
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
      {/* (compact inspector: one slider per row; otherwise two columns) */}
      <div className={compact ? "flex flex-col gap-1" : "grid grid-cols-2 gap-x-3"}>
        {(["l", "r", "t", "b"] as const).map((e) => (
          <LabeledSlider key={e} label={{ l: "Left", r: "Right", t: "Top", b: "Bottom" }[e]} value={Math.round(k[e] * 100)} min={0} max={45} step={1} unit={{ short: "%", spoken: "percent" }} valueText={pctText} onChange={(v) => setCrop({ [e]: v / 100 })} />
        ))}
      </div>
      <div role="group" aria-label="Turn" className="flex gap-1">
        <button type="button" className={btn} onClick={() => onChange({ ...t, rotation: rot - 90 === 0 ? undefined : rot - 90 })} aria-label="Turn left 90 degrees">
          <Icon name="rotate" className="size-3.5 -scale-x-100" /> 90°
        </button>
        <button type="button" className={btn} onClick={() => onChange({ ...t, rotation: rot + 90 === 0 ? undefined : ((rot + 90 + 180) % 360) - 180 || undefined })} aria-label="Turn right 90 degrees">
          <Icon name="rotate" className="size-3.5" /> 90°
        </button>
      </div>
    </Fold>
  );
}

/** Brightness, contrast, saturation, temperature (+ Auto). */
export function ColorSection({ color, onChange, onAuto, open }: { color: ColorAdjust | undefined; onChange: (c: ColorAdjust | undefined, group?: string) => void; onAuto?: () => Promise<ColorAdjust | null>; open?: boolean }) {
  const c = color ?? NEUTRAL;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const set = (x: Partial<ColorAdjust>, group = "clip:color") => {
    const n = { ...c, ...x };
    const neutral = n.brightness === 0 && n.contrast === 1 && n.saturation === 1 && n.temperature === 0 && !n.look && !n.vignette && !n.sharpen;
    onChange(neutral ? undefined : n, group);
  };
  return (
    <Fold
      title="Color"
      testId="color-section"
      defaultOpen={open}
      action={
        color ? (
          <button type="button" className="text-2xs font-normal text-link underline" onClick={(e) => (e.preventDefault(), onChange(color.look || color.vignette ? { ...NEUTRAL, look: color.look, vignette: color.vignette } : undefined))}>
            Reset
          </button>
        ) : undefined
      }
    >
      {onAuto && (
        <button
          type="button"
          className="btn btn-secondary w-full text-xs"
          disabled={busy}
          data-testid="auto-color"
          onClick={async () => {
            setBusy(true);
            setNote(null);
            try {
              const a = await onAuto();
              if (a) set({ brightness: a.brightness, contrast: a.contrast, saturation: a.saturation }, undefined);
              else setNote("Couldn't read this clip's colors.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Icon name="magic" className="size-4" /> {busy ? "Looking at the colors…" : "Auto color"}
        </button>
      )}
      {note && <p className="text-xs text-danger">{note}</p>}
      <LabeledSlider label="Brightness" bipolar value={Math.round(c.brightness * 100)} min={-50} max={50} step={1} unit={{ short: "%", spoken: "percent" }} valueText={pctText} onChange={(v) => set({ brightness: v / 100 })} />
      <LabeledSlider label="Contrast" value={Math.round(c.contrast * 100)} min={50} max={200} step={1} unit={{ short: "%", spoken: "percent" }} valueText={pctText} onChange={(v) => set({ contrast: v / 100 })} />
      <LabeledSlider label="Saturation" value={Math.round(c.saturation * 100)} min={0} max={200} step={1} unit={{ short: "%", spoken: "percent" }} valueText={pctText} onChange={(v) => set({ saturation: v / 100 })} />
      <LabeledSlider label="Temperature" minLabel="Cool" maxLabel="Warm" bipolar value={Math.round(c.temperature * 100)} min={-100} max={100} step={1} valueText={(v) => (v === 0 ? "Neutral" : `${Math.abs(v)} ${v < 0 ? "cooler" : "warmer"}`)} onChange={(v) => set({ temperature: v / 100 })} />
      <LabeledSlider label="Sharpen" value={Math.round((c.sharpen ?? 0) * 100)} min={0} max={100} step={5} unit={{ short: "%", spoken: "percent" }} valueText={pctText} onChange={(v) => set({ sharpen: v ? v / 100 : undefined })} help="Shows in the exported video." />
    </Fold>
  );
}

/** Watermark & logo: boxes that remove, blur or cover part of the picture. */
export function WatermarkSection({
  patches,
  onChange,
  onEdit,
  pictures,
  editing,
}: {
  patches: Patch[] | undefined;
  onChange: (p: Patch[] | undefined, group?: string) => void;
  /** Place a box on the preview. */
  onEdit: (patchId: string) => void;
  /** Pictures from My Assets that can cover a box. */
  pictures: { id: string; name: string }[];
  editing: string | null;
}) {
  const list = patches ?? [];
  const set = (id: string, x: Partial<Patch>, group?: string) => onChange(list.map((p) => (p.id === id ? { ...p, ...x } : p)), group);
  const btn = "flex min-h-7 flex-1 items-center justify-center rounded-md border border-line text-2xs hover:border-control aria-pressed:border-primary aria-pressed:bg-primary-soft";
  return (
    <Fold title={`Watermark & logo${list.length ? ` (${list.length})` : ""}`} testId="watermark-section" defaultOpen={list.length > 0}>
      <p className="text-xs text-muted">Draw a box over a watermark, logo, face or number plate — then remove, blur or cover it.</p>
      {list.map((p, i) => (
        <div key={p.id} className={`flex flex-col gap-2 rounded-md border p-2 ${editing === p.id ? "border-amber-300" : "border-line"}`}>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold">Box {i + 1}</span>
            <span className="flex gap-2">
              <button type="button" className="text-link underline" onClick={() => onEdit(p.id)} data-testid="patch-place">
                {editing === p.id ? "Placing…" : "Place on preview"}
              </button>
              <button type="button" className="text-danger underline" onClick={() => onChange(list.length > 1 ? list.filter((x) => x.id !== p.id) : undefined)}>
                Remove box
              </button>
            </span>
          </div>
          <div role="group" aria-label={`What box ${i + 1} does`} className="flex gap-1">
            {(["remove", "blur", "cover"] as const).map((m) => (
              <button key={m} type="button" aria-pressed={p.mode === m} className={btn} onClick={() => set(p.id, { mode: m })}>
                {m === "remove" ? "Remove" : m === "blur" ? "Blur" : "Cover"}
              </button>
            ))}
          </div>
          {p.mode === "blur" && <LabeledSlider label="Blur strength" value={p.strength ?? 12} min={2} max={60} step={1} valueText={(v) => String(v)} onChange={(v) => set(p.id, { strength: v }, "clip:patch-blur")} />}
          {p.mode === "remove" && <p className="text-2xs text-muted">Filled in from the picture around the box. Best for small logos on calm backgrounds.</p>}
          {p.mode === "cover" && (
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center justify-between gap-2 text-xs">
                <span>Color</span>
                <input type="color" aria-label="Cover color" value={p.color ?? "#000000"} onChange={(e) => set(p.id, { color: e.target.value, mediaId: undefined }, "clip:patch-color")} className="swatch" />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span>…or your logo / picture</span>
                <select className="field" value={p.mediaId ?? ""} onChange={(e) => set(p.id, { mediaId: e.target.value || undefined })}>
                  <option value="">None (use the color)</option>
                  {pictures.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>
      ))}
      {list.length < 8 && (
        <button
          type="button"
          className="btn btn-secondary w-full text-xs"
          data-testid="add-patch"
          onClick={() => {
            const id = `w${Date.now().toString(36)}`;
            onChange([...list, newPatch(id)]);
            onEdit(id);
          }}
        >
          <Icon name="plus" className="size-4" /> Add a box
        </button>
      )}
    </Fold>
  );
}

/** The "Bubble": crop to a square, cut to a circle, a white ring (e.g. the camera over a screen recording). */
export const BUBBLE_MASK: ClipMask = { shape: "circle", radius: 0, feather: 1, border: { color: "#ffffff", width: 4 } };

/** Shape: rounded corners or a circle, a soft edge and a border. */
export function MaskSection({ mask, onChange, onBubble }: { mask: ClipMask | undefined; onChange: (m: ClipMask | undefined, group?: string) => void; onBubble: () => void }) {
  const m = mask ?? { shape: "rect" as const, radius: 0.12, feather: 1 };
  const set = (x: Partial<ClipMask>, group?: string) => {
    const n = { ...m, ...x };
    onChange(n.shape === "rect" && !n.border?.width ? undefined : n, group);
  };
  const btn = "flex min-h-8 flex-1 items-center justify-center gap-1 rounded-md border border-line px-1 text-2xs hover:border-control aria-pressed:border-primary aria-pressed:bg-primary-soft";
  return (
    <Fold title="Shape & border" testId="mask-section" defaultOpen={!!mask}>
      <div role="group" aria-label="Shape" className="grid grid-cols-5 gap-1">
        <button type="button" className={btn} aria-pressed={m.shape === "rect"} onClick={() => set({ shape: "rect" })}>
          <span aria-hidden="true" className="size-3 border-[1.5px] border-current" /> Normal
        </button>
        <button type="button" className={btn} aria-pressed={m.shape === "rounded"} onClick={() => set({ shape: "rounded", radius: m.radius || 0.12 })}>
          <span aria-hidden="true" className="size-3 rounded-[3px] border-[1.5px] border-current" /> Rounded
        </button>
        <button type="button" className={btn} aria-pressed={m.shape === "circle"} onClick={() => set({ shape: "circle" })}>
          <span aria-hidden="true" className="size-3 rounded-full border-[1.5px] border-current" /> Circle
        </button>
        <button type="button" className={btn} aria-pressed={m.shape === "diamond"} onClick={() => set({ shape: "diamond" })}>
          <span aria-hidden="true" className="size-3 rotate-45 border-[1.5px] border-current" /> Diamond
        </button>
        <button type="button" className={btn} aria-pressed={m.shape === "star" || m.shape === "custom"} onClick={() => set({ shape: "star" })}>
          <span aria-hidden="true" className="text-2xs leading-none">★</span> Star
        </button>
      </div>
      <button type="button" className="btn btn-secondary w-full text-xs" onClick={onBubble} data-testid="bubble">
        <span aria-hidden="true" className="size-3.5 rounded-full border-2 border-white" /> Make it a round bubble (square crop + circle + ring)
      </button>
      {m.shape === "rounded" && <LabeledSlider label="Corner radius" value={Math.round(m.radius * 100)} min={2} max={50} step={1} unit={{ short: "%", spoken: "percent" }} valueText={pctText} onChange={(v) => set({ radius: v / 100 }, "clip:mask")} />}
      {m.shape !== "rect" && <LabeledSlider label="Soft edge" value={m.feather} min={0} max={30} step={1} unit={{ short: "px", spoken: "pixels" }} valueText={(v) => `${v} pixels`} onChange={(v) => set({ feather: v }, "clip:mask")} />}
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium">Border</span>
        <span className="flex items-center gap-2">
          <input type="color" aria-label="Border color" value={m.border?.color ?? "#ffffff"} onChange={(e) => set({ border: { color: e.target.value, width: m.border?.width || 4 } }, "clip:mask-border")} className="swatch" />
        </span>
      </div>
      <LabeledSlider label="Border width" value={m.border?.width ?? 0} min={0} max={24} step={1} unit={{ short: "px", spoken: "pixels" }} valueText={(v) => `${v} pixels`} onChange={(v) => set({ border: v ? { color: m.border?.color ?? "#ffffff", width: v } : undefined }, "clip:mask-border")} />
    </Fold>
  );
}
