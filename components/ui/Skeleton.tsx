/**
 * Placeholders in the shape of what is loading, with a light band sweeping across (`.skeleton` in
 * app/globals.css; still with reduced motion). Hidden from screen readers: the loading region says
 * what's happening (aria-busy or a status).
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`skeleton block rounded-md ${className}`} />;
}

/** Rows of a list (a line of text, and a shorter one under it). */
export function SkeletonRows({ n = 4, className = "", thumb = false }: { n?: number; className?: string; thumb?: boolean }) {
  return (
    <ul aria-hidden className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: n }, (_, i) => (
        <li key={i} className="flex items-center gap-2">
          {thumb && <Skeleton className="h-9 w-14 shrink-0" />}
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3" />
            <Skeleton className="h-2.5 w-2/3" />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A grid of media tiles (pictures over a title). */
export function SkeletonGrid({ n = 8, className = "grid-cols-2", aspect = "aspect-video", caption = true }: { n?: number; className?: string; aspect?: string; caption?: boolean }) {
  return (
    <ul aria-hidden className={`grid gap-2 ${className}`} data-testid="skeleton-grid">
      {Array.from({ length: n }, (_, i) => (
        <li key={i} className="flex flex-col gap-1.5">
          <Skeleton className={`w-full ${aspect}`} />
          {caption && <Skeleton className="h-2.5 w-3/4" />}
        </li>
      ))}
    </ul>
  );
}
