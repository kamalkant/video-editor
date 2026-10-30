"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { Tip } from "@/components/ui/Tip";
import type { KeySource } from "@/lib/editor/studioReducer";

export function KeyColorControl(p: {
  value: string;
  detected: string | null;
  source: KeySource;
  picking: boolean;
  pickWarning: string | null;
  onStartPick: () => void;
  onCancelPick: () => void;
  onHexCommit: (hex: string) => void;
  onResetDetected: () => void;
  onDismissWarning: () => void;
  onUseDetected: () => void;
  hideHeading?: boolean;
}) {
  const [draft, setDraft] = useState(p.value.replace("#", ""));
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(p.value);
  if (shown !== p.value) {
    setShown(p.value);
    setDraft(p.value.replace("#", ""));
  }
  const commit = () => {
    const h = draft.trim().replace(/^#/, "");
    if (!/^[0-9A-Fa-f]{6}$/.test(h)) return setError("Use 6 characters, like 12AF34");
    setError(null);
    p.onHexCommit("#" + h);
  };
  return (
    <section aria-labelledby="key-heading" className="flex flex-col gap-2">
      <h2 id="key-heading" className={p.hideHeading ? "sr-only" : "font-semibold"}>
        Background color
      </h2>
      {p.picking ? (
        <p className="text-xs">
          <strong>Click the green background in the preview</strong> to remove it. A magnifier shows exactly which pixel you pick.
        </p>
      ) : p.source === "default" ? (
        <p className="text-xs text-warn-ink">We couldn&apos;t detect the background. Pick the color in the preview.</p>
      ) : (
        <p className="text-xs">
          <span aria-hidden="true">✓ </span>Removing <span className="font-mono">{p.value}</span>
          {p.source === "detected" ? " (detected)" : p.source === "picked" ? " (picked)" : ""}
        </p>
      )}
      {p.picking && p.detected && (
        <button type="button" className="btn btn-secondary self-start" onClick={p.onUseDetected}>
          <span aria-hidden="true" className="inline-block size-4 rounded-sm border border-control" style={{ background: p.detected }} />
          Use detected {keyName(p.detected).toLowerCase()} ({p.detected})
        </button>
      )}
      {/* one compact row: the color, its hex code, and the pipette to pick it from the video */}
      <div className="flex items-center gap-1.5">
        <span aria-hidden="true" className="size-7 shrink-0 rounded-md border border-control shadow-inner" style={{ background: p.value }} />
        <label htmlFor="hex" className="sr-only">
          Background color hex code
        </label>
        <span className="flex h-7 min-w-0 flex-1 items-center rounded-md border border-control bg-raised pl-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-link">
          <span aria-hidden="true" className="text-xs text-muted">
            #
          </span>
          <input
            id="hex"
            className="h-full w-0 min-w-0 flex-1 bg-transparent px-1 font-mono text-xs uppercase outline-none"
            value={draft}
            maxLength={7}
            aria-invalid={!!error}
            aria-describedby={error ? "hex-error" : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
          />
        </span>
        <Tip text={p.picking ? "Cancel picking" : "Pick the color from the video"} align="right">
          <button
            type="button"
            className={`flex size-7 shrink-0 items-center justify-center rounded-md border ${p.picking ? "border-primary bg-primary text-white" : "border-control bg-raised text-ink hover:bg-hover"}`}
            aria-pressed={p.picking}
            aria-label={p.picking ? "Cancel picking" : "Pick key color from video"}
            onClick={p.picking ? p.onCancelPick : p.onStartPick}
          >
            <Icon name="pipette" className="size-4" />
          </button>
        </Tip>
      </div>
      <p className="text-2xs text-muted">RGB: {rgbText(p.value)}</p>
      {error && (
        <p id="hex-error" className="text-sm text-danger">
          {error}
        </p>
      )}
      {/* the line is kept while it's hidden, so picking a color doesn't push the rest down */}
      {p.detected && (
        <button
          type="button"
          className={`self-start text-sm text-link underline min-h-hit ${p.value === p.detected ? "invisible" : ""}`}
          aria-hidden={p.value === p.detected || undefined}
          tabIndex={p.value === p.detected ? -1 : undefined}
          onClick={p.onResetDetected}
        >
          Reset to detected color ({p.detected})
        </button>
      )}
      <div aria-live="polite">
        {p.pickWarning && (
          <Notice
            tone="warning"
            title="This spot looks like part of the person"
            actions={
              <>
                <button type="button" className="btn btn-secondary" onClick={p.onDismissWarning}>
                  Use it anyway
                </button>
                <button type="button" className="btn btn-secondary" onClick={p.onResetDetected}>
                  Reset to detected color
                </button>
              </>
            }
          >
            {p.pickWarning}
          </Notice>
        )}
      </div>
    </section>
  );
}

function rgbText(hex: string) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(", ");
}

function keyName(hex: string) {
  const h = hex.replace("#", "");
  return parseInt(h.slice(4, 6), 16) > parseInt(h.slice(2, 4), 16) ? "Blue" : "Green";
}
