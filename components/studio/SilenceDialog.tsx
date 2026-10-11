"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { LabeledSlider } from "@/components/ui/LabeledSlider";
import { Notice } from "@/components/ui/Notice";
import { cutLength, silenceCuts, timelineDuration, type Range, type Segment } from "@/lib/edit/timeline";
import { formatTenths } from "@/lib/format";

/**
 * "Remove silences": finds the pauses in the clip's sound (FFmpeg silencedetect)
 * and cuts them out of the timeline in one undo step. Pauses are drawn on the
 * timeline while the dialog is open.
 */
export function SilenceDialog({ open, onClose, videoId, hasAudio, segments, onPreview, onApply }: { open: boolean; onClose: () => void; videoId: string | null; hasAudio: boolean; segments: Segment[]; onPreview: (r: Range[] | null) => void; onApply: (r: Range[]) => void }) {
  const [noise, setNoise] = useState(-35);
  const [minSilence, setMinSilence] = useState(0.6);
  const [pad, setPad] = useState(0.12);
  const [result, setResult] = useState<{ key: string; silences: Range[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = `${videoId}|${noise}|${minSilence}`;

  useEffect(() => {
    if (!open || !videoId || !hasAudio) return;
    const ac = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/videos/${videoId}/silences`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ noise, minSilence }), signal: ac.signal });
        if (!res.ok) throw new Error();
        setResult({ key, silences: ((await res.json()) as { silences: Range[] }).silences });
        setError(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("Couldn't check the sound for pauses.");
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [open, videoId, hasAudio, key, noise, minSilence]);

  const ready = result?.key === key;
  // only pauses inside the kept parts count
  const cuts = useMemo(() => (ready ? silenceCuts(result.silences, pad).filter((r) => segments.some((g) => r.end > g.in && r.start < g.out)) : []), [ready, result, pad, segments]);
  const removed = cutLength(segments, cuts);
  const total = timelineDuration(segments);

  // mark the pauses on the timeline only when they change (the editor draws again after
  // each call, and `segments` comes new every time: comparing arrays would never settle)
  const marks = open && cuts.length ? JSON.stringify(cuts) : "";
  useEffect(() => {
    onPreview(marks ? (JSON.parse(marks) as Range[]) : null);
  }, [marks, onPreview]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Remove silences"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            aria-disabled={!cuts.length}
            onClick={() => {
              if (!cuts.length) return;
              onApply(cuts);
              onClose();
            }}
          >
            {cuts.length ? `Cut ${cuts.length} pause${cuts.length > 1 ? "s" : ""}` : "Nothing to cut"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">Finds the pauses in speech and cuts them out, so the video gets tighter. You can undo it.</p>
        {!hasAudio ? (
          <Notice tone="info" title="This clip has no sound">
            Remove silences needs a clip with speech.
          </Notice>
        ) : (
          <>
            <LabeledSlider label="Quieter than" value={noise} min={-50} max={-20} step={1} unit={{ short: "dB", spoken: "decibels" }} valueText={(v) => `${v} decibels`} onChange={setNoise} help="Sound below this level counts as a pause. Raise it if there is background noise." />
            <LabeledSlider label="Pauses longer than" value={minSilence} min={0.3} max={2} step={0.1} decimals={1} unit={{ short: "s", spoken: "seconds" }} valueText={(v) => `${v.toFixed(1)} seconds`} onChange={setMinSilence} />
            <LabeledSlider label="Keep a short pause" value={pad} min={0} max={0.3} step={0.02} decimals={2} unit={{ short: "s", spoken: "seconds" }} valueText={(v) => `${v.toFixed(2)} seconds`} onChange={setPad} help="Leaves a little quiet at each cut so words aren't clipped." />
            <div aria-live="polite" data-testid="silence-summary" className="rounded-lg border border-line bg-canvas px-3 py-2 text-sm">
              {error ? (
                <span className="text-danger">{error}</span>
              ) : !ready ? (
                <span className="text-muted">Listening for pauses…</span>
              ) : cuts.length ? (
                <>
                  <strong>
                    {cuts.length} pause{cuts.length > 1 ? "s" : ""} · {removed.toFixed(1)} s
                  </strong>{" "}
                  will be cut. New length {formatTenths(total - removed)} (was {formatTenths(total)}).
                </>
              ) : (
                <span className="text-muted">No pauses found with these settings.</span>
              )}
            </div>
            {cuts.length > 0 && <p className="text-xs text-muted">The pauses are marked in red on the timeline.</p>}
          </>
        )}
      </div>
    </Dialog>
  );
}
