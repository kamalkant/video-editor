const SIZES = {
  xs: "size-3 border-[1.5px]",
  sm: "size-4 border-2",
  md: "size-6 border-2",
  lg: "size-9 border-[3px]",
} as const;

/**
 * A turning ring for work in progress. With a `label` it is a live status for screen readers
 * (the label itself is hidden); without one it is decoration next to text that says what's happening.
 */
export function Spinner({ size = "sm", label, className = "" }: { size?: keyof typeof SIZES; label?: string; className?: string }) {
  const ring = <span aria-hidden className={`inline-block shrink-0 animate-spin rounded-full border-current border-t-transparent ${SIZES[size]} ${className}`} />;
  if (!label) return ring;
  return (
    <span role="status" className="inline-flex items-center">
      {ring}
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** A spinner over the middle of its (relative) parent, e.g. a stage or a panel that is loading. */
export function SpinnerOverlay({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-app/60 text-sm text-muted backdrop-blur-[1px] ${className}`}>
      <Spinner size="md" className="text-primary" />
      <span>{label}</span>
    </div>
  );
}
