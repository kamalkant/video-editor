"use client";

import { useEffect, useRef, useState } from "react";
import { ACCOUNTS_URL } from "@/lib/apps";
import { Icon } from "@/components/ui/Icon";
import { uploadVideo } from "@/lib/api/upload";
import type { VideoMeta } from "@/lib/api/types";
import { drawBackdrop, GRADIENTS, STUDIO_SETS, type Backdrop } from "@/lib/backdrops";
import type { Canvas } from "@/lib/edit/doc";
import { GeminiBadge } from "./GeminiBits";

function SetThumb({ b }: { b: Backdrop }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const x = c?.getContext("2d");
    if (c && x) drawBackdrop(x, b, c.width, c.height);
  }, [b]);
  return <canvas ref={ref} width={192} height={108} aria-hidden="true" className="block aspect-video w-full rounded-md" />;
}

const same = (a: Backdrop | undefined, b: Backdrop) => !!a && JSON.stringify(a) === JSON.stringify(b);

/**
 * Background (rail panel): what's behind everything — transparent, a color,
 * a built-in studio set, a gradient, or your own picture or video. With a
 * person cut out (AI Removal), this is "Replace background".
 */
export function BackgroundPanel(p: {
  canvas: Canvas;
  onCanvas: (patch: Partial<Canvas>) => void;
  assets: VideoMeta[] | null;
  /** The clip whose background can be removed (the selected video, else the first one). */
  target: { name: string; removalOn: boolean } | null;
  onRemovePerson: () => void;
  onUploaded: (v: VideoMeta) => void;
  /** ✦ Gemini: describe a background (opens the Generate background window). */
  onGenerate?: () => void;
  onAddBackgroundLayer?: (b?: Backdrop) => void;
}) {
  const bd = p.canvas.backdrop;
  const pick = (b: Backdrop | undefined) => p.onCanvas({ backdrop: b });
  const [upload, setUpload] = useState<{ pct: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const pics = (p.assets ?? []).filter((a) => a.kind === "image" || (a.kind ?? "video") === "video");

  const tile = (on: boolean) => `flex flex-col gap-1 rounded-lg border p-1 text-left text-[0.6875rem] ${on ? "border-primary ring-1 ring-primary" : "border-line hover:border-control"}`;
  return (
    <div className="flex flex-col gap-4" data-testid="background-panel">
      {p.onGenerate && (
        <button type="button" className="flex items-center gap-2 rounded-lg border border-dashed border-control px-3 py-2 text-left text-xs hover:border-primary hover:bg-primary-soft" onClick={p.onGenerate} data-testid="describe-background">
          <Icon name="ai" className="size-4 shrink-0 text-link" />
          <span className="flex-1">
            <span className="block font-medium text-ink">Describe a background</span>
            <span className="text-muted">Gemini makes it from your words</span>
          </span>
          <GeminiBadge />
        </button>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-secondary w-full text-xs"
          onClick={() => p.onAddBackgroundLayer?.(p.canvas.backdrop)}
          title="Add the chosen background as an editable layer on the timeline"
        >
          <Icon name="layers" className="size-3.5 text-primary" /> Add Background to Timeline
        </button>
      </div>
      {p.target && (
        <div className="rounded-lg border border-line bg-raised/40 p-2.5 text-xs">
          {p.target.removalOn ? (
            <p className="text-success">
              <Icon name="check" className="mr-1 inline size-3.5 align-[-2px]" strokeWidth={3} />
              The background of <strong className="break-all">{p.target.name}</strong> is removed: pick what goes behind.
            </p>
          ) : (
            <>
              <p className="mb-2 text-muted">To put a new background behind the person, their own background must go first.</p>
              <button type="button" className="btn btn-primary w-full text-xs" onClick={p.onRemovePerson}>
                <Icon name="eraser" className="size-4" /> Remove the person&apos;s background
              </button>
            </>
          )}
        </div>
      )}

      <section aria-label="Canvas" className="flex flex-col gap-1.5">
        <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">Canvas</h3>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" className={tile(!bd && p.canvas.background === "transparent")} onClick={() => p.onCanvas({ backdrop: undefined, background: "transparent" })}>
            <span className="block aspect-video w-full rounded-md bg-checker" />
            Transparent
          </button>
          <label className={`${tile(!bd && p.canvas.background !== "transparent")} cursor-pointer`}>
            <span className="block aspect-video w-full rounded-md border border-line" style={{ background: p.canvas.background === "transparent" ? "#000" : p.canvas.background }} />
            <span className="flex items-center justify-between">
              Color
              <input type="color" aria-label="Background color" value={p.canvas.background === "transparent" ? "#000000" : p.canvas.background} onChange={(e) => p.onCanvas({ backdrop: undefined, background: e.target.value })} className="swatch size-5" />
            </span>
          </label>
        </div>
      </section>

      <section aria-label="Studio sets" className="flex flex-col gap-1.5">
        <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">Studio sets</h3>
        <ul className="grid grid-cols-2 gap-1.5">
          {STUDIO_SETS.map((s) => {
            const b: Backdrop = { kind: "set", id: s.id };
            return (
              <li key={s.id}>
                <button type="button" className={`w-full ${tile(same(bd, b))}`} onClick={() => pick(b)} aria-pressed={same(bd, b)} aria-label={`Studio set: ${s.label}`}>
                  <SetThumb b={b} />
                  {s.label}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label="Gradients" className="flex flex-col gap-1.5">
        <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">Gradients</h3>
        <ul className="grid grid-cols-3 gap-1.5">
          {GRADIENTS.map((g) => {
            const b: Backdrop = { kind: "gradient", from: g.from, to: g.to, angle: g.angle };
            return (
              <li key={g.label}>
                <button type="button" className={`w-full ${tile(same(bd, b))}`} onClick={() => pick(b)} aria-pressed={same(bd, b)} aria-label={`Gradient: ${g.label}`}>
                  <span className="block aspect-video w-full rounded-md" style={{ background: `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})` }} />
                  {g.label}
                </button>
              </li>
            );
          })}
        </ul>
        {bd?.kind === "gradient" && (
          <div className="flex items-center gap-2 text-xs">
            <input type="color" aria-label="Gradient start color" value={bd.from} onChange={(e) => pick({ ...bd, from: e.target.value })} className="swatch" />
            <input type="color" aria-label="Gradient end color" value={bd.to} onChange={(e) => pick({ ...bd, to: e.target.value })} className="swatch" />
            <input type="range" min={0} max={360} step={5} value={bd.angle} onChange={(e) => pick({ ...bd, angle: Number(e.target.value) })} aria-label="Gradient direction" className="min-w-0 flex-1 accent-[var(--color-primary)]" />
          </div>
        )}
      </section>

      <section aria-label="Your picture or video" className="flex flex-col gap-1.5">
        <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">Your picture or video</h3>
        <ul className="grid grid-cols-3 gap-1.5">
          {pics.slice(0, 18).map((a) => {
            const b: Backdrop = { kind: "media", mediaId: a.id };
            return (
              <li key={a.id}>
                <button type="button" className={`w-full ${tile(same(bd, b))}`} onClick={() => pick(b)} aria-pressed={same(bd, b)} title={a.fileName} aria-label={`Use ${a.fileName} as the background`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/videos/${a.id}/thumb`} alt="" className="block aspect-video w-full rounded-md object-cover" />
                  <span className="truncate">{a.fileName}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" className="btn btn-secondary text-xs" onClick={() => file.current?.click()} disabled={!!upload}>
          <Icon name="upload" className="size-4" /> {upload ? `Uploading… ${upload.pct}%` : "Upload a picture or video"}
        </button>
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="backdrop-input"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setError(null);
            setUpload({ pct: 0 });
            try {
              const v = await uploadVideo(f, (l, t) => setUpload({ pct: Math.round((l / Math.max(1, t)) * 100) }));
              p.onUploaded(v);
              pick({ kind: "media", mediaId: v.id });
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setUpload(null);
            }
          }}
        />
        {error && <p className="text-xs text-danger">{error}</p>}
      </section>

      {bd && (
        <button type="button" className="text-left text-xs text-link underline" onClick={() => pick(undefined)}>
          No backdrop (back to the plain canvas)
        </button>
      )}
      <p className="text-[0.6875rem] text-muted">
        <span className="soon mr-1">Later</span> Generate a background from a description (needs a cloud AI service).{" "}
        <a href={`${ACCOUNTS_URL}/roadmap`} target="_blank" rel="noreferrer" className="text-link underline">
          See the plan
        </a>
      </p>
    </div>
  );
}
