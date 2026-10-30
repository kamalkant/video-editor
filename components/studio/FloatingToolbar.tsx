"use client";

import { Icon, type IconName } from "@/components/ui/Icon";

type Action = { label: string; icon: IconName; run: (() => void) | null; tone?: "danger" };

/**
 * The selected clip's quick actions, floating over the preview (as Clipchamp does): shown only while a clip
 * is selected. Each one does the job in place or opens its tab in the settings panel on the right.
 */
export function FloatingToolbar(p: {
  kind: string;
  onSplit: (() => void) | null;
  onCrop: (() => void) | null;
  onBackground: (() => void) | null;
  onColor: (() => void) | null;
  onSpeed: (() => void) | null;
  onDuplicate: () => void;
  onDelete: () => void;
  onSettings: () => void;
}) {
  const picture = p.kind === "video" || p.kind === "image";
  const actions: Action[] = [
    { label: "Split at the playhead (S)", icon: "split", run: p.onSplit },
    ...(picture
      ? ([
          { label: "Crop", icon: "crop", run: p.onCrop },
          { label: "Remove background", icon: "background", run: p.onBackground },
          { label: "Color", icon: "palette", run: p.onColor },
        ] satisfies Action[])
      : []),
    ...(p.kind === "video" || p.kind === "audio" ? ([{ label: "Speed", icon: "speed", run: p.onSpeed }] satisfies Action[]) : []),
    { label: "Duplicate", icon: "copy", run: p.onDuplicate },
    { label: "Delete", icon: "trash", run: p.onDelete, tone: "danger" },
  ];
  return (
    <div
      role="toolbar"
      aria-label="Clip actions"
      data-testid="floating-toolbar"
      className="pointer-events-auto flex items-center gap-0.5 rounded-full bg-overlay p-1 shadow-[var(--shadow-float)]"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          disabled={!a.run}
          onClick={a.run ?? undefined}
          aria-label={a.label}
          title={a.label}
          className={`flex size-8 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
            a.tone === "danger" ? "text-muted hover:bg-danger-soft hover:text-danger" : "text-ink hover:bg-hover"
          }`}
        >
          <Icon name={a.icon} className="size-4" />
        </button>
      ))}
      <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-line" />
      <button
        type="button"
        onClick={p.onSettings}
        className="flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-ink transition-colors hover:bg-hover"
        title="All settings for this clip"
      >
        <Icon name="settings" className="size-4" />
        Settings
      </button>
    </div>
  );
}
