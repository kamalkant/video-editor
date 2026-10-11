"use client";

/** On/off switch (green when on, like the mockup). `hideLabel` keeps the label for screen readers only. */
export function Switch({ label, checked, onCheckedChange, describedBy, disabled, hideLabel, compact }: { label: string; checked: boolean; onCheckedChange: (v: boolean) => void; describedBy?: string; disabled?: boolean; hideLabel?: boolean; compact?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`flex min-h-hit items-center justify-between gap-3 rounded-[var(--radius-control)] text-left text-sm disabled:opacity-50 ${compact ? "" : "w-full"}`}
    >
      <span className={hideLabel ? "sr-only" : "font-medium"}>{label}</span>
      <span aria-hidden="true" className={`relative inline-block h-5.5 w-10 shrink-0 rounded-full border transition-colors ${checked ? "border-on bg-on" : "border-control bg-raised"}`}>
        <span className={`absolute top-[0.1875rem] size-3.5 rounded-full transition-all ${checked ? "left-[1.3rem] bg-white" : "left-[0.1875rem] bg-muted"}`} />
      </span>
    </button>
  );
}
