"use client";

import { useId, type ReactNode } from "react";

/** Radio group drawn as tabs/pills. `variant="tabs"` is the dark track with a lit tab (mockup: Color Key | AI Removal | Advanced). */
export function SegmentedControl<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  legendHidden,
  variant = "pills",
  size = "md",
  fill = true,
}: {
  legend: string;
  name: string;
  options: { value: T; label: ReactNode; title?: string; disabled?: boolean }[];
  value: T | null;
  onChange: (v: T) => void;
  legendHidden?: boolean;
  variant?: "pills" | "tabs";
  size?: "sm" | "md";
  /** tabs share the width equally (false: each tab is as wide as its label) */
  fill?: boolean;
  /** @deprecated all controls are dark now */
  dark?: boolean;
}) {
  // radio names must be unique per instance, or two copies of a control fight over one group
  const group = `${name}-${useId()}`;
  const tabs = variant === "tabs";
  return (
    <fieldset className="min-w-0 max-w-full">
      <legend className={legendHidden ? "sr-only" : "mb-1.5 text-sm font-medium"}>{legend}</legend>
      <div className={tabs ? "flex gap-0.5 overflow-x-auto rounded-lg bg-canvas p-0.5" : "flex flex-wrap gap-1.5"}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <label
              key={o.value}
              title={o.title}
              className={`relative flex ${size === "sm" ? "h-7 min-h-7" : "min-h-hit"} cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-control)] text-center ${tabs && size === "sm" ? "min-w-7 px-2" : "px-3"} has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-link ${size === "sm" ? "text-xs" : "text-sm"} ${
                tabs ? (fill ? "flex-1 " : "") : "border "
              }${
                o.disabled
                  ? "cursor-not-allowed text-muted opacity-60 " + (tabs ? "" : "border-line")
                  : selected
                    ? tabs
                      ? "bg-primary font-semibold text-white shadow"
                      : "border-primary bg-primary-soft font-semibold text-ink ring-1 ring-primary"
                    : tabs
                      ? "text-muted hover:bg-raised hover:text-ink"
                      : "border-control bg-raised text-ink hover:bg-hover"
              }`}
            >
              <input type="radio" className="sr-only" name={group} value={o.value} checked={selected} disabled={o.disabled} onChange={() => onChange(o.value)} />
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
