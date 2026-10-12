import { Skeleton } from "@/components/ui/Skeleton";

/**
 * The editor's outline while it loads (app/editor/loading.tsx on the server, then Studio until it has
 * hydrated): top bar, tool rail, side panel, the stage and the timeline, in the places they will be.
 */
export function EditorSkeleton({ label = "Opening the editor…" }: { label?: string }) {
  return (
    <div className="flex h-dvh min-h-0 flex-col bg-app" aria-busy="true" data-testid="editor-skeleton">
      <span role="status" className="sr-only">
        {label}
      </span>
      {/* top bar */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
        <Skeleton className="size-7 rounded-lg" />
        <Skeleton className="h-4 w-36" />
        <span className="flex-1" />
        <Skeleton className="h-7 w-20 max-sm:hidden" />
        <Skeleton className="h-7 w-24 rounded-lg" />
        <Skeleton className="size-7 rounded-full" />
      </div>
      <div className="flex min-h-0 flex-1">
        {/* tool rail */}
        <div className="flex w-14 shrink-0 flex-col items-center gap-3 border-r border-line bg-surface py-3 max-sm:hidden">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="size-8 rounded-lg" />
          ))}
        </div>
        {/* side panel */}
        <div className="flex w-72 shrink-0 flex-col gap-3 border-r border-line bg-surface p-3 max-lg:hidden">
          <Skeleton className="h-8" />
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="aspect-video" />
            ))}
          </div>
        </div>
        {/* stage */}
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 p-4">
          <Skeleton className="aspect-video w-full max-w-3xl rounded-lg" />
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
        {/* inspector */}
        <div className="flex w-72 shrink-0 flex-col gap-3 border-l border-line bg-surface p-3 max-xl:hidden">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-24" />
        </div>
      </div>
      {/* timeline */}
      <div className="flex h-48 shrink-0 flex-col gap-2 border-t border-line bg-surface p-3">
        <Skeleton className="h-3 w-full max-w-xl" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-8 w-1/3" />
      </div>
    </div>
  );
}
