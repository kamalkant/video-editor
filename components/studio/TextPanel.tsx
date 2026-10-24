"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/ui/Icon";
import { createDragChip, setTextDrag, TEXT_DRAG } from "@/lib/editor/mediaDrag";
import { textClipOfStyle, TEXT_STYLES } from "@/lib/text/layout";
import { drawText } from "@/lib/text/render";
import { ensureDocFonts } from "@/lib/text/fonts";

/** A small picture of a text style, drawn by the same code as the preview and the export. */
function StyleThumb({ id }: { id: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const W = 1920;
    const H = 1080;
    ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
    const clip = textClipOfStyle(id);
    const draw = () => {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, "#1e293b");
      g.addColorStop(1, "#334155");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      drawText(ctx, clip, W, H);
    };
    draw();
    // (a style in a Google font: drawn again once the font is here)
    void ensureDocFonts({ tracks: [{ clips: [clip] }] }).then(draw);
  }, [id]);
  return <canvas ref={ref} width={224} height={126} aria-hidden="true" className="block aspect-video w-full rounded-md" />;
}

/** The Text panel: pick a style to add it at the playhead or drag directly onto the preview stage. `onElements`: open the Elements panel (shapes, stickers, emoji). */
export function TextPanel({ onAdd, onElements }: { onAdd: (styleId: string) => void; onElements?: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">Click or drag a style directly onto the preview at the playhead. Then customize your text and colors.</p>
      <ul className="grid grid-cols-2 gap-2">
        {TEXT_STYLES.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(TEXT_DRAG, t.id);
                e.dataTransfer.setData("text/plain", t.label);
                e.dataTransfer.effectAllowed = "copy";
                setTextDrag({ styleId: t.id, label: t.label });
                const chip = createDragChip(t.label, "Text");
                if (chip) e.dataTransfer.setDragImage(chip, 45, 18);
              }}
              onDragEnd={() => setTextDrag(null)}
              onClick={() => onAdd(t.id)}
              aria-label={`Add ${t.label}: ${t.hint}`}
              title={`${t.hint} · Click or drag onto preview`}
              className="group flex w-full cursor-grab active:cursor-grabbing flex-col gap-1 rounded-lg border border-line bg-raised/40 p-1 text-left hover:border-primary hover:bg-primary-soft focus-visible:border-primary"
            >
              <StyleThumb id={t.id} />
              <span className="flex items-baseline justify-between gap-1 px-0.5">
                <span className="truncate text-xs font-medium">{t.label}</span>
                <span className="text-[0.625rem] text-link opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">+ Add</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {onElements && (
        <button type="button" className="flex min-h-hit items-center gap-2 self-start rounded-md px-1 text-xs text-link underline" onClick={onElements}>
          <Icon name="elements" className="size-4" />
          Shapes, stickers and emoji
        </button>
      )}
    </div>
  );
}
