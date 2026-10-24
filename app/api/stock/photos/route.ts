import { NextResponse } from "next/server";
import { aiKey } from "@/lib/ai/keys";
import { importFile } from "@/lib/videos";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { apiError } from "@/lib/http/errors";
import { requireUser } from "@/lib/auth/requireUser";

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

/** Where a stock photo may be downloaded from (the libraries' own picture hosts; nothing else is fetched). */
const PHOTO_HOSTS = [/^images\.unsplash\.com$/, /^cdn\.pixabay\.com$/, /^pixabay\.com$/, /(^|\.)pexels\.com$/];
/** The biggest photo taken (a 4K JPEG is a few MB). */
const MAX_PHOTO_BYTES = 25 * 1024 * 1024;

/**
 * Import a stock photo into your My Assets: { url, title? } → { media }. Signed in only, from the libraries'
 * hosts only (it used to fetch any address for anyone: a way into the server's own network), at most 25 MB.
 */
export async function POST(request: Request) {
  const user = await requireUser("Sign in to import photos.");
  if (user instanceof Response) return user;
  let body: { url?: unknown; title?: unknown };
  try {
    body = (await request.json()) as { url?: unknown; title?: unknown };
  } catch {
    return apiError(400, "bad_request", "Send JSON.");
  }
  let url: URL | null = null;
  try {
    url = typeof body.url === "string" ? new URL(body.url) : null;
  } catch {
    url = null;
  }
  if (!url || url.protocol !== "https:" || !PHOTO_HOSTS.some((h) => h.test(url!.hostname))) return apiError(400, "bad_request", "That isn't a stock library photo.");
  const title = (typeof body.title === "string" && body.title ? body.title : "Stock Photo").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
  const dir = await mkdtemp(join(tmpdir(), "vdo-photo-"));
  const tempPath = join(dir, "photo.jpg");
  try {
    // (no redirects: only the allowed hosts are ever fetched)
    const res = await fetch(url, { redirect: "error", headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ViPlay-Studio/1.0" }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
    const type = res?.headers.get("content-type") ?? "";
    if (!res?.ok || !type.startsWith("image/") || !res.body) return apiError(502, "download_failed", "Couldn't download that photo.");
    if (Number(res.headers.get("content-length") ?? 0) > MAX_PHOTO_BYTES) return apiError(413, "too_big", "That photo is too big.");
    // read it with a limit (the size header can be missing or wrong)
    const parts: Uint8Array[] = [];
    let size = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PHOTO_BYTES) {
        await reader.cancel().catch(() => undefined);
        return apiError(413, "too_big", "That photo is too big.");
      }
      parts.push(value);
    }
    await writeFile(tempPath, Buffer.concat(parts));
    const media = await importFile(tempPath, `${title}.jpg`, user.id);
    return NextResponse.json({ media }, { status: 201 });
  } catch (err) {
    console.error("Photo import failed:", err);
    return apiError(500, "import_failed", "Couldn't import that photo.");
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
