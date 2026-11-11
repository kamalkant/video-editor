"use client";

import { Icon } from "@/components/ui/Icon";
import type { TimelineDoc } from "@/lib/edit/doc";
import { placeholdersOf } from "@/lib/templates/v2/build";

const WHAT = { video: "a video", image: "a photo", both: "a video or photo" } as const;

/**
 * A template's slots still waiting for your media. With one selected: what it takes and how to fill it.
 * Without: the list, each one a click to select it (then a file you add fills it).
 */
export function TemplateSlots({
  doc,
  selectedId,
  onSelect,
  onUpload,
  onMedia,
}: {
  doc: TimelineDoc;
  selectedId: string | null;
  onSelect: (clipId: string) => void;
  /** Choose a file from this computer. */
  onUpload: () => void;
  /** Open My Assets (a file added from there fills the selected slot). */
  onMedia?: () => void;
}) {
  const slots = placeholdersOf(doc);
  if (!slots.length) return null;
  const sel = slots.find((s) => s.clipId === selectedId);
  if (sel)
    return (
      <section aria-label="Template slot" data-testid="template-slot" className="flex flex-col gap-2 rounded-xl border border-primary/50 bg-primary-soft p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Icon name="media" className="size-4 text-link" />
          {sel.role}
        </p>
        <p className="text-xs text-muted">Add {WHAT[sel.accepts]} here: it takes this scene&apos;s place, length and transition.</p>
        <div className="flex gap-2">
          <button type="button" className="btn btn-primary flex-1 justify-center" onClick={onUpload}>
            Upload
          </button>
          {onMedia && (
            <button type="button" className="btn btn-secondary flex-1 justify-center" onClick={onMedia}>
              From Media
            </button>
          )}
        </div>
      </section>
    );
  return (
    <section aria-label="Replace media" data-testid="template-slots" className="mb-3 rounded-xl border border-line bg-raised/40 p-3">
      <p className="mb-2 text-xs font-semibold">Your template is waiting for {slots.length === 1 ? "1 file" : `${slots.length} files`}</p>
      <ul className="flex flex-col gap-1">
        {slots.map((s) => (
          <li key={s.clipId}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-hover"
              onClick={() => onSelect(s.clipId)}
              aria-label={`Fill: ${s.role}`}
            >
              <span className="truncate">{s.role}</span>
              <span className="shrink-0 text-2xs text-muted">{WHAT[s.accepts]}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
