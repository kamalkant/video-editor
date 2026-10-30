"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import type { HighlightAspect, HighlightCategory, HighlightGoal, HighlightItem, HighlightsResult } from "@/lib/ai/highlights";
import { formatTime } from "@/lib/format";
import type { Segment } from "@/lib/subtitles/segments";
import type { VideoMeta } from "@/lib/videos";
import { GeminiBadge } from "./GeminiBits";
import { ensureOnServer, notOnServer } from "@/lib/media/localMedia";

const CATEGORY_TAGS: Record<HighlightCategory, { label: string; icon: string; badge: string }> = {
  hook: { label: "Viral Hook", icon: "bolt", badge: "bg-red-500/15 text-red-400 border-red-500/30" },
  insight: { label: "Key Insight", icon: "star", badge: "bg-primary/15 text-link border-primary" },
  climax: { label: "Climax", icon: "magic", badge: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  story: { label: "Story", icon: "text", badge: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  reaction: { label: "Reaction", icon: "sparkle", badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  qa: { label: "Q&A", icon: "question", badge: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
};

export function HighlightsDialog({
  open,
  onClose,
  video,
  hasAudio,
  geminiReady,
  onApplyReel,
  onInsertClip,
  onSaveAsset,
  onOpenSettings,
}: {
  open: boolean;
  onClose: () => void;
  video: VideoMeta | null;
  hasAudio: boolean;
  geminiReady: boolean;
  onApplyReel: (highlights: HighlightItem[], aspect: HighlightAspect) => void;
  onInsertClip: (highlight: HighlightItem) => void;
  onSaveAsset: (highlight: HighlightItem, aspect: HighlightAspect) => Promise<void>;
  onOpenSettings?: () => void;
}) {
  const [mode, setMode] = useState<"cards" | "transcript">("cards");
  const [goal, setGoal] = useState<HighlightGoal>("viral-shorts");
  const [aspect, setAspect] = useState<HighlightAspect>("original");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HighlightsResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");

  // Mini preview player state
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Manual transcript selection
  const [selSegIndex, setSelSegIndex] = useState<number | null>(null);

  const videoId = video?.id;

  // Fetch / extract highlights whenever dialog opens or goal changes
  useEffect(() => {
    if (!open || !videoId || !hasAudio) return;
    const ac = new AbortController();
    let isMounted = true;

    async function load() {
      setError(null);
      try {
        // (a file kept only on this computer goes to the server first: the analysis happens there)
        if (notOnServer(videoId!)) {
          setBusy("Sending the video…");
          if (!(await ensureOnServer([videoId!])).ok) throw new Error("The video couldn't be sent to the server. Check the connection and try again.");
          if (!isMounted) return;
        }
        setBusy("Analyzing speech and detecting high-impact moments…");
        const res = await fetch("/api/ai/highlights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediaId: videoId, goal }),
          signal: ac.signal,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error?.message || "Could not analyze highlights.");
        }
        const data: HighlightsResult = await res.json();
        if (!isMounted) return;
        setResult(data);
        // Default select all top highlights
        setSelectedIds(new Set(data.highlights.map((h) => h.id)));
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError((err as Error).message || "Highlight extraction failed.");
        }
      } finally {
        if (isMounted) setBusy(null);
      }
    }

    void load();
    return () => {
      isMounted = false;
      ac.abort();
    };
  }, [open, videoId, hasAudio, goal]);

  const highlights = useMemo(() => result?.highlights ?? [], [result]);
  const segments = useMemo(() => result?.segments ?? [], [result]);

  const selectedHighlights = useMemo(() => {
    return highlights.filter((h) => selectedIds.has(h.id));
  }, [highlights, selectedIds]);

  const totalDuration = useMemo(() => {
    return selectedHighlights.reduce((acc, h) => acc + h.duration, 0);
  }, [selectedHighlights]);

  // Adjust highlight timestamps ±0.5s
  const nudge = (id: string, edge: "start" | "end", delta: number) => {
    if (!result) return;
    setResult({
      ...result,
      highlights: result.highlights.map((h) => {
        if (h.id !== id) return h;
        if (edge === "start") {
          const nextStart = Math.max(0, Math.min(h.end - 1, h.start + delta));
          return {
            ...h,
            start: Math.round(nextStart * 10) / 10,
            duration: Math.round((h.end - nextStart) * 10) / 10,
          };
        } else {
          const nextEnd = Math.max(h.start + 1, h.end + delta);
          return {
            ...h,
            end: Math.round(nextEnd * 10) / 10,
            duration: Math.round((nextEnd - h.start) * 10) / 10,
          };
        }
      }),
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === highlights.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(highlights.map((h) => h.id)));
    }
  };

  // Mini preview playback bounds management
  const playHighlight = (h: HighlightItem) => {
    const v = videoRef.current;
    if (!v) return;
    if (previewingId === h.id && !v.paused) {
      v.pause();
      setPreviewingId(null);
      return;
    }
    setPreviewingId(h.id);
    v.currentTime = h.start;
    void v.play();
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !previewingId) return;
    const curH = highlights.find((h) => h.id === previewingId);
    if (!curH) return;

    const onTimeUpdate = () => {
      if (v.currentTime >= curH.end) {
        v.pause();
        v.currentTime = curH.start;
        setPreviewingId(null);
      }
    };
    v.addEventListener("timeupdate", onTimeUpdate);
    return () => v.removeEventListener("timeupdate", onTimeUpdate);
  }, [previewingId, highlights]);

  // Filtered segments for Interactive Transcript view
  const filteredSegments = useMemo(() => {
    if (!filterText.trim()) return segments;
    const q = filterText.toLowerCase();
    return segments.filter((s) => s.text.toLowerCase().includes(q));
  }, [segments, filterText]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span>Auto Highlights & Clip Extractor</span>
          <GeminiBadge />
        </div>
      }
      size="lg"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-2 text-xs text-muted">
            {selectedHighlights.length > 0 ? (
              <span>
                <strong>{selectedHighlights.length}</strong> highlight{selectedHighlights.length > 1 ? "s" : ""} selected (<strong>{formatTime(totalDuration)}</strong>)
              </span>
            ) : (
              <span>Select highlights to create reel or extract clips</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!selectedHighlights.length || !!savingId}
              onClick={async () => {
                if (!selectedHighlights[0]) return;
                const h = selectedHighlights[0];
                setSavingId(h.id);
                try {
                  await onSaveAsset(h, aspect);
                } finally {
                  setSavingId(null);
                }
              }}
              title="Save selected highlight sub-clip into My Assets library"
            >
              {savingId ? "Saving to Library…" : "Save to My Assets"}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!selectedHighlights.length}
              onClick={() => {
                onApplyReel(selectedHighlights, aspect);
                onClose();
              }}
              title="Assemble highlights as a continuous recap reel on the timeline"
            >
              Create Recap Reel ({selectedHighlights.length})
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4 max-h-[75vh] overflow-hidden">
        {/* Top Control Bar: Mode Toggle + Goal Selector + Framing Selector */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-canvas p-2">
          {/* Mode Switcher */}
          <div className="flex rounded-md border border-line bg-raised/60 p-0.5" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "cards"}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                mode === "cards" ? "bg-primary text-white shadow-sm" : "text-muted hover:text-ink"
              }`}
              onClick={() => setMode("cards")}
            >
              <Icon name="magic" className="size-3.5" />
              <span>AI Highlights ({highlights.length})</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "transcript"}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                mode === "transcript" ? "bg-primary text-white shadow-sm" : "text-muted hover:text-ink"
              }`}
              onClick={() => setMode("transcript")}
            >
              <Icon name="text" className="size-3.5" />
              <span>Transcript Editor</span>
            </button>
          </div>

          {/* Goal Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-2xs font-medium text-muted">Goal:</span>
            <select
              className="field py-1 text-xs"
              value={goal}
              onChange={(e) => setGoal(e.target.value as HighlightGoal)}
              disabled={!!busy}
            >
              <option value="viral-shorts">⚡ Viral Shorts (&lt;60s)</option>
              <option value="recap">Recap Reel (2–3 mins)</option>
              <option value="key-moments">🎯 All Key Moments</option>
            </select>
          </div>

          {/* Framing Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-2xs font-medium text-muted">Framing:</span>
            <select
              className="field py-1 text-xs"
              value={aspect}
              onChange={(e) => setAspect(e.target.value as HighlightAspect)}
            >
              <option value="original">Original (16:9)</option>
              <option value="vertical">Vertical Reel (9:16)</option>
              <option value="square">Square (1:1)</option>
            </select>
          </div>
        </div>

        {/* Video reference hidden/mini element for instant auditioning */}
        {video && (
          <video
            ref={videoRef}
            src={`/api/videos/${video.id}/source`}
            className="hidden"
            preload="metadata"
          />
        )}

        {/* Status / Notices */}
        {!hasAudio ? (
          <Notice tone="info" title="Clip has no audio">
            Automatic highlights and transcript extraction require a video clip with spoken audio or dialogue.
          </Notice>
        ) : !geminiReady ? (
          <Notice tone="info" title="Gemini AI Offline">
            Highlight extraction is running in offline test mode. Add your Gemini API key in AI Tools → Settings for live cloud extraction.
          </Notice>
        ) : null}

        {error && (
          <Notice tone="error" title="Analysis error">
            {error}
          </Notice>
        )}

        {busy && (
          <div className="flex items-center justify-center gap-3 rounded-xl border border-line bg-canvas/60 p-8 text-center">
            <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm font-medium text-muted">{busy}</span>
          </div>
        )}

        {/* MODE 1: AI HIGHLIGHT CARDS VIEW */}
        {!busy && mode === "cards" && (
          <div className="flex flex-col gap-3 overflow-y-auto pr-1">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Detected moments ranked by virality & hook potential:</span>
              <button
                type="button"
                className="text-link hover:underline font-medium"
                onClick={toggleSelectAll}
              >
                {selectedIds.size === highlights.length ? "Deselect All" : "Select All"}
              </button>
            </div>

            {highlights.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-muted">
                No highlights detected yet. Try picking a different goal above or splitting the video.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5">
                {highlights.map((h, idx) => {
                  const isSelected = selectedIds.has(h.id);
                  const isPlaying = previewingId === h.id;
                  const cat = CATEGORY_TAGS[h.category] || CATEGORY_TAGS.insight;

                  return (
                    <div
                      key={h.id}
                      className={`group relative flex flex-col gap-2 rounded-xl border p-3.5 transition-all ${
                        isSelected
                          ? "border-primary/50 bg-primary/5 shadow-sm"
                          : "border-line bg-raised/30 hover:border-line-strong hover:bg-hover/60"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        {/* Checkbox + Rank */}
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            className="size-4 rounded border-line text-primary focus:ring-primary cursor-pointer"
                            checked={isSelected}
                            onChange={() => toggleSelect(h.id)}
                            aria-label={`Select ${h.title}`}
                          />
                          <span className="flex size-5 items-center justify-center rounded-full bg-raised text-2xs font-bold text-muted">
                            {idx + 1}
                          </span>
                          <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-2xs font-semibold ${cat.badge}`}>
                            <Icon name={cat.icon as any} className="size-3" />
                            {cat.label}
                          </span>
                        </div>

                        {/* Virality score badge */}
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 border border-amber-500/20 text-amber-400 font-mono text-xs font-bold">
                            <span>🔥 {h.viralityScore}%</span>
                          </div>
                          <button
                            type="button"
                            className={`flex size-7 items-center justify-center rounded-md border text-xs transition-colors ${
                              isPlaying
                                ? "border-primary bg-primary text-white"
                                : "border-line bg-canvas hover:border-primary text-muted hover:text-ink"
                            }`}
                            onClick={() => playHighlight(h)}
                            title={isPlaying ? "Pause preview" : "Audition highlight preview"}
                          >
                            <Icon name={isPlaying ? "pause" : "play"} className="size-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Title & Quote */}
                      <div className="flex flex-col gap-1 pl-6">
                        <h4 className="text-sm font-semibold text-ink leading-snug">{h.title}</h4>
                        {h.quote && (
                          <p className="line-clamp-2 text-xs italic text-muted">
                            &ldquo;{h.quote}&rdquo;
                          </p>
                        )}
                        {h.summary && h.summary !== h.quote && (
                          <p className="line-clamp-2 text-2xs text-muted-strong">
                            {h.summary}
                          </p>
                        )}
                      </div>

                      {/* Scrubber & In/Out Fine-tuning */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2 pl-6 text-xs text-muted">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-ink font-medium">
                            {formatTime(h.start)} → {formatTime(h.end)}
                          </span>
                          <span className="rounded bg-line/60 px-1.5 py-0.5 text-2xs font-medium text-muted">
                            {h.duration.toFixed(1)}s
                          </span>
                        </div>

                        {/* Nudge Buttons */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-2xs text-muted uppercase tracking-wider font-semibold">Trim:</span>
                          <div className="flex items-center rounded border border-line bg-canvas text-2xs">
                            <button
                              type="button"
                              className="px-1.5 py-0.5 hover:bg-hover text-muted hover:text-ink"
                              onClick={() => nudge(h.id, "start", -0.5)}
                              title="Start 0.5s earlier"
                            >
                              -0.5s
                            </button>
                            <span className="border-x border-line px-1 text-2xs text-muted">Start</span>
                            <button
                              type="button"
                              className="px-1.5 py-0.5 hover:bg-hover text-muted hover:text-ink"
                              onClick={() => nudge(h.id, "start", 0.5)}
                              title="Start 0.5s later"
                            >
                              +0.5s
                            </button>
                          </div>
                          <div className="flex items-center rounded border border-line bg-canvas text-2xs">
                            <button
                              type="button"
                              className="px-1.5 py-0.5 hover:bg-hover text-muted hover:text-ink"
                              onClick={() => nudge(h.id, "end", -0.5)}
                              title="End 0.5s earlier"
                            >
                              -0.5s
                            </button>
                            <span className="border-x border-line px-1 text-2xs text-muted">End</span>
                            <button
                              type="button"
                              className="px-1.5 py-0.5 hover:bg-hover text-muted hover:text-ink"
                              onClick={() => nudge(h.id, "end", 0.5)}
                              title="End 0.5s later"
                            >
                              +0.5s
                            </button>
                          </div>

                          {/* Quick Insert Clip */}
                          <button
                            type="button"
                            className="btn btn-secondary py-0.5 px-2 text-2xs ml-1"
                            onClick={() => {
                              onInsertClip(h);
                              onClose();
                            }}
                            title="Insert this single highlight directly at playhead"
                          >
                            + Insert Clip
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* MODE 2: INTERACTIVE TRANSCRIPT TEXT EDITOR VIEW */}
        {!busy && mode === "transcript" && (
          <div className="flex flex-col gap-3 overflow-hidden">
            {/* Search Filter */}
            <div className="relative">
              <Icon name="search" className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
              <input
                type="search"
                className="field w-full pl-8 py-1.5 text-xs"
                placeholder="Search transcript words (e.g. secret, mistake, result)..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
              />
            </div>

            {/* Transcript Sentence List */}
            <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[46vh] rounded-lg border border-line bg-canvas/40 p-2.5">
              {filteredSegments.length === 0 ? (
                <p className="p-4 text-center text-xs text-muted">No matching spoken lines found.</p>
              ) : (
                filteredSegments.map((s, idx) => {
                  const isSelected = selSegIndex === idx;
                  return (
                    <div
                      key={`${s.start}-${idx}`}
                      className={`group flex items-start gap-3 rounded-md p-2 transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-primary/20 border border-primary/40 text-ink"
                          : "hover:bg-hover/70 border border-transparent"
                      }`}
                      onClick={() => {
                        setSelSegIndex(idx);
                        if (videoRef.current) {
                          videoRef.current.currentTime = s.start;
                          void videoRef.current.play();
                        }
                      }}
                    >
                      <span className="font-mono text-2xs text-muted shrink-0 mt-0.5 select-none">
                        {formatTime(s.start)}
                      </span>
                      <p className="text-xs text-ink flex-1 leading-relaxed">{s.text}</p>
                      {isSelected && (
                        <button
                          type="button"
                          className="btn btn-primary py-0.5 px-2 text-2xs shrink-0 self-center"
                          onClick={(e) => {
                            e.stopPropagation();
                            onInsertClip({
                              id: `custom-clip-${Date.now().toString(36)}`,
                              title: s.text.slice(0, 40),
                              start: s.start,
                              end: s.end,
                              duration: Math.round((s.end - s.start) * 10) / 10,
                              viralityScore: 85,
                              category: "insight",
                              summary: s.text,
                              quote: s.text,
                              energyLevel: "medium",
                            });
                            onClose();
                          }}
                        >
                          + Extract as Clip
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            <p className="text-2xs text-muted">
              Click any sentence to audition and extract it as a timeline clip.
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
