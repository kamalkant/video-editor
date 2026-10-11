"use client";

import { createContext, useContext, useId, useState, type ReactNode } from "react";

/** "compact": one row (label · slider · number), for tight places like the inspector's tabs. */
export const SliderDensity = createContext<"normal" | "compact">("normal");

export type LabeledSliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  minLabel?: string;
  maxLabel?: string;
  unit?: { short: string; spoken: string };
  bipolar?: boolean;
  valueText: (v: number) => string;
  onChange: (v: number) => void;
  describedBy?: string;
  help?: ReactNode;
  disabled?: boolean;
};

function snap(v: number, min: number, max: number, step: number, decimals: number) {
  const c = Math.min(max, Math.max(min, v));
  return Number((Math.round((c - min) / step) * step + min).toFixed(decimals));
}

/** Native range + number box sharing one visible label. */
export function LabeledSlider(p: LabeledSliderProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const unitId = `${id}-unit`;
  const helpId = `${id}-help`;
  const decimals = p.decimals ?? 0;
  const [draft, setDraft] = useState(p.value.toFixed(decimals));
  const [shown, setShown] = useState(p.value);
  if (shown !== p.value) {
    setShown(p.value);
    setDraft(p.value.toFixed(decimals));
  }
  const fill = ((p.value - p.min) / (p.max - p.min)) * 100;
  const described = [p.help ? helpId : null, p.describedBy].filter(Boolean).join(" ") || undefined;
  const compact = useContext(SliderDensity) === "compact";

  const commit = () => {
    const n = Number(draft.replace(",", "."));
    if (!Number.isFinite(n)) return setDraft(p.value.toFixed(decimals));
    const v = snap(n, p.min, p.max, p.step, decimals);
    setDraft(v.toFixed(decimals));
    if (v !== p.value) p.onChange(v);
  };

  const range = (
    <input
      type="range"
      className={`range ${p.bipolar ? "bipolar" : ""} ${compact ? "min-w-0 flex-1" : ""}`}
      style={{ ["--fill" as string]: `${p.bipolar ? 0 : fill}%` }}
      aria-labelledby={labelId}
      aria-describedby={described}
      aria-valuetext={p.valueText(p.value)}
      min={p.min}
      max={p.max}
      step={p.step}
      value={p.value}
      disabled={p.disabled}
      onChange={(e) => p.onChange(snap(Number(e.target.value), p.min, p.max, p.step, decimals))}
    />
  );
  const box = (
    <span className="flex shrink-0 items-center gap-1">
      <input
        type="text"
        inputMode="decimal"
        aria-labelledby={`${labelId} ${p.unit ? unitId : ""}`.trim()}
        aria-describedby={described}
        className={compact ? "field h-7 min-h-0 w-10 px-1 text-right text-xs tabular-nums" : "field h-8 min-h-0 w-16 text-right tabular-nums"}
        value={draft}
        disabled={p.disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
      />
      {/* compact rows: no "%" / "s" on screen (the label's tooltip says it; screen readers still hear it) */}
      {p.unit &&
        (compact ? (
          <span id={unitId} className="sr-only">
            {p.unit.spoken}
          </span>
        ) : (
          <span id={unitId} className="w-5 text-xs text-muted">
            <span aria-hidden="true">{p.unit.short}</span>
            <span className="sr-only">{p.unit.spoken}</span>
          </span>
        ))}
    </span>
  );
  if (compact)
    return (
      <div role="group" aria-labelledby={labelId}>
        <div className="flex items-center gap-2">
          <span id={labelId} className="w-[5.25rem] shrink-0 truncate text-xs font-medium" title={p.unit ? `${p.label} (${p.unit.spoken})` : p.label}>
            {p.label}
          </span>
          {range}
          {box}
        </div>
        {p.help && (
          <p id={helpId} className="text-[0.6875rem] text-muted">
            {p.help}
          </p>
        )}
      </div>
    );

  return (
    <div role="group" aria-labelledby={labelId} className="py-0.5">
      <div className="flex items-center justify-between gap-3">
        <span id={labelId} className="text-sm font-medium">
          {p.label}
        </span>
        <span className="flex items-center gap-1">
          <input
            type="text"
            inputMode="decimal"
            aria-labelledby={`${labelId} ${p.unit ? unitId : ""}`.trim()}
            aria-describedby={described}
            className="field h-8 min-h-0 w-16 text-right tabular-nums"
            value={draft}
            disabled={p.disabled}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
            }}
          />
          {p.unit && (
            <span id={unitId} className="w-5 text-xs text-muted">
              <span aria-hidden="true">{p.unit.short}</span>
              <span className="sr-only">{p.unit.spoken}</span>
            </span>
          )}
        </span>
      </div>
      <input
        type="range"
        className={`range ${p.bipolar ? "bipolar" : ""}`}
        style={{ ["--fill" as string]: `${p.bipolar ? 0 : fill}%` }}
        aria-labelledby={labelId}
        aria-describedby={described}
        aria-valuetext={p.valueText(p.value)}
        min={p.min}
        max={p.max}
        step={p.step}
        value={p.value}
        disabled={p.disabled}
        onChange={(e) => p.onChange(snap(Number(e.target.value), p.min, p.max, p.step, decimals))}
      />
      {(p.minLabel || p.maxLabel) && (
        <div aria-hidden="true" className="relative -mt-1.5 flex justify-between text-[0.6875rem] text-muted">
          <span>{p.minLabel}</span>
          {p.bipolar && <span className="absolute left-1/2 -translate-x-1/2">0</span>}
          <span>{p.maxLabel}</span>
        </div>
      )}
      {p.help && (
        <p id={helpId} className="mt-0.5 text-xs text-muted">
          {p.help}
        </p>
      )}
    </div>
  );
}
