"use client";

import { useServerCaps } from "@/lib/editor/useServerCaps";
import { EXPORT_FORMATS, FORMAT_GROUPS, type ExportFormat } from "@/lib/export/presets";

/** The export file format: MP4 (recommended) first, then every other format in groups. */
export function FormatPicker({ value, onChange, blockedOf, sizeOf }: { value: ExportFormat; onChange: (f: ExportFormat) => void; blockedOf: (f: ExportFormat) => string | null; /** "~24 MB" (null: not shown) */ sizeOf?: (f: ExportFormat) => string | null }) {
  // off a Mac the website pack has no Safari .mov (Apple's encoder): say what's in it
  const { safariAlpha } = useServerCaps();
  const labelOf = (f: (typeof EXPORT_FORMATS)[number]) => (f.id === "pack" && !safariAlpha ? "Website pack (VP9 alpha)" : f.label);
  const detailOf = (f: (typeof EXPORT_FORMATS)[number]) => (f.id === "pack" && !safariAlpha ? "WebM see-through video + a poster + embed code, in one zip" : f.detail);
  return (
    <fieldset className="flex flex-col gap-2" data-testid="export-formats">
      <legend className="mb-1 text-sm font-semibold">Format</legend>
      {FORMAT_GROUPS.map((g) => (
        <div key={g.id} role="group" aria-label={g.label} className="flex flex-col gap-1">
          {g.id !== "video" && <p className="mt-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">{g.label}</p>}
          {EXPORT_FORMATS.filter((f) => f.group === g.id).map((f) => {
            const why = blockedOf(f.id);
            const on = value === f.id;
            const rec = "recommended" in f && f.recommended;
            return (
              <label
                key={f.id}
                title={why ?? undefined}
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary ${rec ? "py-2.5" : "py-1.5"} ${on ? "border-primary bg-primary-soft" : "border-control hover:border-line"} ${why ? "opacity-55" : ""}`}
              >
                <input type="radio" name="export-format" className="mt-0.5 size-4 shrink-0" checked={on} onChange={() => onChange(f.id)} aria-describedby={`fmt-${f.id}`} />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    {labelOf(f)}
                    {rec && <span className="rounded bg-primary px-1.5 py-px text-[0.625rem] font-semibold uppercase tracking-wide text-white">Recommended</span>}
                  </span>
                  <span id={`fmt-${f.id}`} className="block text-xs text-muted">
                    {why ?? detailOf(f)}
                  </span>
                </span>
                {(() => {
                  const size = why ? null : (sizeOf?.(f.id) ?? null);
                  return size ? (
                    <span className="ml-auto shrink-0 self-center pl-2 text-xs tabular-nums text-muted" data-testid="format-size" title="About this big (an estimate)">
                      {size}
                    </span>
                  ) : null;
                })()}
              </label>
            );
          })}
        </div>
      ))}
    </fieldset>
  );
}
