import { NextResponse } from "next/server";
import { aiKey } from "@/lib/ai/keys";
import { importFile } from "@/lib/videos";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

export interface StockPhotoItem {
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

const CURATED_PHOTOS: StockPhotoItem[] = [
  {
    id: "curated-photo-newsroom",
    title: "Broadcasting TV News Studio",
    thumbUrl: "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=640&q=80",
    previewUrl: "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=1920&q=85",
    downloadUrl: "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=1920&q=85",
    width: 1920,
    height: 1080,
    author: "Unsplash News",
    source: "curated",
  },
  {
    id: "curated-photo-cyber-grid",
    title: "Neon Futuristic Cyber Matrix",
    thumbUrl: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=640&q=80",
    previewUrl: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1920&q=85",
    downloadUrl: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1920&q=85",
    width: 1920,
    height: 1080,
    author: "Unsplash Cyber",
    source: "curated",
  },
  {
    id: "curated-photo-sunset-beach",
    title: "Golden Hour Ocean Horizon",
    thumbUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=640&q=80",
    previewUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=85",
    downloadUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=85",
    width: 1920,
    height: 1080,
    author: "Unsplash Nature",
    source: "curated",
  },
  {
    id: "curated-photo-city-skyline",
    title: "Downtown Modern Metropolis Night",
    thumbUrl: "https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=640&q=80",
    previewUrl: "https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=1920&q=85",
    downloadUrl: "https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=1920&q=85",
    width: 1920,
    height: 1080,
    author: "Unsplash City",
    source: "curated",
  },
  {
    id: "curated-photo-earth-space",
    title: "Planet Earth Orbit from Space",
    thumbUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=640&q=80",
    previewUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1920&q=85",
    downloadUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1920&q=85",
    width: 1920,
    height: 1080,
    author: "NASA / Unsplash",
    source: "curated",
  },
  {
    id: "curated-photo-wallstreet",
    title: "Financial Stock Market Ticker Wall",
    thumbUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=640&q=80",
    previewUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1920&q=85",
    downloadUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1920&q=85",
    width: 1920,
    height: 1080,
    author: "Unsplash Finance",
    source: "curated",
  },
  {
    id: "curated-photo-mountain-fog",
    title: "Misty Mountain Range Peaks",
    thumbUrl: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=640&q=80",
    previewUrl: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1920&q=85",
    downloadUrl: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1920&q=85",
    width: 1920,
    height: 1080,
    author: "Unsplash Wilderness",
    source: "curated",
  },
  {
    id: "curated-photo-abstract-gradient",
    title: "Deep Violet Dark Gradient Texture",
    thumbUrl: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=640&q=80",
    previewUrl: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=1920&q=85",
    downloadUrl: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=1920&q=85",
    width: 1920,
    height: 1080,
    author: "Unsplash Abstract",
    source: "curated",
  },
];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));

  let items: StockPhotoItem[] = [];

  // Search Pixabay photos if key is available
  const key = aiKey("pixabay");
  if (key) {
    try {
      const pixQuery = q || "nature landscape";
      const pixUrl = new URL("https://pixabay.com/api/");
      pixUrl.searchParams.set("key", key);
      pixUrl.searchParams.set("q", pixQuery.slice(0, 100));
      pixUrl.searchParams.set("image_type", "photo");
      pixUrl.searchParams.set("per_page", "28");
      pixUrl.searchParams.set("page", String(page));
      pixUrl.searchParams.set("safesearch", "true");

      const res = await fetch(pixUrl.href, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ViPlay-Studio/1.0",
        },
        cache: "no-store",
      });

      if (res.ok) {
        const data = (await res.json()) as {
          hits?: Array<{
            id: number;
            tags: string;
            webformatURL: string;
            largeImageURL?: string;
            imageWidth: number;
            imageHeight: number;
            user: string;
            user_id?: number;
          }>;
        };

        if (data.hits && data.hits.length > 0) {
          const mapped: StockPhotoItem[] = data.hits.map((h) => {
            const cleanTitle = h.tags
              ? h.tags
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .slice(0, 3)
                  .join(", ")
              : `Photo ${h.id}`;
            const titleCap = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
            return {
              id: `pixabay-photo-${h.id}`,
              title: titleCap,
              thumbUrl: h.webformatURL,
              previewUrl: h.largeImageURL || h.webformatURL,
              downloadUrl: h.largeImageURL || h.webformatURL,
              width: h.imageWidth || 1920,
              height: h.imageHeight || 1080,
              author: h.user || "Pixabay",
              authorUrl: h.user_id ? `https://pixabay.com/users/${h.user}-${h.user_id}/` : undefined,
              source: "pixabay",
            };
          });

          items = [...mapped];
        }
      }
    } catch (err) {
      console.warn("Pixabay photo search failed:", err);
    }
  }

  // Also include curated photos
  const filteredCurated = q
    ? CURATED_PHOTOS.filter((p) => p.title.toLowerCase().includes(q.toLowerCase()))
    : CURATED_PHOTOS;
  items.push(...filteredCurated);

  return NextResponse.json({
    items,
    total: items.length,
  });
}

/** Import a photo directly into My Assets and return the VideoMeta */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url: string; title?: string };
    if (!body?.url || typeof body.url !== "string") {
      return NextResponse.json({ error: "Missing image URL" }, { status: 400 });
    }

    const title = (body.title || "Stock Photo")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 40);

    // Download image to temp file
    const res = await fetch(body.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ViPlay-Studio/1.0",
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to download image (status: ${res.status})` },
        { status: 502 },
      );
    }

    const arrayBuf = await res.arrayBuffer();
    const tempPath = join(tmpdir(), `vdo-photo-${randomUUID()}.jpg`);
    await writeFile(tempPath, Buffer.from(arrayBuf));

    // Register into library as an asset
    const media = await importFile(tempPath, `${title}.jpg`);

    return NextResponse.json({ media }, { status: 201 });
  } catch (err) {
    console.error("Photo import failed:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Failed to import photo" },
      { status: 500 },
    );
  }
}
