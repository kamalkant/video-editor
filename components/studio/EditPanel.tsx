"use client";

import { useSyncExternalStore } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { TimelineDoc } from "@/lib/edit/doc";
import type { Clock } from "@/lib/editor/clock";
import { getEditingTools } from "@/lib/editor/editingTools";

export type EditAction = {
  id: string;
  label: string;
  icon: IconName;
  /** what it does (the tooltip, and the reason when it can't be used) */
  hint: string;
  /** keyboard shortcut to show */
  keys?: string;
  onClick: (() => void) | null;
};
export type EditTab = { id: string; label: string; icon: IconName; onClick: () => void };

export type EditPanelProps =
  | {
      doc: TimelineDoc;
      selectedId: string | null;
      clock: Clock;
      media?: Record<string, { hasAudio?: boolean; fileName?: string }>;
      onSplit?: (clipId: string, t: number) => void;
      onTrim?: (clipId: string, edge: "in" | "out", t: number) => void;
      onDelete?: (clipId: string) => void;
      onDuplicate?: (clipId: string) => void;
      onCrop?: (clipId: string) => void;
      onSpeed?: (clipId: string) => void;
      onReverse?: (clipId: string) => void;
      onFreeze?: (clipId: string, t: number) => void;
      onMask?: (clipId: string) => void;
      onSilences?: (clipId: string) => void;
      onKeyframe?: (clipId: string, t: number) => void;
      tabs?: EditTab[];
      actions?: never;
      target?: never;
    }
  | {
      target: { name: string; kind: string } | null;
      actions: EditAction[];
      tabs: EditTab[];
      doc?: never;
      clock?: never;
      selectedId?: never;
      media?: never;
      onSplit?: never;
      onTrim?: never;
      onDelete?: never;
      onDuplicate?: never;
      onCrop?: never;
      onSpeed?: never;
      onReverse?: never;
      onFreeze?: never;
      onMask?: never;
      onSilences?: never;
      onKeyframe?: never;
    };

/**
 * Edit (left rail): the editing tools as big buttons, for the selected clip
 * (or the Video 1 clip under the playhead), and shortcuts to its settings.
 * Synchronized with the timeline top toolbar.
 */
export function EditPanel(props: EditPanelProps) {
  // If clock & doc are provided, subscribe to clock so tool states sync dynamically with Timeline
  const clockT = useSyncExternalStore(
    props.clock ? props.clock.subscribe : () => () => {},
    props.clock ? props.clock.get : () => 0,
    () => 0,
  );

  let target: { name: string; kind: string } | null;
  let actions: EditAction[];
  let tabs: EditTab[];

  if (props.doc && props.clock) {
    const tools = getEditingTools(props.doc, props.selectedId ?? null, clockT, props.media ?? {}, props.doc.canvas?.fps ?? 30);
    target = tools.targetInfo;
    tabs = props.tabs ?? [];

    actions = [
      {
        id: "split",
        label: "Split",
        icon: "split",
        keys: "S",
        hint: tools.canSplit ? "Split at the playhead (S)" : "Move playhead over a clip to split",
        onClick: tools.canSplit && props.onSplit ? () => props.onSplit!(tools.target!.clip.id, clockT) : null,
      },
      {
        id: "trim-in",
        label: "Trim start",
        icon: "trim",
        keys: "Q",
        hint: tools.canTrimStart ? "Trim start to playhead (Q)" : "Move playhead over a clip to trim",
        onClick: tools.canTrimStart && props.onTrim ? () => props.onTrim!(tools.target!.clip.id, "in", clockT) : null,
      },
      {
        id: "trim-out",
        label: "Trim end",
        icon: "trim",
        keys: "W",
        hint: tools.canTrimEnd ? "Trim end to playhead (W)" : "Move playhead over a clip to trim",
        onClick: tools.canTrimEnd && props.onTrim ? () => props.onTrim!(tools.target!.clip.id, "out", clockT) : null,
      },
      {
        id: "delete",
        label: "Delete",
        icon: "trash",
        keys: "Del",
        hint: tools.canDelete ? "Delete the selected clip (Del)" : "Select a clip to delete",
        onClick: tools.canDelete && props.onDelete ? () => props.onDelete!(tools.selected!.clip.id) : null,
      },
      {
        id: "duplicate",
        label: "Duplicate",
        icon: "plus",
        keys: "⌘D",
        hint: tools.canDuplicate ? "Copy the selected clip (⌘D)" : "Select a clip to duplicate",
        onClick: tools.canDuplicate && props.onDuplicate ? () => props.onDuplicate!(tools.selected!.clip.id) : null,
      },
      {
        id: "crop",
        label: "Crop",
        icon: "crop",
        hint: tools.canCrop ? "Crop the picture on the preview" : "Select a video or picture first",
        onClick: tools.canCrop && props.onCrop ? () => props.onCrop!(tools.selected!.clip.id) : null,
      },
      {
        id: "speed",
        label: "Speed",
        icon: "speed",
        hint: tools.canSpeed ? "Change the speed of the selected clip" : "Select a video clip first",
        onClick: tools.canSpeed && props.onSpeed ? () => props.onSpeed!(tools.selected!.clip.id) : null,
      },
      {
        id: "reverse",
        label: "Reverse",
        icon: "reverse",
        hint: tools.canReverse ? "Play the clip backwards" : "Select a video clip first",
        onClick: tools.canReverse && props.onReverse ? () => props.onReverse!(tools.selected!.clip.id) : null,
      },
      {
        id: "freeze",
        label: "Freeze",
        icon: "freeze",
        hint: tools.canFreeze ? "Hold the frame at the playhead (adds a 2-second picture on Video 1)" : "Move playhead over a Video 1 clip to freeze",
        onClick: tools.canFreeze && props.onFreeze ? () => props.onFreeze!(tools.target!.clip.id, clockT) : null,
      },
      {
        id: "mask",
        label: "Mask",
        icon: "mask",
        hint: tools.canMask ? "Give the selected clip a shape: rounded corners, a circle or a camera bubble" : "Select a video or picture first",
        onClick: tools.canMask && props.onMask ? () => props.onMask!(tools.selected!.clip.id) : null,
      },
      {
        id: "silences",
        label: "Silences",
        icon: "waveform",
        hint: tools.canSilences ? "Find and cut the pauses in this clip's speech" : tools.selected ? "This clip has no sound" : "Select a clip with speech first",
        onClick: tools.canSilences && props.onSilences ? () => props.onSilences!(tools.selected!.clip.id) : null,
      },
      {
        id: "keyframe",
        label: "Keyframe",
        icon: "keyframe",
        hint: !tools.selected ? "Select a clip first, then add keyframes to move, zoom, turn or fade it" : !tools.canKeyframe ? "Move the playhead onto the selected clip" : tools.keyframeHere ? "Remove the keyframe at the playhead" : "Add a keyframe at the playhead (place, size, angle, opacity)",
        onClick: tools.canKeyframe && props.onKeyframe ? () => props.onKeyframe!(tools.selected!.clip.id, clockT) : null,
      },
    ];
  } else {
    target = props.target;
    actions = props.actions;
    tabs = props.tabs;
  }

  return (
    <div className="flex flex-col gap-3" data-testid="edit-panel">
      <p className="rounded-lg border border-line bg-canvas px-2.5 py-2 text-xs" aria-live="polite">
        {target ? (
          <>
            <span className="text-muted">{target.kind}: </span>
            <span className="font-medium">{target.name}</span>
          </>
        ) : (
          <span className="text-muted">Select a clip on the timeline (or put the playhead on one) to edit it.</span>
        )}
      </p>
      <ul className="grid grid-cols-3 gap-1.5" aria-label="Editing tools">
        {actions.map((a) => (
          <li key={a.id} className="flex">
            <button
              type="button"
              disabled={!a.onClick}
              onClick={a.onClick ?? undefined}
              title={a.keys ? `${a.hint} (${a.keys})` : a.hint}
              className="flex w-full flex-col items-center gap-1 rounded-lg border border-line bg-raised px-1 py-2 text-2xs text-ink hover:border-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:text-muted disabled:opacity-40 disabled:hover:border-line disabled:hover:bg-raised"
            >
              <Icon name={a.icon} className="size-5" />
              <span className="leading-tight">{a.label}</span>
            </button>
          </li>
        ))}
      </ul>
      {tabs.length > 0 && (
        <section aria-labelledby="edit-settings" className="flex flex-col gap-1.5">
          <h3 id="edit-settings" className="text-2xs font-semibold uppercase tracking-wide text-muted">
            Clip settings
          </h3>
          <ul className="flex flex-col gap-1">
            {tabs.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={t.onClick} className="flex w-full items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-left text-xs hover:border-primary hover:bg-primary-soft">
                  <Icon name={t.icon} className="size-4 text-muted" />
                  <span className="flex-1">{t.label}</span>
                  <Icon name="chevronRight" className="size-3.5 text-muted" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
