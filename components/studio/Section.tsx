import type { ReactNode } from "react";

/** Collapsible inspector section with an optional per-section Reset. */
export function Section({ title, children, onReset, resetLabel = "Reset", defaultOpen = true }: { title: string; children: ReactNode; onReset?: () => void; resetLabel?: string; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group border-b border-line py-0.5 last:border-b-0">
      <summary className="flex min-h-hit cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="text-[0.6rem] text-muted transition-transform group-open:rotate-90">
            ▶
          </span>
          {title}
        </span>
        {onReset && (
          <button
            type="button"
            className="min-h-hit px-1 text-xs font-normal text-link underline"
            onClick={(e) => {
              e.preventDefault();
              onReset();
            }}
          >
            {resetLabel}
          </button>
        )}
      </summary>
      <div className="flex flex-col gap-2.5 pb-3">{children}</div>
    </details>
  );
}
