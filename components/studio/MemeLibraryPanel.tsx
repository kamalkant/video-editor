"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { Icon } from "@/components/ui/Icon";
import {
  MEME_CATEGORIES,
  MEME_CATALOG,
  type MemeCategory,
  type MemeClipItem,
  queryMemes,
} from "@/lib/library/memeCatalog";
import { createDragChip, MEME_DRAG, setMemeDrag } from "@/lib/editor/mediaDrag";

type Props = {
  onInsert: (
    meme: MemeClipItem,
    options?: { overlay?: boolean; trackId?: string | null },
  ) => void;
};

export function MemeLibraryPanel({ onInsert }: Props) {
  const [category, setCategory] = useState<MemeCategory>("all");
  const [q, setQ] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Global Audio Preview: "If manually mute then mute all, if unmute then unmute all"
  const [audioPreviewEnabled, setAudioPreviewEnabled] = useState<boolean>(
    () => {
      if (typeof window !== "undefined") {
        return localStorage.getItem("VDO_meme_audio_preview") === "true";
      }
      return false;
    },
  );

  const toggleAudioPreview = () => {
    setAudioPreviewEnabled((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("VDO_meme_audio_preview", String(next));
      }
      return next;
    });
  };

  // Online / Dynamic Search clips
  const [onlineItems, setOnlineItems] = useState<MemeClipItem[]>([]);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [hasSearchedOnline, setHasSearchedOnline] = useState(false);

  // Filter local catalog
  const localMemes = useMemo(() => {
    return queryMemes(q, category);
  }, [q, category]);

  // Combined memes
  const memes = useMemo(() => {
    if (onlineItems.length > 0) {
      return [...localMemes, ...onlineItems];
    }
    return localMemes;
  }, [localMemes, onlineItems]);

  // Clip counts per category based on active search filter (or total catalog if query empty)
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cat of MEME_CATEGORIES) {
      if (cat.id === "all") {
        counts[cat.id] = q.trim()
          ? queryMemes(q, "all").length
          : MEME_CATALOG.length;
      } else {
        counts[cat.id] = q.trim()
          ? queryMemes(q, cat.id).length
          : MEME_CATALOG.filter((m) => m.category === cat.id).length;
      }
    }
    if (onlineItems.length > 0) {
      for (const item of onlineItems) {
        counts["all"] = (counts["all"] || 0) + 1;
        if (item.category && counts[item.category] !== undefined) {
          counts[item.category] = (counts[item.category] || 0) + 1;
        }
      }
    }
    return counts;
  }, [q, onlineItems]);

  // Reset online items when query or category changes
  useEffect(() => {
    setOnlineItems([]);
    setHasSearchedOnline(false);
  }, [q, category]);

  const handleSearchOnline = async () => {
    if (!q.trim() || isSearchingOnline) return;
    setIsSearchingOnline(true);
    try {
      const res = await fetch(
        `/api/library/memes/search?q=${encodeURIComponent(q.trim())}&online=1`,
      );
      if (res.ok) {
        const data = await res.json();
        const dynamicOnly = (data.items || []).filter(
          (item: MemeClipItem) => item.isDynamic,
        );
        setOnlineItems(dynamicOnly);
      }
    } catch (err) {
      console.error("Online search failed", err);
    } finally {
      setIsSearchingOnline(false);
      setHasSearchedOnline(true);
    }
  };

  const handleDragStart = (e: React.DragEvent, item: MemeClipItem) => {
    e.dataTransfer.setData(MEME_DRAG, JSON.stringify(item));
    e.dataTransfer.effectAllowed = "copy";
    setMemeDrag(item);
    createDragChip(
      item.title,
      item.dialogue ? `“${item.dialogue}”` : undefined,
    );
  };

  const handleDragEnd = () => {
    setMemeDrag(null);
  };

  const handleInsert = async (item: MemeClipItem, overlay = false) => {
    setBusyId(item.id);
    try {
      await onInsert(item, { overlay });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      data-testid="meme-library-panel"
    >
      {/* Header */}
      <div className="flex shrink-0 flex-col gap-2.5 border-b border-line p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Icon name="library" className="size-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-ink">
                Library
              </h2>
              <p className="text-[10px] text-muted">Trending Clips</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Global Audio Preview Sync Toggle */}
            <button
              type="button"
              onClick={toggleAudioPreview}
              aria-label={
                audioPreviewEnabled
                  ? "Mute hover audio for all clips"
                  : "Unmute hover audio for all clips"
              }
              title={
                audioPreviewEnabled
                  ? "Hover Audio is ON (click to mute all)"
                  : "Hover Audio is OFF (click to unmute all)"
              }
              className={`flex size-7 shrink-0 items-center justify-center rounded-md border transition-all ${
                audioPreviewEnabled
                  ? "border-amber-500/40 bg-amber-500/15 text-amber-500 dark:text-amber-400"
                  : "border-line bg-raised text-muted hover:bg-raised/80 hover:text-ink"
              }`}
            >
              <Icon
                name={audioPreviewEnabled ? "volume" : "mute"}
                className="size-3.5"
              />
            </button>

            <span
              className="flex items-center gap-1 rounded-full bg-raised px-2 py-1 text-[10px] font-semibold text-muted tabular-nums"
              title={`${memes.length} clips`}
              aria-label={`${memes.length} clips`}
            >
              <Icon name="film" className="size-3 text-muted/80" />
              <span>{memes.length}</span>
            </span>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Icon
            name="search"
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && q.trim().length >= 2) {
                void handleSearchOnline();
              }
            }}
            placeholder="Search dialogue, character, movie..."
            className="w-full rounded-md border border-line bg-raised/50 py-1.5 pl-8 pr-7 text-xs text-ink placeholder:text-muted focus:border-primary focus:bg-surface focus:outline-none"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
            >
              <Icon name="close" className="size-3" />
            </button>
          )}
        </div>

        {/* Category Filter Pills */}
        <div
          className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
        >
          {MEME_CATEGORIES.map((cat) => {
            const active = category === cat.id;
            const count = categoryCounts[cat.id] ?? 0;
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCategory(cat.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? "bg-primary font-semibold text-white shadow-sm"
                    : "bg-raised/70 text-muted hover:bg-raised hover:text-ink"
                }`}
              >
                <span>{cat.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold tabular-nums ${
                    active
                      ? "bg-white/20 text-white"
                      : "bg-surface/80 text-muted"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid of Meme Cards - Container Query for Responsive 1-col on narrow width */}
      <div className="@container flex-1 overflow-y-auto p-1">
        {/* Search Online Bar if query entered */}
        {q.trim().length >= 2 && !hasSearchedOnline && (
          <div className="mb-3 flex items-center justify-between rounded-lg border border-dashed border-primary/40 bg-primary/5 p-2 text-xs">
            <span className="text-[11px] text-ink">
              Want more clips matching &ldquo;{q.trim()}&rdquo;?
            </span>
            <button
              type="button"
              onClick={handleSearchOnline}
              disabled={isSearchingOnline}
              className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-[10px] font-bold text-white shadow hover:bg-primary/90 disabled:opacity-50"
            >
              <Icon name="search" className="size-3" />
              {isSearchingOnline ? "Searching..." : "Search Web Clips"}
            </button>
          </div>
        )}

        {memes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Icon name="search" className="mb-2 size-8 text-muted/50" />
            <p className="text-xs font-semibold text-ink">
              No local meme clips found
            </p>
            <p className="mt-1 text-[11px] text-muted">
              Try searching the web or clearing filters
            </p>
            <div className="mt-3 flex gap-2">
              {q.trim().length >= 2 && !hasSearchedOnline && (
                <button
                  type="button"
                  onClick={handleSearchOnline}
                  disabled={isSearchingOnline}
                  className="rounded bg-primary px-3 py-1 text-xs font-bold text-white hover:bg-primary/90"
                >
                  {isSearchingOnline ? "Searching..." : "Search Web Clips"}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setCategory("all");
                }}
                className="rounded border border-line bg-raised px-2.5 py-1 text-xs text-ink hover:bg-raised/80"
              >
                Reset Filters
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 @[380px]:grid-cols-2 gap-2.5">
            {memes.map((item) => {
              const isHovered = hoveredId === item.id;
              const isBusy = busyId === item.id;

              return (
                <div
                  key={item.id}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, item)}
                  onDragEnd={handleDragEnd}
                  onMouseEnter={() => setHoveredId(item.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`group relative flex cursor-grab flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-sm transition-all hover:border-primary/70 hover:shadow-md active:cursor-grabbing ${
                    isBusy ? "opacity-60 pointer-events-none" : ""
                  }`}
                >
                  {/* Media Visual / Video Preview */}
                  <div className="relative aspect-video w-full overflow-hidden bg-black/40">
                    {isHovered ? (
                      <video
                        src={item.videoUrl}
                        autoPlay
                        loop
                        muted={!audioPreviewEnabled}
                        playsInline
                        className="size-full object-cover"
                      />
                    ) : (
                      <img
                        src={item.thumbUrl}
                        alt={item.title}
                        loading="lazy"
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (!target.src.includes(".jpg")) {
                            target.src = `/library/memes/${item.id}.jpg?v=2`;
                          }
                        }}
                        className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                    )}

                    {/* Audio Preview Toggle (Mute / Unmute all) */}
                    {isHovered && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleAudioPreview();
                        }}
                        title={
                          audioPreviewEnabled
                            ? "Mute all audio previews"
                            : "Unmute all audio previews"
                        }
                        className="absolute right-1.5 top-1.5 z-20 flex size-6 items-center justify-center rounded bg-black/80 text-white shadow-md hover:bg-black hover:text-primary transition-all pointer-events-auto"
                      >
                        <Icon
                          name={audioPreviewEnabled ? "volume" : "mute"}
                          className="size-3.5"
                        />
                      </button>
                    )}

                    {/* Drag Handle Indicator */}
                    <div className="absolute left-1.5 top-1.5 z-10 flex size-5 items-center justify-center rounded bg-black/60 text-white/80 opacity-0 transition-opacity group-hover:opacity-100">
                      <Icon name="hand" className="size-3" />
                    </div>

                    {/* Default Duration Badge when not hovered */}
                    {!isHovered && (
                      <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-white backdrop-blur-sm">
                        {item.duration.toFixed(1)}s
                      </span>
                    )}

                    {/* Subtle bottom gradient on hover so buttons pop without blocking video */}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t from-black/80 via-black/30 to-transparent opacity-0 transition-opacity duration-150 group-hover:opacity-100" />

                    {/* Non-obscuring bottom pill buttons on hover (video is 100% visible) */}
                    <div className="absolute inset-x-1.5 bottom-1.5 z-10 flex items-center justify-between pointer-events-none opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                      <div className="flex items-center gap-1 pointer-events-auto">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleInsert(item, false);
                          }}
                          title="Add to Main Track"
                          className="flex items-center gap-1 rounded bg-primary/95 px-2 py-0.5 text-[10px] font-bold text-white shadow-md hover:bg-primary transition-colors"
                        >
                          <Icon name="plus" className="size-3" />
                          Track
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleInsert(item, true);
                          }}
                          title="Add as Overlay Clip (Picture-in-Picture)"
                          className="flex items-center gap-1 rounded bg-black/85 px-2 py-0.5 text-[10px] font-semibold text-white shadow-md hover:bg-black transition-colors"
                        >
                          <Icon name="layers" className="size-3" />
                          Overlay
                        </button>
                      </div>

                      <span className="rounded bg-black/80 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-white pointer-events-auto">
                        {item.duration.toFixed(1)}s
                      </span>
                    </div>
                  </div>

                  {/* Card Info */}
                  <div className="flex flex-1 flex-col justify-between p-2">
                    <div>
                      <div className="flex items-center gap-1">
                        <h3
                          className="line-clamp-1 text-[11px] font-bold text-ink"
                          title={item.title}
                        >
                          {item.title}
                        </h3>
                        {item.isDynamic && (
                          <span className="rounded bg-primary/10 px-1 py-0.2 text-[8px] font-semibold text-primary">
                            WEB
                          </span>
                        )}
                      </div>
                      {item.dialogue && (
                        <p
                          className="line-clamp-1 text-[10px] font-medium text-amber-500/90 dark:text-amber-400"
                          title={item.dialogue}
                        >
                          “{item.dialogue}”
                        </p>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-1 text-[9px] text-muted">
                      {item.actorOrShow}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="shrink-0 border-t border-line bg-raised/30 px-3 py-1.5 text-center text-[10px] text-muted">
        Tip: Drag clips straight onto the{" "}
        <span className="font-semibold text-ink">Timeline</span> or{" "}
        <span className="font-semibold text-ink">Preview</span> canvas
      </div>
    </div>
  );
}
