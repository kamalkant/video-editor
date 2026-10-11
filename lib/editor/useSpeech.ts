"use client";

import { useEffect, useState } from "react";
import { DUCK_DETECT, speakingClips, speechRanges } from "../audio/ducking";
import type { MediaLite, TimelineDoc } from "../edit/doc";
import type { Range } from "../edit/timeline";

/**
 * Where someone speaks on Video 1 (timeline seconds), for hearing the ducking
 * in the preview. Uses the same detection and maths as the export
 * (lib/audio/ducking); the pauses of each upload are asked for once.
 */
export function useSpeechRanges(doc: TimelineDoc, media: Record<string, MediaLite>, enabled: boolean): Range[] {
  const hasAudio = (id: string) => !!media[id]?.hasAudio;
  const ids = enabled ? [...new Set(speakingClips(doc, hasAudio).map((c) => c.mediaId))].sort() : [];
  const key = ids.join(",");
  const [silences, setSilences] = useState<Record<string, Range[]>>({});
  useEffect(() => {
    if (!key) return;
    let alive = true;
    for (const id of key.split(",")) {
      void fetch(`/api/videos/${id}/silences`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(DUCK_DETECT) })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { silences?: Range[] } | null) => {
          if (alive && j?.silences) setSilences((m) => (m[id] ? m : { ...m, [id]: j.silences! }));
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [key]);
  if (!enabled) return [];
  // until an upload's pauses are known, its whole clip counts as speech (like a cautious export)
  const known: Record<string, Range[] | undefined> = {};
  for (const id of ids) known[id] = silences[id];
  return speechRanges(doc, known, hasAudio);
}
