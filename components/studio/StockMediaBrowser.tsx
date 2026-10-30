"use client";

import { useEffect, useState } from "react";
import { STOCK_CATEGORIES, type StockCategory, type StockMediaItem } from "@/lib/media/stockProvider";
import { formatTime } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";

export function StockMediaBrowser({
  onAddToTimeline,
  onReplaceBackground,
}: {
  onAddToTimeline: (item: StockMediaItem) => void;
  onReplaceBackground: (item: StockMediaItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<StockCategory>("All");
  const [aspect, setAspect] = useState<"16:9" | "9:16" | "1:1" | "all">("all");
  const [items, setItems] = useState<StockMediaItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchStock = async () => {
      setLoading(true);
      try {
        const u = new URL("/api/stock/search", window.location.origin);
        if (query.trim()) u.searchParams.set("q", query.trim());
        if (category !== "All") u.searchParams.set("category", category);
        if (aspect !== "all") u.searchParams.set("aspectRatio", aspect);

        const res = await fetch(u.toString());
        if (res.ok) {
          const data = (await res.json()) as { items: StockMediaItem[] };
          if (active) setItems(data.items ?? []);
        }
      } catch {
        // Fallback or offline
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchStock();
    return () => {
      active = false;
    };
  }, [query, category, aspect]);

  return (
    <div className="flex flex-col gap-3 p-3 bg-surface rounded-xl border border-line">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-ink">Stock & Broadcast Media</h3>
          <p className="text-2xs text-muted">Licensed studio backdrops, 3D loops & B-roll footage</p>
        </div>
        <span className="rounded bg-primary-soft px-1.5 py-0.5 text-2xs font-semibold text-primary">
          Free & Licensed
        </span>
      </div>

      {/* Search Input */}
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-muted">
          <Icon name="search" className="size-3.5" />
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search studio loops, globe, tech, drone..."
          className="w-full rounded-lg border border-line bg-canvas py-1.5 pl-8 pr-7 text-xs text-ink placeholder:text-muted focus:border-primary focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute inset-y-0 right-0 flex items-center pr-2 text-xs text-muted hover:text-ink"
          >
            ✕
          </button>
        )}
      </div>

      {/* Category Pills */}
      <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
        {STOCK_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-2xs font-medium transition-colors ${
              category === cat
                ? "bg-primary text-white font-bold"
                : "bg-raised border border-line text-muted hover:text-ink"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex h-32 items-center justify-center text-xs text-muted">
          <span>Loading stock media...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center text-xs text-muted gap-1">
          <span>No stock media found.</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
          {items.map((item) => (
            <div
              key={item.id}
              className="group relative flex flex-col overflow-hidden rounded-lg border border-line bg-surface hover:border-primary"
            >
              <div className="relative aspect-video w-full overflow-hidden bg-black">
                <img
                  src={item.thumbUrl}
                  alt={item.title}
                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                />
                <span className="absolute top-1 left-1 rounded bg-black/70 px-1 py-0.2 text-2xs font-bold text-white">
                  {item.resolution}
                </span>
                <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.2 text-2xs text-white">
                  {formatTime(item.duration)}
                </span>

                {/* Hover Action Overlay */}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/60 opacity-0 backdrop-blur-[1px] transition-opacity group-hover:opacity-100 p-1">
                  <button
                    type="button"
                    onClick={() => onReplaceBackground(item)}
                    className="w-full rounded bg-primary py-1 text-2xs font-semibold text-white shadow hover:scale-105 active:scale-95"
                  >
                    Set Background
                  </button>
                  <button
                    type="button"
                    onClick={() => onAddToTimeline(item)}
                    className="w-full rounded border border-white/20 bg-raised/80 py-1 text-2xs font-medium text-white hover:bg-hover active:scale-95"
                  >
                    + To Timeline
                  </button>
                </div>
              </div>
              <div className="p-1.5">
                <p className="truncate text-2xs font-medium text-ink" title={item.title}>
                  {item.title}
                </p>
                <p className="text-2xs text-muted">{item.category}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
