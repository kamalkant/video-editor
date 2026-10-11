import type { AspectRatio } from "../templates/types";

export interface StockSearchOptions {
  query: string;
  category?: string;
  aspectRatio?: AspectRatio | "all";
  page?: number;
  limit?: number;
}

export interface StockMediaItem {
  id: string;
  provider: "curated" | "pexels" | "pixabay" | "ai" | "local";
  title: string;
  category: string;
  thumbUrl: string;
  previewUrl: string;
  videoUrl?: string;
  downloadUrl?: string;
  duration: number; // seconds
  width: number;
  height: number;
  aspectRatio: AspectRatio;
  resolution: "4K" | "HD";
  license: "free-commercial" | "royalty-free" | "ai-generated";
  author?: string;
  authorUrl?: string | null;
  tags: string[];
}

export interface StockMediaProvider {
  id: string;
  name: string;
  categories: string[];
  search(
    opts: StockSearchOptions,
  ): Promise<{ items: StockMediaItem[]; next?: string | null }>;
}

export const STOCK_CATEGORIES = [
  "All",
  "News Studio Backgrounds",
  "Broadcast Motion Loops",
  "World Map & Globe",
  "Technology & Cyber",
  "Business & Finance",
  "City Skylines & Drone",
  "Breaking News B-Roll",
  "Weather & Nature",
] as const;

export type StockCategory = (typeof STOCK_CATEGORIES)[number];

/** Curated, royalty-free broadcast loops and news set presets ready for zero-key usage */
export const CURATED_BROADCAST_ASSETS: StockMediaItem[] = [
  {
    id: "curated-newsroom-blue",
    provider: "curated",
    title: "Modern Blue Newsroom Studio",
    category: "News Studio Backgrounds",
    thumbUrl: "/templates/thumbs/newsroom-modern.jpg",
    previewUrl: "/templates/thumbs/newsroom-modern.jpg",
    videoUrl: "/templates/media/newsroom-modern.mp4",
    duration: 10,
    width: 1920,
    height: 1080,
    aspectRatio: "16:9",
    resolution: "4K",
    license: "royalty-free",
    author: "ViPlay Broadcast Assets",
    tags: ["studio", "newsroom", "blue", "led", "anchor"],
  },
  {
    id: "curated-breaking-red",
    provider: "curated",
    title: "Breaking News Red Alert Studio",
    category: "Breaking News B-Roll",
    thumbUrl: "/templates/thumbs/breaking-red.jpg",
    previewUrl: "/templates/thumbs/breaking-red.jpg",
    videoUrl: "/templates/media/breaking-red.mp4",
    duration: 10,
    width: 1920,
    height: 1080,
    aspectRatio: "16:9",
    resolution: "4K",
    license: "royalty-free",
    author: "ViPlay Broadcast Assets",
    tags: ["breaking", "red", "alert", "emergency", "flash"],
  },
  {
    id: "curated-globe-3d-loop",
    provider: "curated",
    title: "3D Earth Globe Rotation Loop",
    category: "World Map & Globe",
    thumbUrl: "/templates/thumbs/globe-3d.jpg",
    previewUrl: "/templates/thumbs/globe-3d.jpg",
    videoUrl: "/templates/media/globe-3d.mp4",
    duration: 10,
    width: 1920,
    height: 1080,
    aspectRatio: "16:9",
    resolution: "4K",
    license: "royalty-free",
    author: "ViPlay Broadcast Assets",
    tags: ["globe", "world", "earth", "space", "international"],
  },
  {
    id: "curated-cyber-tech-grid",
    provider: "curated",
    title: "Futuristic Cyber Data Grid",
    category: "Technology & Cyber",
    thumbUrl: "/templates/thumbs/tech-grid.jpg",
    previewUrl: "/templates/thumbs/tech-grid.jpg",
    videoUrl: "/templates/media/tech-grid.mp4",
    duration: 10,
    width: 1920,
    height: 1080,
    aspectRatio: "16:9",
    resolution: "4K",
    license: "royalty-free",
    author: "ViPlay Broadcast Assets",
    tags: ["cyber", "matrix", "tech", "data", "code", "neon"],
  },
  {
    id: "curated-wallstreet-finance",
    provider: "curated",
    title: "Financial Exchange Ticker Wall",
    category: "Business & Finance",
    thumbUrl: "/templates/thumbs/finance-ticker.jpg",
    previewUrl: "/templates/thumbs/finance-ticker.jpg",
    videoUrl: "/templates/media/finance-ticker.mp4",
    duration: 10,
    width: 1920,
    height: 1080,
    aspectRatio: "16:9",
    resolution: "4K",
    license: "royalty-free",
    author: "ViPlay Broadcast Assets",
    tags: ["finance", "stocks", "wallstreet", "crypto", "trading"],
  },
  {
    id: "curated-sports-arena",
    provider: "curated",
    title: "Sports Arena Stadium Broadcast",
    category: "Broadcast Motion Loops",
    thumbUrl: "/templates/thumbs/sports-arena.jpg",
    previewUrl: "/templates/thumbs/sports-arena.jpg",
    videoUrl: "/templates/media/sports-arena.mp4",
    duration: 10,
    width: 1920,
    height: 1080,
    aspectRatio: "16:9",
    resolution: "HD",
    license: "royalty-free",
    author: "ViPlay Broadcast Assets",
    tags: ["sports", "arena", "stadium", "broadcast", "championship", "city", "skyline"],
  },
  {
    id: "curated-weather-radar",
    provider: "curated",
    title: "Doppler Weather Radar Forecast",
    category: "Weather & Nature",
    thumbUrl: "/templates/thumbs/radar-weather.jpg",
    previewUrl: "/templates/thumbs/radar-weather.jpg",
    videoUrl: "/templates/media/radar-weather.mp4",
    duration: 10,
    width: 1920,
    height: 1080,
    aspectRatio: "16:9",
    resolution: "HD",
    license: "royalty-free",
    author: "ViPlay Broadcast Assets",
    tags: ["weather", "storm", "clouds", "radar", "doppler", "nature", "forecast"],
  },
  {
    id: "curated-podcast-studio",
    provider: "curated",
    title: "Neon Acoustic Podcast Studio",
    category: "News Studio Backgrounds",
    thumbUrl: "/templates/thumbs/podcast-studio.jpg",
    previewUrl: "/templates/thumbs/podcast-studio.jpg",
    videoUrl: "/templates/media/podcast-studio.mp4",
    duration: 10,
    width: 1920,
    height: 1080,
    aspectRatio: "16:9",
    resolution: "4K",
    license: "royalty-free",
    author: "ViPlay Broadcast Assets",
    tags: ["podcast", "studio", "neon", "acoustic", "mic", "talk"],
  },
  {
    id: "curated-crime-cctv",
    provider: "curated",
    title: "CCTV Surveillance Investigation",
    category: "Breaking News B-Roll",
    thumbUrl: "/templates/thumbs/crime-cctv.jpg",
    previewUrl: "/templates/thumbs/crime-cctv.jpg",
    videoUrl: "/templates/media/crime-cctv.mp4",
    duration: 10,
    width: 1920,
    height: 1080,
    aspectRatio: "16:9",
    resolution: "4K",
    license: "royalty-free",
    author: "ViPlay Broadcast Assets",
    tags: ["cctv", "security", "surveillance", "investigation", "crime", "alert"],
  },
  {
    id: "curated-vertical-news-studio",
    provider: "curated",
    title: "Vertical News Studio Stage",
    category: "News Studio Backgrounds",
    thumbUrl: "/templates/thumbs/vertical-reels.jpg",
    previewUrl: "/templates/thumbs/vertical-reels.jpg",
    videoUrl: "/templates/media/vertical-reels.mp4",
    duration: 10,
    width: 1080,
    height: 1920,
    aspectRatio: "9:16",
    resolution: "4K",
    license: "royalty-free",
    author: "ViPlay Broadcast Assets",
    tags: ["vertical", "shorts", "reels", "studio", "mobile"],
  },
  {
    id: "curated-vertical-breaking",
    provider: "curated",
    title: "Vertical Emergency Breaking Alert",
    category: "Breaking News B-Roll",
    thumbUrl: "/templates/thumbs/vertical-breaking.jpg",
    previewUrl: "/templates/thumbs/vertical-breaking.jpg",
    videoUrl: "/templates/media/vertical-breaking.mp4",
    duration: 10,
    width: 1080,
    height: 1920,
    aspectRatio: "9:16",
    resolution: "4K",
    license: "royalty-free",
    author: "ViPlay Broadcast Assets",
    tags: ["vertical", "breaking", "alert", "emergency", "reels", "mobile"],
  },
  {
    id: "curated-square-social",
    provider: "curated",
    title: "Square Social Broadcast Loop",
    category: "Broadcast Motion Loops",
    thumbUrl: "/templates/thumbs/square-social.jpg",
    previewUrl: "/templates/thumbs/square-social.jpg",
    videoUrl: "/templates/media/square-social.mp4",
    duration: 10,
    width: 1080,
    height: 1080,
    aspectRatio: "1:1",
    resolution: "HD",
    license: "royalty-free",
    author: "ViPlay Broadcast Assets",
    tags: ["square", "social", "feed", "broadcast", "loop", "instagram"],
  },
];

export class CuratedBroadcastProvider implements StockMediaProvider {
  id = "curated";
  name = "Broadcast Sets & Loops";
  categories = [...STOCK_CATEGORIES];

  async search(
    opts: StockSearchOptions,
  ): Promise<{ items: StockMediaItem[]; next?: string | null }> {
    const q = (opts.query ?? "").toLowerCase().trim();
    const cat = opts.category;
    const aspect = opts.aspectRatio;

    let items = CURATED_BROADCAST_ASSETS;

    if (cat && cat !== "All") {
      items = items.filter(
        (x) => x.category.toLowerCase() === cat.toLowerCase(),
      );
    }

    if (aspect && aspect !== "all") {
      items = items.filter((x) => x.aspectRatio === aspect);
    }

    if (q) {
      items = items.filter(
        (x) =>
          x.title.toLowerCase().includes(q) ||
          x.category.toLowerCase().includes(q) ||
          x.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    return { items, next: null };
  }
}

export const curatedStockProvider = new CuratedBroadcastProvider();
