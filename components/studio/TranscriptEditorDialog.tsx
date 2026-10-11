"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import type { TimelineDoc } from "@/lib/edit/doc";
import { formatTime } from "@/lib/format";
import { subtitleTracks } from "@/lib/subtitles/sources";
import { isFillerWord } from "@/lib/subtitles/fillers";



type WordToken = {
  id: string;
  word: string;
  start: number;
  end: number;
  isFiller: boolean;
  /** the caption clip it is in, and its index among that caption's words */
  clipId: string;
  index: number;
};

export function TranscriptEditorDialog({
  open,
  onClose,
  doc,
  onCutRanges,
}: {
  open: boolean;
  onClose: () => void;
  doc: TimelineDoc;
  onCutRanges: (ranges: { start: number; end: number }[], dropWords: { clipId: string; index: number }[]) => void;
}) {
  const tracks = useMemo(() => subtitleTracks(doc), [doc]);
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<string | null>(null);

  // Extract all words with timestamps across subtitle tracks
  const tokens = useMemo(() => {
    const list: WordToken[] = [];
    for (const tr of tracks) {
      for (const cap of tr.captions) {
        const rawWords = cap.text.trim().split(/\s+/).filter(Boolean);
        const count = rawWords.length;
        if (!count) continue;
        // when each word is said: its real timing if the subtitles have it, else spread evenly
        const times = cap.wordTimes && cap.wordTimes.length === count ? cap.wordTimes : null;
        rawWords.forEach((w, i) => {
          const wStart = cap.start + (times ? times[i] : (i / count) * cap.duration);
          const wEnd = i < count - 1 ? cap.start + (times ? times[i + 1] : ((i + 1) / count) * cap.duration) : cap.start + cap.duration;
          const clean = w.replace(/[^\w\s']/g, "").trim();
          list.push({
            id: `${tr.id}-${cap.start.toFixed(2)}-${i}`,
            word: w,
            start: wStart,
            end: wEnd,
            isFiller: isFillerWord(clean),
            clipId: cap.id,
            index: i,
          });
        });
      }
    }
    return list;
  }, [tracks]);

  const fillerCount = useMemo(() => tokens.filter((t) => t.isFiller).length, [tokens]);

  const toggleWord = (id: string) => {
    setSelectedWords((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const removeFillers = () => {
    const fillers = tokens.filter((t) => t.isFiller);
    if (!fillers.length) return;
    const ranges = fillers.map((t) => ({ start: t.start, end: t.end }));
    onCutRanges(ranges, fillers.map((t) => ({ clipId: t.clipId, index: t.index })));
    setStatus(`Removed ${fillers.length} filler words from speech and timeline video.`);
  };

  const removeSelected = () => {
    const toRemove = tokens.filter((t) => selectedWords.has(t.id));
    if (!toRemove.length) return;
    const ranges = toRemove.map((t) => ({ start: t.start, end: t.end }));
    onCutRanges(ranges, toRemove.map((t) => ({ clipId: t.clipId, index: t.index })));
    setSelectedWords(new Set());
    setStatus(`Cut ${toRemove.length} words from speech and timeline video.`);
  };

  const mainClip = doc.tracks.find((t) => t.kind === "main")?.clips[0];

  return (
    <Dialog open={open} onClose={onClose} title="Edit Video by Transcript">
      <div className="flex flex-col gap-4 max-w-xl">
        <p className="text-xs text-muted">
          Delete words or remove speech hesitation like &ldquo;um&rdquo; and &ldquo;uh&rdquo; to automatically cut the corresponding video footage on the timeline.
        </p>

        {status && (
          <Notice tone="success" role="status">
            {status}
          </Notice>
        )}

        {tokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-line p-6 text-center text-xs text-muted">
            <Icon name="subtitles" className="size-6 text-muted" />
            <p>No subtitle transcript found.</p>
            <p>Generate subtitles first in the Subtitles panel or upload a video with speech on Video 1.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold">{tokens.length} words</span>
                {fillerCount > 0 && (
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-400 font-medium">
                    {fillerCount} filler {fillerCount === 1 ? "word" : "words"} detected
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {fillerCount > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary min-h-0 px-2.5 py-1 text-xs text-amber-300 hover:border-amber-400"
                    onClick={removeFillers}
                  >
                    ⚡ Remove all filler words
                  </button>
                )}
                {selectedWords.size > 0 && (
                  <button
                    type="button"
                    className="btn btn-danger min-h-0 px-2.5 py-1 text-xs"
                    onClick={removeSelected}
                  >
                    <Icon name="trash" className="size-3.5" />
                    Delete {selectedWords.size} {selectedWords.size === 1 ? "word" : "words"}
                  </button>
                )}
              </div>
            </div>

            <div className="flex max-h-72 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-line bg-surface/40 p-3 text-sm leading-relaxed">
              {tokens.map((tok) => {
                const isSelected = selectedWords.has(tok.id);
                return (
                  <button
                    key={tok.id}
                    type="button"
                    onClick={() => toggleWord(tok.id)}
                    title={`Timestamp: ${formatTime(tok.start)} - click to select for deletion`}
                    className={`rounded px-1.5 py-0.5 transition-colors ${
                      isSelected
                        ? "bg-red-500 text-white line-through"
                        : tok.isFiller
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30"
                        : "bg-surface hover:bg-primary-soft hover:text-primary"
                    }`}
                  >
                    {tok.word}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
          <button type="button" className="btn btn-secondary text-xs" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Dialog>
  );
}
