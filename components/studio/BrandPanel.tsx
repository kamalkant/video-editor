"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { LabeledSlider } from "@/components/ui/LabeledSlider";
import { Switch } from "@/components/ui/Switch";
import { uploadVideo } from "@/lib/api/upload";
import type { VideoMeta } from "@/lib/api/types";
import type { Watermark, WatermarkLook } from "@/lib/edit/doc";
import { brandFamily, type useBrand } from "@/lib/editor/useBrand";

type BrandApi = ReturnType<typeof useBrand>;
const CORNERS: { id: Watermark["corner"]; label: string }[] = [
  { id: "tl", label: "Top left" },
  { id: "tr", label: "Top right" },
  { id: "bl", label: "Bottom left" },
  { id: "br", label: "Bottom right" },
];

/** A new logo on a video: top right, a little in from the corner. */
export const DEFAULT_LOGO_LOOK: WatermarkLook = { corner: "tr", size: 0.12, opacity: 0.9, margin: 0.03 };
const ANIM_CHOICES = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade" },
  { id: "pop", label: "Pop" },
  { id: "slide", label: "Slide" },
] as const;

/**
 * Where the logo sits (a corner, or dragged on the preview), its size and opacity,
 * a box behind it (brand colors), rounded corners, how it comes in and goes out,
 * and when it shows. In the Brand Kit panel and in the inspector's Logo card.
 */
export function LogoControls({ wm, onChange, colors = [], duration = 0 }: { wm: Watermark; onChange: (w: Watermark, group?: string) => void; colors?: string[]; duration?: number }) {
  const placed = wm.x != null && wm.y != null;
  const anim = wm.anim ?? { in: "none" as const, out: "none" as const };
  const whole = wm.from == null && wm.to == null;
  const D = Math.max(0.5, duration);
  const from = Math.min(D, wm.from ?? 0);
  const to = Math.min(D, Math.max(from, wm.to ?? D));
  const h3 = "text-[0.6875rem] font-semibold uppercase tracking-wide text-muted";
  return (
    <>
      <div role="group" aria-label="Logo corner" className="grid grid-cols-2 gap-1">
        {CORNERS.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={!placed && wm.corner === c.id}
            onClick={() => onChange({ ...wm, corner: c.id, x: undefined, y: undefined })}
            className="min-h-7 rounded-md border border-line text-[0.6875rem] hover:border-control aria-pressed:border-primary aria-pressed:bg-primary-soft"
          >
            {c.label}
          </button>
        ))}
      </div>
      {placed && <p className="text-[0.6875rem] text-muted">Placed by hand on the preview. A corner button puts it back in a corner.</p>}
      <LabeledSlider label="Logo size" value={Math.round(wm.size * 100)} min={4} max={40} step={1} unit={{ short: "%", spoken: "percent of the width" }} valueText={(v) => `${v} percent of the width`} onChange={(v) => onChange({ ...wm, size: v / 100 }, "logo:size")} />
      <LabeledSlider label="Logo opacity" value={Math.round(wm.opacity * 100)} min={10} max={100} step={5} unit={{ short: "%", spoken: "percent" }} valueText={(v) => `${v} percent`} onChange={(v) => onChange({ ...wm, opacity: v / 100 }, "logo:opacity")} />

      <h4 className={h3}>Box and corners</h4>
      <Switch label="A box behind the logo" checked={!!wm.plate} onCheckedChange={(v) => onChange({ ...wm, plate: v ? { color: "#ffffff", pad: 0.15 } : undefined })} />
      {wm.plate && (
        <>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-medium">Box color</span>
            <span className="flex flex-wrap items-center justify-end gap-1" role="group" aria-label="Box color">
              {colors.map((c) => (
                <button key={c} type="button" aria-label={`Brand color ${c}`} aria-pressed={wm.plate!.color.toLowerCase() === c.toLowerCase()} title={`Brand color ${c}`} onClick={() => onChange({ ...wm, plate: { ...wm.plate!, color: c } })} className="size-6 rounded border border-control aria-pressed:ring-2 aria-pressed:ring-primary aria-pressed:ring-offset-1 aria-pressed:ring-offset-surface" style={{ background: c }} />
              ))}
              <input type="color" aria-label="Box color (any color)" value={wm.plate.color} onChange={(e) => onChange({ ...wm, plate: { ...wm.plate!, color: e.target.value } }, "logo:plate-color")} className="swatch" />
            </span>
          </div>
          <LabeledSlider label="Room around" value={Math.round(wm.plate.pad * 100)} min={0} max={50} step={1} unit={{ short: "%", spoken: "percent of the logo width" }} valueText={(v) => `${v} percent of the logo width`} onChange={(v) => onChange({ ...wm, plate: { ...wm.plate!, pad: v / 100 } }, "logo:pad")} />
        </>
      )}
      <LabeledSlider label="Round corners" value={Math.round((wm.radius ?? 0) * 100)} min={0} max={50} step={1} unit={{ short: "%", spoken: "percent" }} valueText={(v) => (v >= 50 ? "fully round" : `${v} percent`)} onChange={(v) => onChange({ ...wm, radius: v ? v / 100 : undefined }, "logo:radius")} />

      <h4 className={h3}>Show</h4>
      <div className="grid grid-cols-2 gap-2">
        {(["in", "out"] as const).map((side) => (
          <label key={side} className="flex flex-col gap-1 text-xs">
            <span className="font-medium">{side === "in" ? "Comes in" : "Goes out"}</span>
            <select className="field min-h-8 text-xs" value={anim[side]} onChange={(e) => onChange({ ...wm, anim: { ...anim, [side]: e.target.value as typeof anim.in } })} aria-label={side === "in" ? "Logo comes in" : "Logo goes out"}>
              {ANIM_CHOICES.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <Switch label="The whole video" checked={whole} onCheckedChange={(v) => onChange(v ? { ...wm, from: undefined, to: undefined } : { ...wm, from: 0, to: Math.round(Math.min(D, 10) * 10) / 10 })} />
      {!whole && (
        <>
          <LabeledSlider label="From" value={from} min={0} max={D} step={0.1} decimals={1} unit={{ short: "s", spoken: "seconds" }} valueText={(v) => `${v.toFixed(1)} seconds`} onChange={(v) => onChange({ ...wm, from: v, to: Math.max(v + 0.5, to) }, "logo:from")} />
          <LabeledSlider label="To" value={to} min={0} max={D} step={0.1} decimals={1} unit={{ short: "s", spoken: "seconds" }} valueText={(v) => `${v.toFixed(1)} seconds`} onChange={(v) => onChange({ ...wm, to: v, from: Math.min(from, Math.max(0, v - 0.5)) }, "logo:to")} />
        </>
      )}
    </>
  );
}

/**
 * Brand Kit (rail panel): your logo (and showing it on this project), brand
 * colors, your own fonts, and an intro / outro. Kept for every project.
 */
export function BrandPanel(p: {
  api: BrandApi;
  assets: VideoMeta[] | null;
  watermark: Watermark | undefined;
  onWatermark: (w: Watermark | undefined, group?: string) => void;
  /** the video's length (the logo can show for a part of it) */
  duration?: number;
  onAddClip: (v: VideoMeta, where: "start" | "end") => void;
  onUploaded: (v: VideoMeta) => void;
}) {
  const b = p.api.brand;
  const [color, setColor] = useState("#1d4ed8");
  const [busy, setBusy] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const fontInput = useRef<HTMLInputElement>(null);
  const pics = (p.assets ?? []).filter((a) => a.kind === "image");
  const vids = (p.assets ?? []).filter((a) => (a.kind ?? "video") === "video");
  const logoMeta = b?.logo ? (p.assets ?? []).find((a) => a.id === b.logo) : undefined;
  const wm = p.watermark;
  if (!b) return <p className="text-xs text-muted">{p.api.error ?? "Loading the Brand Kit…"}</p>;
  const section = "flex flex-col gap-2";
  const h3 = "text-[0.6875rem] font-semibold uppercase tracking-wide text-muted";
  return (
    <div className="flex flex-col gap-4" data-testid="brand-panel">
      <p className="text-xs text-muted">Your logo, colors and fonts, ready in every project.</p>
      {p.api.error && <p className="text-xs text-danger">{p.api.error}</p>}

      <section aria-label="Logo" className={section}>
        <h3 className={h3}>Logo</h3>
        <div className="flex items-center gap-2">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-md border border-line bg-checker-dark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {b.logo ? <img src={`/api/videos/${b.logo}/source`} alt="Your logo" className="max-h-12 max-w-12 object-contain" /> : <Icon name="image" className="size-5 text-muted" />}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <select className="field" aria-label="Logo picture" value={b.logo ?? ""} onChange={(e) => void p.api.save({ logo: e.target.value || null })}>
              <option value="">No logo</option>
              {pics.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fileName}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-secondary text-xs" onClick={() => logoInput.current?.click()} disabled={busy === "logo"}>
              <Icon name="upload" className="size-3.5" /> {busy === "logo" ? "Uploading…" : "Upload a logo (PNG)"}
            </button>
          </div>
        </div>
        <input
          ref={logoInput}
          type="file"
          accept="image/png,image/webp,image/jpeg"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="brand-logo-input"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setBusy("logo");
            try {
              const v = await uploadVideo(f, () => undefined);
              p.onUploaded(v);
              await p.api.save({ logo: v.id });
            } finally {
              setBusy(null);
            }
          }}
        />
        {b.logo && (
          <>
            {/* (switched on again: the look it had last time; Studio remembers it when it's switched off) */}
            <Switch label="Show my logo on this video" checked={!!wm} onCheckedChange={(v) => p.onWatermark(v ? { ...DEFAULT_LOGO_LOOK, ...(b.logoLook ?? {}), mediaId: b.logo! } : undefined)} />
            {wm && (
              <>
                <LogoControls wm={wm} onChange={(w, g) => p.onWatermark(w, g)} colors={b.colors} duration={p.duration} />
                <p className="text-[0.6875rem] text-muted">Tip: click the logo on the preview to drag it anywhere or resize it.</p>
              </>
            )}
            {logoMeta && <p className="truncate text-[0.6875rem] text-muted">{logoMeta.fileName}</p>}
          </>
        )}
      </section>

      <section aria-label="Brand colors" className={section}>
        <h3 className={h3}>Brand colors</h3>
        <ul className="flex flex-wrap gap-1.5">
          {b.colors.map((c) => (
            <li key={c} className="group/sw relative">
              {/* a click copies the color's code; the small × removes it */}
              <button type="button" title={`${c} · click to copy the code`} aria-label={`Brand color ${c}: copy the code`} onClick={() => void navigator.clipboard?.writeText(c).catch(() => undefined)} className="block size-8 rounded-md border border-control" style={{ background: c }} />
              <button type="button" aria-label={`Remove brand color ${c}`} title="Remove" onClick={() => void p.api.save({ colors: b.colors.filter((x) => x !== c) })} className="absolute -right-1.5 -top-1.5 hidden size-4 items-center justify-center rounded-full border border-control bg-surface text-muted hover:text-danger group-hover/sw:flex group-focus-within/sw:flex">
                <Icon name="close" className="size-2.5" />
              </button>
            </li>
          ))}
          {!b.colors.length && <li className="text-xs text-muted">No colors yet.</li>}
        </ul>
        {b.colors.length < 8 && (
          <div className="flex items-center gap-2">
            <input type="color" aria-label="New brand color" value={color} onChange={(e) => setColor(e.target.value)} className="swatch" />
            <button type="button" className="btn btn-secondary text-xs" onClick={() => void p.api.save({ colors: [...new Set([...b.colors, color])] })}>
              <Icon name="plus" className="size-3.5" /> Add color
            </button>
          </div>
        )}
        <p className="text-[0.6875rem] text-muted">One click to use them next to the color pickers: text, the logo box, backgrounds, borders.</p>
      </section>

      <section aria-label="Fonts" className={section}>
        <h3 className={h3}>Your fonts</h3>
        <ul className="flex flex-col gap-1">
          {b.fonts.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 rounded-md border border-line px-2 py-1.5">
              <span className="min-w-0 truncate text-base" style={{ fontFamily: `"${brandFamily(f.id)}", sans-serif` }}>
                {f.name}
              </span>
              <button type="button" className="text-xs text-danger underline" onClick={() => void p.api.removeFont(f.id)}>
                Remove
              </button>
            </li>
          ))}
          {!b.fonts.length && <li className="text-xs text-muted">No fonts yet.</li>}
        </ul>
        <button type="button" className="btn btn-secondary text-xs" onClick={() => fontInput.current?.click()} disabled={busy === "font"}>
          <Icon name="upload" className="size-3.5" /> {busy === "font" ? "Adding…" : "Upload a font (TTF, OTF, WOFF)"}
        </button>
        <input
          ref={fontInput}
          type="file"
          accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="brand-font-input"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setBusy("font");
            try {
              await p.api.addFont(f);
            } finally {
              setBusy(null);
            }
          }}
        />
        <p className="text-[0.6875rem] text-muted">Pick them in the Text card (Font). Exports use them too.</p>
      </section>

      <section aria-label="Intro and outro" className={section}>
        <h3 className={h3}>Intro & outro</h3>
        {(["intro", "outro"] as const).map((k) => {
          const id = b[k];
          const v = id ? vids.find((a) => a.id === id) : undefined;
          return (
            <div key={k} className="flex items-center gap-2">
              <select className="field min-w-0 flex-1" aria-label={k === "intro" ? "Intro clip" : "Outro clip"} value={id ?? ""} onChange={(e) => void p.api.save({ [k]: e.target.value || null })}>
                <option value="">{k === "intro" ? "No intro" : "No outro"}</option>
                {vids.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.fileName}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-secondary shrink-0 px-2 text-xs" disabled={!v} onClick={() => v && p.onAddClip(v, k === "intro" ? "start" : "end")}>
                Add {k === "intro" ? "at start" : "at end"}
              </button>
            </div>
          );
        })}
      </section>
    </div>
  );
}
