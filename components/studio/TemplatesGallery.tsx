"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { drawBackdrop } from "@/lib/backdrops";
import { clipLength, mainStarts, type AnyClip, type ElementClip, type TextClip, type TimelineDoc } from "@/lib/edit/doc";
import { drawElement } from "@/lib/elements/draw";
import { elementRect } from "@/lib/elements/geometry";
import {
  deleteCustomTemplate,
  getCustomTemplates,
  TEMPLATE_CATEGORIES,
  TEMPLATES,
  type CustomTemplate,
  type Template,
} from "@/lib/templates";
import { drawText } from "@/lib/text/render";
import { Icon } from "@/components/ui/Icon";

/** The moment a template's picture shows: the one with the most on screen (checked every half second). */
function thumbMoment(doc: TimelineDoc): { t: number; at: (c: AnyClip, start: number) => boolean } {
  const spans: [number, number][] = [];
  for (const tr of doc.tracks) {
    const starts = tr.kind === "main" ? mainStarts(tr.clips) : tr.clips.map((c) => (c as { start: number }).start);
    tr.clips.forEach((c, i) => spans.push([starts[i], starts[i] + clipLength(c as AnyClip)]));
  }
  let best = 0.5;
  let most = -1;
  for (let t = 0.5; t <= 30; t += 0.5) {
    const n = spans.filter(([a, b]) => t >= a && t < b).length;
    if (n > most) [best, most] = [t, n];
  }
  return { t: best, at: (c, start) => best >= start && best < start + clipLength(c) };
}

/** A small picture of a template: its backdrop, blank scenes, elements and texts at its busiest moment, drawn like the preview. */
function TemplateThumb({ doc }: { doc: TimelineDoc }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const W = doc.canvas.width;
    const H = doc.canvas.height;
    ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
    ctx.fillStyle = doc.canvas.background === "transparent" ? "#000" : doc.canvas.background;
    ctx.fillRect(0, 0, W, H);
    if (doc.canvas.backdrop) drawBackdrop(ctx, doc.canvas.backdrop, W, H);
    const m = thumbMoment(doc);
    // Video 1: a blank scene there covers the backdrop
    const main = doc.tracks.find((t) => t.kind === "main");
    if (main) {
      const starts = mainStarts(main.clips);
      main.clips.forEach((c, i) => {
        if (c.type !== "blank" || !m.at(c, starts[i])) return;
        ctx.fillStyle = c.fill;
        ctx.fillRect(0, 0, W, H);
      });
    }
    // overlays bottom to top (the last track is drawn on top)
    for (const tr of [...doc.tracks].reverse()) {
      if (tr.kind !== "overlay") continue;
      for (const c of tr.clips as (AnyClip & { start: number })[]) {
        if (!m.at(c, c.start)) continue;
        if (c.type === "text") drawText(ctx, c as TextClip & { start: number }, W, H);
        else if (c.type === "element") {
          const e = c as ElementClip & { start: number };
          const into = Math.max(0, m.t - e.start);
          const r = elementRect(e, into, W, H);
          ctx.save();
          ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
          if (r.rot) ctx.rotate((r.rot * Math.PI) / 180);
          ctx.translate(-r.w / 2, -r.h / 2);
          drawElement(ctx, e.el, r.w, r.h, { into, len: e.duration });
          ctx.restore();
        }
      }
    }
  }, [doc]);
  const tall = doc.canvas.height > doc.canvas.width;
  return <canvas ref={ref} width={tall ? 90 : 192} height={tall ? 160 : doc.canvas.width === doc.canvas.height ? 192 : 108} aria-hidden="true" className={`block rounded-md ${tall ? "mx-auto h-full" : "w-full"}`} />;
}

/** Templates (rail panel): ready-made projects to start from. */
export function TemplatesGallery({
  onUse,
  onSaveCurrentAsTemplate,
}: {
  onUse: (t: Template) => void;
  onSaveCurrentAsTemplate?: () => void;
}) {
  const [cat, setCat] = useState<(typeof TEMPLATE_CATEGORIES)[number]>("All");
  const [customs, setCustoms] = useState<CustomTemplate[]>([]);

  useEffect(() => {
    setCustoms(getCustomTemplates());
  }, []);

  const built = useMemo(() => new Map(TEMPLATES.map((t) => [t.id, t.build()])), []);
  
  // Custom templates mapped to Template interface
  const customTemplates: Template[] = useMemo(
    () =>
      customs.map((c) => ({
        id: c.id,
        name: c.name,
        category: "Custom" as const,
        hint: c.hint,
        build: () => JSON.parse(JSON.stringify(c.doc)),
      })),
    [customs]
  );

  const allTemplates = useMemo(() => [...TEMPLATES, ...customTemplates], [customTemplates]);
  const list = allTemplates.filter((t) => cat === "All" || t.category === cat);

  const handleDeleteCustom = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteCustomTemplate(id);
    setCustoms(getCustomTemplates());
  };

  return (
    <div className="flex flex-col gap-3" data-testid="templates-gallery">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">Start from a ready-made project: studio set, titles and animations.</p>
        {onSaveCurrentAsTemplate && (
          <button
            type="button"
            onClick={onSaveCurrentAsTemplate}
            className="flex items-center gap-1 rounded border border-line bg-canvas px-2 py-1 text-xs font-medium text-ink hover:border-control hover:bg-raised"
            title="Save current timeline project as a custom template"
          >
            <Icon name="plus" className="size-3.5" />
            Save as template
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1" role="group" aria-label="Template categories">
        {TEMPLATE_CATEGORIES.map((c) => (
          <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)} className={`rounded-md px-2 py-1 text-xs ${cat === c ? "bg-primary font-semibold text-white" : "bg-raised text-muted hover:text-ink"}`}>
            {c}
          </button>
        ))}
      </div>

      <ul className="grid grid-cols-2 gap-2">
        {list.map((t) => {
          const doc = built.get(t.id) ?? t.build();
          const isCustom = t.category === "Custom";
          return (
            <li key={t.id} className="relative group">
              <button
                type="button"
                onClick={() => onUse(t)}
                aria-label={`Use template ${t.name}`}
                title={t.hint}
                className="flex w-full flex-col gap-1 rounded-lg border border-line p-1 text-left hover:border-primary hover:bg-primary-soft transition-colors"
              >
                <span className="flex aspect-video items-center justify-center overflow-hidden rounded-md bg-canvas">
                  <TemplateThumb doc={doc} />
                </span>
                <span className="px-0.5 text-[0.6875rem] font-medium truncate">{t.name}</span>
                <span className="px-0.5 text-[0.625rem] text-muted">
                  {t.category} · {doc.canvas.width}×{doc.canvas.height}
                </span>
              </button>
              {isCustom && (
                <button
                  type="button"
                  onClick={(e) => handleDeleteCustom(e, t.id)}
                  className="absolute top-2 right-2 hidden group-hover:flex size-5 items-center justify-center rounded bg-black/70 text-white hover:bg-red-600 transition-colors"
                  aria-label="Delete custom template"
                >
                  <Icon name="close" className="size-3" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-[0.6875rem] text-muted">
        Includes News, YouTube, Social, Business, Gaming, Weather Radar, and your own saved custom templates.
      </p>
    </div>
  );
}
