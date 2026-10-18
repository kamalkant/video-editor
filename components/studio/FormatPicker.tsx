"use client";

import { useState } from "react";
import { useServerCaps } from "@/lib/editor/useServerCaps";
import { EXPORT_FORMATS, type ExportFormat } from "@/lib/export/presets";

function FormatDocIcon({ badge, color }: { badge: string; color: string }) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    blue: { bg: "bg-blue-600", text: "text-white" },
    purple: { bg: "bg-purple-600", text: "text-white" },
    amber: { bg: "bg-amber-600", text: "text-white" },
    emerald: { bg: "bg-emerald-600", text: "text-white" },
    slate: { bg: "bg-slate-700", text: "text-white" },
    pink: { bg: "bg-pink-600", text: "text-white" },
    indigo: { bg: "bg-indigo-600", text: "text-white" },
    sky: { bg: "bg-sky-600", text: "text-white" },
    rose: { bg: "bg-rose-600", text: "text-white" },
    violet: { bg: "bg-violet-600", text: "text-white" },
    teal: { bg: "bg-teal-600", text: "text-white" },
  };
  const c = colorMap[color] || colorMap.blue;
  return (
    <div className="relative flex flex-col items-center justify-between w-7 h-9 shrink-0 rounded bg-white shadow-xs border border-slate-200 overflow-hidden">
      <div className="absolute top-0 right-0 w-2 h-2 bg-slate-100 border-b border-l border-slate-200 rounded-bl-xs" />
      <div className="w-2.5 h-0.5 bg-slate-200 mt-2 rounded-full" />
      <div className="w-3.5 h-0.5 bg-slate-200 mt-0.5 rounded-full" />
      <div className={`w-full py-0.5 text-center text-[0.5rem] font-bold tracking-tight uppercase leading-none ${c.bg} ${c.text}`}>
        {badge}
      </div>
    </div>
  );
}

/** The export file format: compact 2-column card grid with badges, radio selector, and live size estimate. */
export function FormatPicker({
  value,
  onChange,
  blockedOf,
  sizeOf,
  category = "all",
}: {
  value: ExportFormat;
  onChange: (f: ExportFormat) => void;
  blockedOf: (f: ExportFormat) => string | null;
  sizeOf?: (f: ExportFormat) => string | null;
  category?: "video" | "image" | "audio" | "all";
}) {
  const [isHovered, setIsHovered] = useState(false);
  const { safariAlpha } = useServerCaps();
  const labelOf = (f: (typeof EXPORT_FORMATS)[number]) =>
    f.id === "pack" && !safariAlpha
      ? "Website pack (VP9 alpha)"
      : f.label;
  const detailOf = (f: (typeof EXPORT_FORMATS)[number]) =>
    f.id === "pack" && !safariAlpha
      ? "WebM see-through video + a poster + embed code, in one zip"
      : f.detail;

  const formats = EXPORT_FORMATS.filter((f) => {
    if (category === "video") {
      return ["mp4", "hevc", "av1", "webm", "webm-alpha", "mov-alpha"].includes(f.id);
    }
    if (category === "image") return f.group === "image";
    if (category === "audio") return f.group === "audio";
    return true;
  });

  return (
    <fieldset
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="flex flex-col rounded-xl border border-dialog-card-border bg-dialog-card p-2.5 shadow-xs"
      data-testid="export-formats"
    >
      <legend className="flex items-center gap-1.5 px-0.5 mb-1.5 text-xs font-semibold text-ink">
        <span>Formats</span>
        <span
          className="inline-flex items-center justify-center size-3.5 rounded-full bg-surface-raised border border-line text-[0.5625rem] text-muted font-normal cursor-help"
          title="Select the target container and video codec"
        >
          ?
        </span>
      </legend>
      <div
        className={`scrollbar-hover-visible ${isHovered ? "scrollbar-active" : ""} grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[19.5rem] sm:max-h-[22rem] overflow-y-auto py-0.5 pl-0.5 pr-3.5`}
        role="radiogroup"
        aria-label="Format selection"
      >
        {formats.map((f) => {
          const anyF = f as any;
          const why = blockedOf(f.id);
          const on = value === f.id;
          const rec = Boolean(anyF.recommended);
          const badge: string = anyF.badge ?? anyF.short ?? f.id.toUpperCase();
          const color: string = anyF.color ?? "blue";
          const size = why ? null : (sizeOf?.(f.id) ?? null);

          return (
            <label
              key={f.id}
              title={why ?? undefined}
              className={`relative flex cursor-pointer items-start gap-2.5 rounded-lg border p-2 transition-all ${
                on
                  ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary"
                  : "border-dialog-border bg-dialog-header/50 hover:border-control hover:bg-dialog-card-hover"
              } ${why ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <input
                type="radio"
                name="export-format"
                className="mt-0.5 size-3.5 shrink-0 text-primary border-slate-300 dark:border-slate-600 focus:ring-primary"
                checked={on}
                disabled={!!why}
                onChange={() => onChange(f.id)}
                aria-describedby={`fmt-${f.id}`}
              />
              <FormatDocIcon badge={badge} color={color} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1 leading-tight">
                  <span className="text-xs font-semibold text-ink">{labelOf(f)}</span>
                  {rec && (
                    <span className="rounded bg-primary px-1 py-0.5 text-[0.5rem] font-bold uppercase tracking-wider text-white leading-none">
                      Recommended
                    </span>
                  )}
                </div>
                <p id={`fmt-${f.id}`} className="mt-0.5 text-[0.6875rem] text-muted leading-tight line-clamp-2">
                  {why ?? detailOf(f)}
                </p>
                {size && (
                  <span className="mt-0.5 inline-block text-[0.625rem] font-medium text-muted tabular-nums">
                    Est. {size}
                  </span>
                )}
              </div>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

