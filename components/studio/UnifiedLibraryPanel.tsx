"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Skeleton, SkeletonGrid } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import { VoiceSearchMic } from "@/components/ui/VoiceSearchMic";
import { formatTime } from "@/lib/format";
import type { VideoMeta } from "@/lib/videos";
import {
  MEME_CATEGORIES,
  type MemeCategory,
  type MemeClipItem,
  queryMemes,
} from "@/lib/library/memeCatalog";
import { createDragChip, MEME_DRAG, setMemeDrag } from "@/lib/editor/mediaDrag";
import type { LibraryItem as AudioLibraryItem } from "@/lib/library";
import { openAiSettings } from "@/lib/editor/useGemini";

export type LibraryCategory = "all" | "videos" | "memes" | "photos" | "audio";


interface StockItem {
  id: string;
  source: "pexels" | "pixabay" | "curated";
  title: string;
  thumb: string;
  videoUrl?: string;
  duration: number;
  width?: number;
  height?: number;
  author?: string;
  pageUrl?: string;
}

interface StockPhotoItem {
  id: string;
  title: string;
  thumbUrl: string;
  previewUrl: string;
  downloadUrl: string;
  width: number;
  height: number;
  author: string;
  authorUrl?: string;
  source: "pixabay" | "curated";
}

type Props = {
  onInsertVideo: (video: VideoMeta, add: boolean) => void;
  onInsertMeme: (
    meme: MemeClipItem,
    options?: { overlay?: boolean; trackId?: string | null },
  ) => void;
  onInsertAudio?: (meta: VideoMeta) => void;
  projectShape?: "landscape" | "portrait" | "any";
};

export function UnifiedLibraryPanel({
  onInsertVideo,
  onInsertMeme,
  onInsertAudio,
  projectShape = "any",
}: Props) {
  const [activeCategory, setActiveCategory] = useState<LibraryCategory>("all");
  const [q, setQ] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const gridCls = "grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2";

  // Remote Stock Search state
  const [stockVideos, setStockVideos] = useState<StockItem[]>([]);
  // the server has no Pexels / Pixabay key: STOCK VIDEOS shows the built-in loops, and says how to get more
  const [stockNeedsKey, setStockNeedsKey] = useState(false);
  const [stockPhotos, setStockPhotos] = useState<StockPhotoItem[]>([]);
  const [isSearchingStock, setIsSearchingStock] = useState(false);
  const [isSearchingPhotos, setIsSearchingPhotos] = useState(false);

  // Online memes (yt-dlp search on the server)
  const [onlineMemes, setOnlineMemes] = useState<MemeClipItem[]>([]);
  // why a search source found nothing (no API key on the server, the downloader blocked…): shown, not swallowed
  const [searchNotes, setSearchNotes] = useState<{ memes?: string | null }>({});
  const [isSearchingOnlineMemes, setIsSearchingOnlineMemes] = useState(false);

  // Audio Library state
  const [audioItems, setAudioItems] = useState<AudioLibraryItem[]>([]);
  const [audioLoading, setAudioLoading] = useState(true);
  const [audioBusyId, setAudioBusyId] = useState<string | null>(null);

  // MP3 / Audio preview volume controls
  const [audioVolume, setAudioVolume] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("VDO_library_audio_vol");
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed)) return Math.max(0, Math.min(1, parsed));
      }
    }
    return 0.8;
  });
  const [audioMuted, setAudioMuted] = useState<boolean>(false);

  // Hover Audio Preview: Sync mute/unmute across all hover video previews
  const [audioPreviewEnabled, setAudioPreviewEnabled] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("VDO_meme_audio_preview") === "true";
    }
    return false;
  });

  const toggleAudioPreview = () => {
    setAudioPreviewEnabled((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("VDO_meme_audio_preview", String(next));
      }
      return next;
    });
  };

  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Sync audio volume to audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = audioMuted ? 0 : audioVolume;
    }
    if (typeof window !== "undefined") {
      localStorage.setItem("VDO_library_audio_vol", String(audioVolume));
    }
  }, [audioVolume, audioMuted]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  // Meme category filter (when memes tab or all tab is active)
  const [memeSubCat, setMemeSubCat] = useState<MemeCategory>("all");

  // Filter local memes
  const filteredMemes = useMemo(() => {
    return queryMemes(q, memeSubCat);
  }, [q, memeSubCat]);

  // Load audio assets from /api/library
  useEffect(() => {
    let unmounted = false;
    fetch("/api/library", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!unmounted && data?.items) {
          setAudioItems(data.items);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!unmounted) setAudioLoading(false);
      });
    return () => {
      unmounted = true;
    };
  }, []);

  // Search stock videos whenever query or category changes
  useEffect(() => {
    if (activeCategory === "audio" || activeCategory === "photos") {
      setStockVideos([]);
      setIsSearchingStock(false);
      return;
    }

    // (a newer search cancels the older one: a slow answer never replaces newer results)
    const ctl = new AbortController();
    setIsSearchingStock(true);
    const timer = setTimeout(async () => {
      try {
        const u = new URLSearchParams({
          q: q.trim(),
          category: "All",
          provider: "all",
          aspectRatio: projectShape === "portrait" ? "9:16" : projectShape === "landscape" ? "16:9" : "all",
        });
        const res = await fetch(`/api/stock/search?${u}`, { signal: ctl.signal });
        if (res.ok) {
          const data = await res.json();
          if (ctl.signal.aborted) return;
          setStockNeedsKey(!!data?.needsKey);
          if (data?.items) {
            const mapped: StockItem[] = data.items
              .filter((it: any) => it.provider !== "curated" && it.source !== "curated")
              .map((it: any) => ({
              id: it.id,
              source: it.provider || "pexels",
              title: it.title,
              thumb: it.thumbUrl || it.previewUrl,
              videoUrl: it.videoUrl || undefined,
              duration: it.duration || 10,
              width: it.width,
              height: it.height,
              author: it.author,
              pageUrl: it.previewUrl,
            }));
            setStockVideos(mapped);
          }
        }
      } catch {
        // Fallback gracefully
      } finally {
        if (!ctl.signal.aborted) setIsSearchingStock(false);
      }
    }, 300);

    return () => {
      ctl.abort();
      clearTimeout(timer);
    };
  }, [q, activeCategory, projectShape]);

  // Search stock photos whenever query or category changes
  useEffect(() => {
    if (activeCategory !== "photos" && activeCategory !== "all") {
      setStockPhotos([]);
      setIsSearchingPhotos(false);
      return;
    }

    const ctl = new AbortController();
    setIsSearchingPhotos(true);
    const timer = setTimeout(async () => {
      try {
        const u = new URLSearchParams();
        if (q.trim()) u.set("q", q.trim());
        const res = await fetch(`/api/stock/photos?${u}`, { signal: ctl.signal });
        if (res.ok) {
          const data = await res.json();
          if (!ctl.signal.aborted && data?.items) {
            setStockPhotos(data.items);
          }
        }
      } catch {
        // Fallback gracefully
      } finally {
        if (!ctl.signal.aborted) setIsSearchingPhotos(false);
      }
    }, 300);

    return () => {
      ctl.abort();
      clearTimeout(timer);
    };
  }, [q, activeCategory]);

  // Search online dynamic memes when searching in memes or all
  useEffect(() => {
    const query = q.trim();
    if (!query || (activeCategory !== "memes" && activeCategory !== "all")) {
      setOnlineMemes([]);
      setIsSearchingOnlineMemes(false);
      return;
    }

    let cancelled = false;
    const ctl = new AbortController();
    setIsSearchingOnlineMemes(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/library/memes/search?q=${encodeURIComponent(query)}&online=1`, { signal: ctl.signal });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && Array.isArray(data?.items)) {
            const dynamicItems = data.items.filter((item: MemeClipItem) => item.isDynamic);
            setOnlineMemes(dynamicItems);
            setSearchNotes((n) => ({ ...n, memes: dynamicItems.length ? null : (data.onlineError ?? null) }));
          }
        }
      } catch {
        // Fallback
      } finally {
        if (!cancelled) setIsSearchingOnlineMemes(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      ctl.abort();
      clearTimeout(timer);
    };
  }, [q, activeCategory]);

  // Import stock video directly to timeline
  const handleImportStock = async (item: StockItem) => {
    setBusyId(item.id);
    setProgressMsg("Adding video…");
    try {
      if (item.source === "curated") {
        const res = await fetch("/api/library/memes/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: item.id,
            title: item.title,
            duration: item.duration,
          }),
        });
        const meta = await res.json();
        if (res.ok && meta?.id) {
          onInsertVideo(meta, true);
          return;
        }
        throw new Error(meta?.error ?? "Failed to import curated video.");
      }

      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: item.source === "pixabay" ? "pixabay" : "pexels",
          id: item.id.replace(/^(pexels|pixabay)-/, ""),
        }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 800));
          const check = await fetch(`/api/import/jobs/${data.id}`, { cache: "no-store" });
          const job = await check.json().catch(() => null);
          if (job?.state === "ready" && job.media) {
            onInsertVideo(job.media, true);
            break;
          }
          if (job?.state === "failed") {
            throw new Error(job.error ?? "Failed to import stock video.");
          }
        }
      }
    } catch (err) {
      console.error("Failed to import stock video:", err);
    } finally {
      setBusyId(null);
      setProgressMsg(null);
    }
  };

  // Import photo directly to timeline as image clip
  const handleImportPhoto = async (photo: StockPhotoItem) => {
    setBusyId(photo.id);
    setProgressMsg("Adding photo…");
    try {
      const res = await fetch("/api/stock/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: photo.downloadUrl || photo.previewUrl,
          title: photo.title,
          source: photo.source,
        }),
      });
      const data = await res.json();
      if (res.ok && data?.media) {
        onInsertVideo(data.media, true);
      }
    } catch {
      // Ignore
    } finally {
      setBusyId(null);
      setProgressMsg(null);
    }
  };

  // Meme insert helper with progress
  const handleInsertMemeItem = async (meme: MemeClipItem) => {
    setBusyId(meme.id);
    setProgressMsg("Adding meme to timeline…");
    try {
      await onInsertMeme(meme);
    } catch {
      // Ignore
    } finally {
      setBusyId(null);
      setProgressMsg(null);
    }
  };

  // Audio Play/Pause preview: plays real sound through /api/library/[id]/audio
  const handleToggleAudio = (it: AudioLibraryItem) => {
    if (playingAudioId === it.id) {
      audioRef.current?.pause();
      setPlayingAudioId(null);
    } else {
      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.onended = () => setPlayingAudioId(null);
      }
      audioRef.current.src = `/api/library/${it.id}/audio`;
      audioRef.current.volume = audioMuted ? 0 : audioVolume;
      audioRef.current.play().catch(() => setPlayingAudioId(null));
      setPlayingAudioId(it.id);
    }
  };

  // Audio Insert to timeline: uses /api/library/[id]/add to copy asset
  const handleInsertAudio = async (it: AudioLibraryItem) => {
    setAudioBusyId(it.id);
    try {
      const res = await fetch(`/api/library/${it.id}/add`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data) {
        onInsertAudio?.(data as VideoMeta);
      }
    } catch {
      const meta: VideoMeta = {
        id: it.id,
        kind: "audio",
        fileName: `${it.title}.mp3`,
        info: {
          container: "mp3",
          videoCodec: "none",
          audioCodec: "mp3",
          duration: it.duration,
          width: 0,
          height: 0,
          fps: 0,
          hasAudio: true,
          soundDetected: true,
          colorTransfer: "bt709",
        },
        createdAt: Date.now(),
        suggestedKey: null,
        keyKind: null,
      };
      onInsertAudio?.(meta);
    } finally {
      setAudioBusyId(null);
    }
  };

  const CATEGORIES: { id: LibraryCategory; label: string; icon: IconName }[] = [
    { id: "all", label: "All", icon: "search" },
    { id: "videos", label: "Videos", icon: "film" },
    { id: "memes", label: "Memes", icon: "sparkles" },
    { id: "photos", label: "Photos", icon: "camera" },
    { id: "audio", label: "Audio", icon: "audio" },
  ];

  // a search is on its way for the sources this tab shows (the box shows a spinner, the sections skeletons)
  const searching =
    (activeCategory !== "audio" && activeCategory !== "photos" && activeCategory !== "memes" && isSearchingStock) ||
    ((activeCategory === "all" || activeCategory === "photos") && isSearchingPhotos) ||
    ((activeCategory === "all" || activeCategory === "memes") && isSearchingOnlineMemes);

  return (
    <div className="flex flex-1 flex-col overflow-hidden text-xs">
      {/* Search Input Bar & Top Controls */}
      <div className="border-b border-line p-2.5 space-y-2 bg-surface">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 flex items-center">
            {searching ? (
              <Spinner size="sm" className="absolute left-2.5 text-primary pointer-events-none" />
            ) : (
              <Icon name="search" className="absolute left-2.5 size-4 text-muted pointer-events-none" />
            )}
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search stock videos, photos, memes, audio…"
              aria-label="Search the library"
              aria-busy={searching}
              data-testid="library-search"
              className="w-full rounded-lg border border-line bg-raised/40 pl-8 pr-14 py-1.5 text-xs text-ink placeholder:text-muted focus:border-primary focus:outline-none transition-colors [&::-webkit-search-cancel-button]:hidden"
            />
            <div className="absolute right-2 flex items-center gap-1">
              {q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  className="text-muted hover:text-ink px-1 cursor-pointer"
                  title="Clear search"
                >
                  ✕
                </button>
              )}
              <VoiceSearchMic
                size="xs"
                onTranscript={(transcript) => setQ(transcript)}
              />
            </div>
          </div>


          {/* Volume On/Off Hover Preview Toggle (Icon Only) */}
          <button
            type="button"
            onClick={toggleAudioPreview}
            aria-label={audioPreviewEnabled ? "Mute hover audio previews" : "Unmute hover audio previews"}
            title={
              audioPreviewEnabled
                ? "Hover Sound is ON (click to mute all)"
                : "Hover Sound is OFF (click to unmute all)"
            }
            className={`flex size-8 shrink-0 items-center justify-center rounded-lg border transition-all select-none cursor-pointer ${
              audioPreviewEnabled
                ? "border-amber-500/50 bg-amber-500/15 text-amber-500 shadow-xs"
                : "border-line bg-raised/50 text-muted hover:bg-raised hover:text-ink"
            }`}
          >
            <Icon name={audioPreviewEnabled ? "volume" : "mute"} className="size-4" />
          </button>
        </div>
        <span className="sr-only" role="status" aria-live="polite">
          {searching ? "Searching…" : ""}
        </span>

        {/* Category Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar">
          {CATEGORIES.map((cat) => {
            const active = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? "bg-primary text-white shadow-xs"
                    : "bg-raised/60 text-muted hover:bg-raised hover:text-ink"
                }`}
              >
                <Icon name={cat.icon} className="size-3" />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Sub-categories for Memes: One Line and Horizontal Scroll */}
        {activeCategory === "memes" && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            {MEME_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setMemeSubCat(cat.id)}
                className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  memeSubCat === cat.id
                    ? "bg-zinc-800 text-white font-semibold shadow-xs"
                    : "bg-raised/60 text-muted hover:bg-raised hover:text-ink"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Progress / Status banner */}
      {progressMsg && (
        <div className="bg-primary/10 border-b border-primary/20 px-3 py-1.5 text-[11px] text-primary flex items-center gap-2 shrink-0">
          <Spinner size="xs" />
          <span>{progressMsg}</span>
        </div>
      )}

      {/* Main Results Scroll Area */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-4">
        {/* why a search source found nothing: a missing API key, the meme downloader refused… */}
        {q.trim() && (searchNotes.memes || (stockNeedsKey && activeCategory !== "memes")) && (
          <div className="rounded-lg border border-warn-line bg-warn-soft px-2.5 py-2 text-[11px] leading-snug text-ink" role="status" data-testid="library-search-notes">
            <p className="font-semibold">Some sources can't search yet</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {stockNeedsKey && activeCategory !== "memes" && <li>Stock videos (Pixabay / Pexels): add a free Pixabay or Pexels API key.</li>}
              {searchNotes.memes && <li>Online memes: {searchNotes.memes}</li>}
            </ul>
            <button type="button" className="mt-1.5 text-[11px] font-semibold text-primary underline" onClick={openAiSettings}>
              Open API keys
            </button>
          </div>
        )}
        {/* 1. Stock Videos (Pexels / Pixabay) */}
        {(activeCategory === "all" || activeCategory === "videos") && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-muted text-[11px] font-semibold px-1">
              <span>STOCK VIDEOS {stockVideos.length > 0 && `(${stockVideos.length})`}</span>
              <span className="text-[10px] text-muted/80">Hover to play</span>
            </div>
            {isSearchingStock && stockVideos.length === 0 ? (
              <SkeletonGrid n={6} className="grid-cols-[repeat(auto-fill,minmax(110px,1fr))]" />
            ) : stockVideos.length === 0 ? (
              activeCategory === "videos" ? (
                <div className="py-6 text-center text-muted text-[11px]">
                  Type in the search bar above to find free stock videos.
                </div>
              ) : null
            ) : (
              <div className={gridCls}>
                {stockVideos.map((it) => {
                  const stockMeme: MemeClipItem = {
                    id: it.id,
                    title: it.title,
                    dialogue: it.title,
                    category: "comedy",
                    duration: it.duration || 10,
                    thumbUrl: it.thumb,
                    videoUrl: it.videoUrl || "",
                    actorOrShow: it.author || "Stock Video",
                    tags: ["stock", "video"],
                    width: it.width || 1920,
                    height: it.height || 1080,
                    isDynamic: it.source !== "curated",
                  };
                  return (
                    <div
                      key={it.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(MEME_DRAG, JSON.stringify(stockMeme));
                        e.dataTransfer.setData("text/plain", it.title);
                        e.dataTransfer.effectAllowed = "copy";
                        setMemeDrag(stockMeme);
                        const chip = createDragChip(it.title, it.thumb);
                        if (chip) e.dataTransfer.setDragImage(chip, 16, 20);
                      }}
                      onDragEnd={() => setMemeDrag(null)}
                      className="group relative flex flex-col overflow-hidden rounded-lg border border-line bg-surface hover:border-primary/50 transition-all cursor-grab active:cursor-grabbing shadow-xs select-none"
                      onMouseEnter={() => setHoveredId(it.id)}
                      onMouseLeave={() => setHoveredId(null)}
                    >
                      <div className="relative aspect-video w-full bg-black/40 overflow-hidden pointer-events-none">
                        <img
                          src={it.thumb}
                          alt={it.title}
                          className="size-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none select-none"
                          loading="lazy"
                          draggable={false}
                        />
                        {hoveredId === it.id && it.videoUrl && (
                          <video
                            ref={(el) => {
                              if (el) {
                                el.currentTime = 0;
                                el.muted = true;
                                const p = el.play();
                                if (p !== undefined) {
                                  p.catch(() => {});
                                }
                              }
                            }}
                            src={it.videoUrl}
                            autoPlay
                            loop
                            muted
                            playsInline
                            preload="auto"
                            draggable={false}
                            className="absolute inset-0 size-full object-cover z-0 pointer-events-none select-none"
                          />
                        )}
                        <span className="absolute bottom-1.5 left-1.5 z-20 rounded bg-black/75 px-1 py-0.5 text-[9px] tabular-nums text-white shadow-xs pointer-events-none select-none">
                          {formatTime(it.duration)}
                        </span>
                        <span className="absolute top-1.5 left-1.5 z-20 rounded bg-black/60 px-1 text-[8px] uppercase tracking-wider text-white/90 pointer-events-none select-none">
                          {it.source}
                        </span>

                        {/* Small plus button bottom right - no dark overlay */}
                        <button
                          type="button"
                          disabled={busyId === it.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleImportStock(it);
                          }}
                          className="pointer-events-auto absolute bottom-1.5 right-1.5 z-30 flex size-5 items-center justify-center rounded-full bg-primary text-white hover:scale-110 active:scale-95 transition-transform shadow-md cursor-pointer disabled:opacity-50"
                          title="Add to timeline"
                        >
                          {busyId === it.id ? (
                            <span className="size-2 rounded-full border border-white border-t-transparent animate-spin" />
                          ) : (
                            <Icon name="plus" className="size-2.5" />
                          )}
                        </button>
                      </div>

                      <div className="p-1.5 truncate text-[11px] font-medium text-ink pointer-events-none select-none">
                        {it.title}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 2. Memes & Viral Overlays */}
        {(activeCategory === "all" || activeCategory === "memes") && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-muted text-[11px] font-semibold px-1">
              <span>MEMES & OVERLAYS ({filteredMemes.length + onlineMemes.length})</span>
            </div>

            {filteredMemes.length === 0 && (
              <div className="rounded-lg border border-dashed border-line p-4 text-center space-y-1 text-muted my-2">
                <div className="text-xs font-semibold text-ink">
                  {q.trim() ? `No local memes match "${q.trim()}"` : "No memes found"}
                </div>
                <div className="text-[11px] text-muted">
                  {onlineMemes.length > 0 ? "Found online meme clips below:" : isSearchingOnlineMemes ? "Searching online memes…" : "Try searching another meme dialogue or keyword."}
                </div>
              </div>
            )}

            <div className={gridCls}>
              {filteredMemes.map((m) => (
                <div
                  key={m.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(MEME_DRAG, JSON.stringify(m));
                    e.dataTransfer.setData("text/plain", m.title);
                    e.dataTransfer.effectAllowed = "copy";
                    setMemeDrag(m);
                    const chip = createDragChip(m.title, m.thumbUrl);
                    if (chip) e.dataTransfer.setDragImage(chip, 16, 20);
                  }}
                  onDragEnd={() => setMemeDrag(null)}
                  className="group relative flex flex-col overflow-hidden rounded-lg border border-line bg-surface hover:border-primary/50 transition-all cursor-grab active:cursor-grabbing shadow-xs select-none"
                  onMouseEnter={() => setHoveredId(m.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {/* Clean container without graying/fade overlay on hover */}
                  <div className="relative aspect-video w-full bg-black/40 overflow-hidden pointer-events-none">
                    <img
                      src={m.thumbUrl}
                      alt={m.title}
                      className="size-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none select-none"
                      loading="lazy"
                      draggable={false}
                    />
                    {hoveredId === m.id && m.videoUrl && (
                      <video
                        ref={(el) => {
                          if (el) {
                            el.currentTime = 0;
                            el.muted = !audioPreviewEnabled;
                            const p = el.play();
                            if (p !== undefined) {
                              p.catch(() => {
                                el.muted = true;
                                el.play().catch(() => {});
                              });
                            }
                          }
                        }}
                        src={m.videoUrl}
                        autoPlay
                        loop
                        muted={!audioPreviewEnabled}
                        playsInline
                        preload="auto"
                        draggable={false}
                        className="absolute inset-0 size-full object-cover z-0 pointer-events-none select-none"
                      />
                    )}

                    {/* Duration badge: bottom left */}
                    <span className="absolute bottom-1.5 left-1.5 z-20 rounded bg-black/75 px-1 py-0.5 text-[9px] tabular-nums text-white shadow-xs pointer-events-none select-none">
                      {formatTime(m.duration)}
                    </span>

                    {/* Plus button: small, bottom right corner - no volume button, no graying overlay */}
                    <button
                      type="button"
                      disabled={busyId === m.id || busyId === ("dyn_" + m.id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleInsertMemeItem(m);
                      }}
                      className="pointer-events-auto absolute bottom-1.5 right-1.5 z-30 flex size-5 items-center justify-center rounded-full bg-primary text-white hover:scale-110 active:scale-95 transition-transform shadow-md cursor-pointer disabled:opacity-50"
                      title="Add to timeline"
                    >
                      {busyId === m.id || busyId === ("dyn_" + m.id) ? (
                        <span className="size-2 rounded-full border border-white border-t-transparent animate-spin" />
                      ) : (
                        <Icon name="plus" className="size-2.5" />
                      )}
                    </button>
                  </div>

                  <div className="p-1.5 truncate text-[11px] font-medium text-ink pointer-events-none select-none" title={m.title}>
                    {m.title}
                  </div>
                </div>
              ))}
            </div>

            {/* Searchable Online Memes (dynamic search clips) */}
            {isSearchingOnlineMemes && onlineMemes.length === 0 && (
              <div className="space-y-1.5 pt-2" data-testid="online-memes-loading">
                <div className="flex items-center gap-1.5 text-muted text-[11px] font-semibold px-1">
                  <Spinner size="xs" /> SEARCHING ONLINE MEMES…
                </div>
                <SkeletonGrid n={6} className="grid-cols-[repeat(auto-fill,minmax(110px,1fr))]" />
              </div>
            )}
            {onlineMemes.length > 0 && (
              <div className="space-y-1.5 pt-2">
                <div className="flex items-center justify-between text-muted text-[11px] font-semibold px-1">
                  <span>SEARCHABLE ONLINE MEMES ({onlineMemes.length})</span>
                </div>
                <div className={gridCls}>
                  {onlineMemes.map((m) => (
                    <div
                      key={m.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(MEME_DRAG, JSON.stringify(m));
                        e.dataTransfer.setData("text/plain", m.title);
                        e.dataTransfer.effectAllowed = "copy";
                        setMemeDrag(m);
                        const chip = createDragChip(m.title, m.thumbUrl);
                        if (chip) e.dataTransfer.setDragImage(chip, 16, 20);
                      }}
                      onDragEnd={() => setMemeDrag(null)}
                      className="group relative flex flex-col overflow-hidden rounded-lg border border-line bg-surface hover:border-primary/50 transition-all cursor-grab active:cursor-grabbing shadow-xs select-none"
                      onMouseEnter={() => setHoveredId(m.id)}
                      onMouseLeave={() => setHoveredId(null)}
                    >
                      <div className="relative aspect-video w-full bg-black/40 overflow-hidden pointer-events-none">
                        <img
                          src={m.thumbUrl}
                          alt={m.title}
                          className="size-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none select-none"
                          loading="lazy"
                          draggable={false}
                        />
                        {hoveredId === m.id && m.videoUrl && (
                          <video
                            ref={(el) => {
                              if (el) {
                                el.currentTime = 0;
                                el.muted = !audioPreviewEnabled;
                                const p = el.play();
                                if (p !== undefined) {
                                  p.catch(() => {
                                    el.muted = true;
                                    el.play().catch(() => {});
                                  });
                                }
                              }
                            }}
                            src={m.videoUrl}
                            autoPlay
                            loop
                            muted={!audioPreviewEnabled}
                            playsInline
                            preload="auto"
                            draggable={false}
                            className="absolute inset-0 size-full object-cover z-0 pointer-events-none select-none"
                          />
                        )}

                        <span className="absolute bottom-1.5 left-1.5 z-20 rounded bg-black/75 px-1 py-0.5 text-[9px] tabular-nums text-white shadow-xs pointer-events-none select-none">
                          {formatTime(m.duration)}
                        </span>

                        <button
                          type="button"
                          disabled={busyId === m.id || (m.id.startsWith("dyn_") && busyId === m.id.replace("dyn_", "")) || busyId === ("dyn_" + m.id)}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleInsertMemeItem(m);
                          }}
                          className="pointer-events-auto absolute bottom-1.5 right-1.5 z-30 flex size-5 items-center justify-center rounded-full bg-primary text-white hover:scale-110 active:scale-95 transition-transform shadow-md cursor-pointer disabled:opacity-50"
                          title="Add to timeline"
                        >
                          {busyId === m.id || (m.id.startsWith("dyn_") && busyId === m.id.replace("dyn_", "")) || busyId === ("dyn_" + m.id) ? (
                            <span className="size-2 rounded-full border border-white border-t-transparent animate-spin" />
                          ) : (
                            <Icon name="plus" className="size-2.5" />
                          )}
                        </button>
                      </div>

                      <div className="p-1.5 truncate text-[11px] font-medium text-ink pointer-events-none select-none" title={m.title}>
                        {m.title}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. Photos & Backgrounds */}
        {(activeCategory === "all" || activeCategory === "photos") && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-muted text-[11px] font-semibold px-1">
              <span>PHOTOS & BACKGROUNDS {stockPhotos.length > 0 && `(${stockPhotos.length})`}</span>
              <span className="text-[10px] text-muted/80">Pixabay</span>
            </div>

            {isSearchingPhotos && stockPhotos.length === 0 ? (
              <SkeletonGrid n={6} className="grid-cols-[repeat(auto-fill,minmax(110px,1fr))]" />
            ) : stockPhotos.length === 0 ? (
              activeCategory === "photos" ? (
                <div className="py-6 text-center text-muted text-[11px]">
                  No stock photos found. Try a different search.
                </div>
              ) : null
            ) : (
              <div className={gridCls}>
                {stockPhotos.map((p) => (
                  <div
                    key={p.id}
                    className="group relative flex flex-col overflow-hidden rounded-lg border border-line bg-surface hover:border-primary/50 transition-all shadow-xs"
                  >
                    <div className="relative aspect-video w-full bg-black/40 overflow-hidden">
                      <img
                        src={p.thumbUrl}
                        alt={p.title}
                        className="size-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                      <span className="absolute bottom-1.5 left-1.5 z-20 rounded bg-black/75 px-1 py-0.5 text-[9px] tabular-nums text-white font-medium shadow-xs">
                        PHOTO
                      </span>
                      <span className="absolute top-1.5 left-1.5 z-20 rounded bg-black/60 px-1 text-[8px] uppercase tracking-wider text-white/90">
                        {p.source}
                      </span>

                      {/* Small plus button bottom right - no dark overlay */}
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleImportPhoto(p);
                        }}
                        className="pointer-events-auto absolute bottom-1.5 right-1.5 z-30 flex size-5.5 items-center justify-center rounded-full bg-primary text-white hover:scale-110 transition-transform shadow-md cursor-pointer disabled:opacity-50"
                        title="Add photo to timeline"
                      >
                        {busyId === p.id ? <Spinner size="xs" /> : <Icon name="plus" className="size-3" />}
                      </button>
                    </div>

                    <div className="p-1.5 truncate text-[11px] font-medium text-ink" title={p.title}>
                      {p.title}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 4. Audio & Music Tracks */}
        {(activeCategory === "all" || activeCategory === "audio") && audioLoading && audioItems.length === 0 && (
          <div className="space-y-1.5" aria-busy="true" data-testid="library-audio-loading">
            <div className="text-muted text-[11px] font-semibold px-1">AUDIO & MUSIC</div>
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-line bg-surface p-2">
                <Skeleton className="size-6 shrink-0 rounded-full" />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <Skeleton className="h-2.5 w-2/3" />
                  <Skeleton className="h-2 w-1/3" />
                </span>
              </div>
            ))}
          </div>
        )}
        {(activeCategory === "all" || activeCategory === "audio") && audioItems.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-muted text-[11px] font-semibold px-1">
              <span>AUDIO & MUSIC ({audioItems.length})</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setAudioMuted(!audioMuted)}
                  className="flex items-center gap-1 text-[10px] text-muted hover:text-ink transition-colors cursor-pointer"
                  title={audioMuted ? "Audio previews are muted (click to unmute)" : "Audio previews are unmuted (click to mute)"}
                >
                  <Icon name={audioMuted ? "mute" : "volume"} className="size-3" />
                  <span className={audioMuted ? "text-danger font-semibold" : "text-ink font-medium"}>
                    {audioMuted ? "Muted" : `${Math.round(audioVolume * 100)}%`}
                  </span>
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={audioMuted ? 0 : audioVolume}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setAudioVolume(val);
                    if (audioMuted && val > 0) setAudioMuted(false);
                  }}
                  className="w-14 h-1.5 accent-primary cursor-pointer rounded bg-raised"
                  title={`Preview volume: ${Math.round((audioMuted ? 0 : audioVolume) * 100)}%`}
                />
              </div>
            </div>

            {/* Currently Playing Track Active Bar with Volume Controls */}
            {playingAudioId && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/10 p-2 shadow-xs mb-1">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      audioRef.current?.pause();
                      setPlayingAudioId(null);
                    }}
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-white hover:scale-105 transition-transform"
                    title="Pause"
                  >
                    <Icon name="pause" className="size-3" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold text-ink truncate">
                      {audioItems.find((a) => a.id === playingAudioId)?.title || "Playing Preview"}
                    </div>
                    <div className="text-[10px] text-primary flex items-center gap-1">
                      <span className="inline-block size-1.5 rounded-full bg-primary animate-pulse" />
                      Playing Preview
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setAudioMuted(!audioMuted)}
                    className="text-muted hover:text-ink cursor-pointer"
                  >
                    <Icon name={audioMuted ? "mute" : "volume"} className="size-3" />
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={audioMuted ? 0 : audioVolume}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setAudioVolume(val);
                      if (audioMuted && val > 0) setAudioMuted(false);
                    }}
                    className="w-12 h-1.5 accent-primary cursor-pointer"
                  />
                  <span className="text-[10px] tabular-nums text-muted w-6 text-right">
                    {Math.round((audioMuted ? 0 : audioVolume) * 100)}%
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-1">
              {audioItems.slice(0, activeCategory === "audio" ? undefined : 6).map((it) => (
                <div
                  key={it.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface p-2 hover:bg-raised/40 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => handleToggleAudio(it)}
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors"
                    title={playingAudioId === it.id ? "Pause" : "Play preview"}
                  >
                    <Icon name={playingAudioId === it.id ? "pause" : "play"} className="size-3" />
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-medium text-ink">{it.title}</div>
                    <div className="text-[10px] text-muted">{it.mood || it.kind} · {formatTime(it.duration)}</div>
                  </div>

                  {onInsertAudio && (
                    <button
                      type="button"
                      onClick={() => void handleInsertAudio(it)}
                      disabled={audioBusyId === it.id}
                      className="flex size-6 shrink-0 items-center justify-center rounded bg-raised text-muted hover:bg-primary hover:text-white transition-colors cursor-pointer"
                      title="Add to timeline"
                    >
                      {audioBusyId === it.id ? <Spinner size="xs" /> : <Icon name="plus" className="size-3.5" />}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
