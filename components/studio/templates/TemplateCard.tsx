"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BroadcastTemplate } from "@/lib/templates/types";
import { renderProceduralMotion } from "@/lib/templates/motionEngine";
import { clipLength, type AnyClip, type ElementClip, type TextClip } from "@/lib/edit/doc";
import { drawElement } from "@/lib/elements/draw";
import { elementRect } from "@/lib/elements/geometry";
import { drawText } from "@/lib/text/render";
import { drawBackdrop } from "@/lib/backdrops";
import { mainStarts } from "@/lib/edit/doc";
import { formatTime } from "@/lib/format";
import { Skeleton } from "@/components/ui/Skeleton";

export function TemplateCard({
  template,
  isSelected,
  onSelect,
  onUse,
  onRename,
  onDelete,
}: {
  template: BroadcastTemplate;
  isSelected: boolean;
  onSelect: () => void;
  onUse: () => void;
  /** your own template: rename inline on double-click */
  onRename?: (newName: string) => void;
  /** your own template: delete icon button */
  onDelete?: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(template.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditName(template.name);
  }, [template.name]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const commitRename = () => {
    setIsEditing(false);
    const trimmed = editName.trim();
    if (trimmed && trimmed !== template.name && onRename) {
      onRename(trimmed);
    } else {
      setEditName(template.name);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!onRename) return;
    e.stopPropagation();
    e.preventDefault();
    setIsEditing(true);
    setEditName(template.name);
  };

  // your template: its video's frame behind the titles (loaded once)
  const [picture, setPicture] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!template.previewImageUrl) return;
    const img = new Image();
    img.onload = () => setPicture(img);
    img.src = template.previewImageUrl;
    return () => {
      img.onload = null;
    };
  }, [template.previewImageUrl]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const doc = useMemo(() => template.build(), [template]);
  const docRef = useRef(doc);
  docRef.current = doc;

  // Run procedural motion animation loop on hover or if selected
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    let active = true;
    const engine = template.previewCanvasEngine ?? "newsroomMatrix";

    startTimeRef.current = 0;

    const render = (time: number) => {
      if (!active) return;
      if (!startTimeRef.current) startTimeRef.current = time;
      const elapsed = (time - startTimeRef.current) / 1000;

      try {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, cv.width, cv.height);

        const d0 = docRef.current;
        if (picture) {
          // your template: its video's frame, filling the card like the video fills the canvas
          const k = Math.max(cv.width / picture.naturalWidth, cv.height / picture.naturalHeight);
          const w = picture.naturalWidth * k;
          const h = picture.naturalHeight * k;
          ctx.drawImage(picture, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
        } else if (template.previewBackdrop && d0) {
          // a starter template: its own backdrop (studio set / gradient) and blank scenes
          ctx.setTransform(cv.width / d0.canvas.width, 0, 0, cv.height / d0.canvas.height, 0, 0);
          if (d0.canvas.backdrop) drawBackdrop(ctx, d0.canvas.backdrop, d0.canvas.width, d0.canvas.height);
          const main = d0.tracks.find((tr) => tr.kind === "main");
          const t0 = isHovered || isSelected ? elapsed : 2.0;
          if (main) {
            const st = mainStarts(main.clips);
            main.clips.forEach((c, i) => {
              if (c.type === "blank" && t0 >= st[i] && t0 < st[i] + clipLength(c as AnyClip)) {
                ctx.fillStyle = c.fill;
                ctx.fillRect(0, 0, d0.canvas.width, d0.canvas.height);
              }
            });
          }
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        } else {
          // Draw procedural motion frame
          renderProceduralMotion(engine, ctx, cv.width, cv.height, isHovered || isSelected ? elapsed : 1.0);
        }

        // Draw template overlay text and badges
        const currentDoc = docRef.current;
        if (currentDoc) {
          const W = currentDoc.canvas.width;
          const H = currentDoc.canvas.height;
          ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);

          const t = isHovered || isSelected ? elapsed : 2.0;
          for (const tr of [...currentDoc.tracks].reverse()) {
            if (tr.kind !== "overlay") continue;
            for (const c of tr.clips as (AnyClip & { start: number })[]) {
              const len = clipLength(c as AnyClip);
              if (t < c.start || t >= c.start + len) continue;

              if (c.type === "text") {
                drawText(ctx, c as TextClip & { start: number }, W, H);
              } else if (c.type === "element") {
                const e = c as ElementClip & { start: number };
                const into = Math.max(0, t - e.start);
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
        }
      } catch {
        // Recover gracefully
      }

      if (isHovered || isSelected) {
        animFrameRef.current = requestAnimationFrame(render);
      }
    };

    if (isHovered || isSelected) {
      animFrameRef.current = requestAnimationFrame(render);
    } else {
      // Draw static preview frame
      render(500);
    }

    return () => {
      active = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [template, isHovered, isSelected, picture]);

  const aspectStyle =
    template.aspectRatio === "9:16" ? "9 / 16" : template.aspectRatio === "1:1" ? "1 / 1" : "16 / 9";

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`group relative flex flex-col overflow-hidden rounded-xl border bg-surface transition-all duration-200 cursor-pointer ${
        isSelected
          ? "border-primary ring-2 ring-primary/40 shadow-lg shadow-primary/10"
          : "border-line hover:border-primary/60 hover:shadow-md"
      }`}
      role="button"
      tabIndex={0}
      aria-label={`Select ${template.name}`}
      onKeyDown={(e) => {
        if (isEditing) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {/* Thumbnail Stage (uniform rectangular frame for perfect grid alignment) */}
      <div className="relative w-full aspect-video overflow-hidden bg-black/95 flex items-center justify-center p-1">
        <canvas
          ref={canvasRef}
          width={template.aspectRatio === "9:16" ? 180 : template.aspectRatio === "1:1" ? 240 : 320}
          height={template.aspectRatio === "9:16" ? 320 : template.aspectRatio === "1:1" ? 240 : 180}
          className="max-h-full max-w-full rounded object-contain shadow-sm transition-transform duration-300 group-hover:scale-105"
          style={{ aspectRatio: aspectStyle }}
        />
        {/* your template's frame is on its way */}
        {template.previewImageUrl && !picture && <Skeleton className="absolute inset-1 rounded opacity-70" />}

        {/* Top Badges */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5 z-10">
          <span
            className={`rounded px-1.5 py-0.5 text-[0.625rem] font-bold tracking-wider uppercase shadow backdrop-blur-md ${
              template.resolution === "4K"
                ? "bg-amber-500/90 text-black border border-amber-400"
                : "bg-blue-600/90 text-white border border-blue-400"
            }`}
          >
            {template.resolution}
          </span>
          <span className="rounded bg-black/60 px-1.5 py-0.5 text-[0.625rem] font-medium text-white/90 backdrop-blur-md border border-white/10">
            {template.aspectRatio}
          </span>

        </div>

        {/* your own template (bottom left: the top right is the hover "Use Template" button) */}
        {template.custom && (
          <span className="absolute bottom-2 left-2 z-10 flex items-center gap-1">
            <span data-testid="custom-badge" className="rounded bg-fuchsia-600/90 px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wider text-white shadow">
              Custom
            </span>
            {/* its files were deleted from My Assets: the pane offers to replace them */}
            {(template.custom.missing?.video || template.custom.missing?.audio) && (
              <span data-testid="missing-badge" className="rounded bg-red-600/90 px-1.5 py-0.5 text-[0.625rem] font-bold text-white shadow" title="A file of this template was deleted from My Assets. Select the template to replace it.">
                {template.custom.missing.video ? "Video missing" : "Sound missing"}
              </span>
            )}
          </span>
        )}

        {/* Duration Badge */}
        <div className="absolute bottom-2 right-2 z-10 rounded bg-black/75 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-white backdrop-blur-md border border-white/10">
          {formatTime(template.duration)}
        </div>

        {/* Quick-use button on hover (top-right pill, zero blur over running video) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onUse();
          }}
          className={`absolute top-2 right-2 z-20 flex items-center gap-1 rounded-lg bg-primary/95 px-2.5 py-1 text-[0.6875rem] font-bold text-white shadow-xl backdrop-blur-sm transition-all duration-200 hover:bg-primary hover:scale-105 active:scale-95 ${
            // (always clickable: a pointer over it is hovering the card anyway; keyboard focus shows it too)
            isHovered ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1 focus-visible:opacity-100 focus-visible:translate-y-0"
          }`}
          aria-label={`Use template ${template.name}`}
        >
          <span>Use Template</span>
          <span aria-hidden="true">→</span>
        </button>
      </div>

      {/* Info Footer */}
      <div className="flex flex-col p-3 gap-1 border-t border-line/60 bg-surface/50">
        <div className="flex items-center justify-between gap-2">
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  commitRename();
                } else if (e.key === "Escape") {
                  setIsEditing(false);
                  setEditName(template.name);
                }
              }}
              onBlur={commitRename}
              className="w-full rounded border border-primary bg-surface px-1.5 py-0.5 text-sm font-semibold text-ink outline-none ring-2 ring-primary/40 shadow-xs"
              aria-label="Rename template"
            />
          ) : (
            <h3
              onDoubleClick={handleDoubleClick}
              className={`truncate text-sm font-semibold text-ink group-hover:text-primary transition-colors ${
                onRename ? "cursor-text select-none" : ""
              }`}
              title={onRename ? `${template.name} (Double-click to rename)` : template.name}
            >
              {template.name}
            </h3>
          )}
          <span className="flex shrink-0 items-center gap-1.5">
            {isSelected && (
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-[0.625rem] text-white">
                ✓
              </span>
            )}
            {onDelete && (
              <button
                type="button"
                aria-label={`Delete ${template.name}`}
                title="Delete template"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="flex size-6 items-center justify-center rounded text-muted hover:bg-danger/10 hover:text-danger transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3.5"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            )}
          </span>
        </div>
        <p className="line-clamp-1 text-xs text-muted">
          {template.category} · {template.slots.length} layers
        </p>
      </div>
    </div>
  );
}
