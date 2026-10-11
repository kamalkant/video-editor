import { NextResponse } from "next/server";
import { curatedStockProvider, type StockMediaItem } from "@/lib/media/stockProvider";
import { searchPexels, searchPixabay } from "@/lib/import/stock";
import { isImportFake, fakeSearch } from "@/lib/import/fake";
import type { Shape } from "@/lib/import/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const category = url.searchParams.get("category") ?? "All";
  const aspectRatio = (url.searchParams.get("aspectRatio") ?? "all") as "16:9" | "9:16" | "1:1" | "all";
  const provider = url.searchParams.get("provider") ?? "all";

  let items: StockMediaItem[] = [];

  // Only include curated broadcast loops if specifically requested (excluded from general STOCK VIDEOS)
  if (provider === "curated") {
    const curatedResult = await curatedStockProvider.search({
      query: q,
      category,
      aspectRatio,
    });
    items = [...curatedResult.items];
  }

  // Query remote stock (Pixabay / Pexels)
  if (provider === "all" || provider === "pexels" || provider === "pixabay") {
    const shape: Shape = aspectRatio === "9:16" ? "portrait" : aspectRatio === "16:9" ? "landscape" : "any";
    try {
      if (isImportFake()) {
        const fake = fakeSearch(provider === "pixabay" ? "pixabay" : "pexels", q || "popular", 1);
        const mapped: StockMediaItem[] = fake.items.map((fi) => ({
          id: `${fi.source}-${fi.id}`,
          provider: fi.source as "pexels" | "pixabay",
          title: fi.title,
          category: category !== "All" ? category : "Broadcast Motion Loops",
          thumbUrl: fi.thumb,
          previewUrl: fi.thumb,
          videoUrl: fi.videoUrl || undefined,
          downloadUrl: undefined,
          duration: fi.duration,
          width: fi.width,
          height: fi.height,
          aspectRatio: fi.height > fi.width ? "9:16" : fi.width === fi.height ? "1:1" : "16:9",
          resolution: fi.width >= 3840 ? "4K" : "HD",
          license: "free-commercial",
          author: fi.author,
          authorUrl: fi.authorUrl,
          tags: [fi.source, "stock"],
        }));
        items = [...items, ...mapped];
      } else {
        const tasks: Promise<void>[] = [];

        // Pixabay search (runs when provider is all or pixabay)
        if (provider === "all" || provider === "pixabay") {
          tasks.push(
            (async () => {
              try {
                const pix = await searchPixabay(q, 1);
                const mappedPix: StockMediaItem[] = pix.items.map((fi) => ({
                  id: `pixabay-${fi.id}`,
                  provider: "pixabay",
                  title: fi.title,
                  category: category !== "All" ? category : "Broadcast Motion Loops",
                  thumbUrl: fi.thumb,
                  previewUrl: fi.thumb,
                  videoUrl: fi.videoUrl,
                  duration: fi.duration,
                  width: fi.width,
                  height: fi.height,
                  aspectRatio: fi.height > fi.width ? "9:16" : fi.width === fi.height ? "1:1" : "16:9",
                  resolution: fi.width >= 3840 ? "4K" : "HD",
                  license: "free-commercial",
                  author: fi.author,
                  authorUrl: fi.authorUrl,
                  tags: ["pixabay", "stock"],
                }));
                items = [...items, ...mappedPix];
              } catch {
                // Pixabay key not configured or call failed
              }
            })(),
          );
        }

        // Pexels search (runs when provider is all or pexels and q is present)
        if ((provider === "all" || provider === "pexels") && q) {
          tasks.push(
            (async () => {
              try {
                const pex = await searchPexels(q, 1, shape);
                const mappedPex: StockMediaItem[] = pex.items.map((fi) => ({
                  id: `pexels-${fi.id}`,
                  provider: "pexels",
                  title: fi.title,
                  category: category !== "All" ? category : "Broadcast Motion Loops",
                  thumbUrl: fi.thumb,
                  previewUrl: fi.thumb,
                  videoUrl: fi.videoUrl,
                  duration: fi.duration,
                  width: fi.width,
                  height: fi.height,
                  aspectRatio: fi.height > fi.width ? "9:16" : fi.width === fi.height ? "1:1" : "16:9",
                  resolution: fi.width >= 3840 ? "4K" : "HD",
                  license: "free-commercial",
                  author: fi.author,
                  authorUrl: fi.authorUrl,
                  tags: ["pexels", "stock"],
                }));
                items = [...items, ...mappedPex];
              } catch {
                // Pexels key not set or failed
              }
            })(),
          );
        }

        await Promise.allSettled(tasks);
      }
    } catch {
      // Remote search error graceful fallback
    }
  }

  return NextResponse.json({
    items,
    total: items.length,
  });
}
