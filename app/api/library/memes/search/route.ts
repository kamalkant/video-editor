import { queryMemes, MEME_CATEGORIES, type MemeCategory } from "@/lib/library/memeCatalog";
import { searchOnlineMemesWhy } from "@/lib/library/dynamicSearch";

export const runtime = "nodejs";

/**
 * GET /api/library/memes/search?q=...&category=...&online=1
 * Searches both bundled curated meme clips and online clips dynamically.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const cat = (searchParams.get("category") ?? "all") as MemeCategory;
  const online = searchParams.get("online") === "1" || searchParams.get("online") === "true";

  const localItems = queryMemes(q, cat);

  // If online search is requested or local items are few and query is specified
  let onlineItems: any[] = [];
  // why YouTube search found nothing (blocked server, no downloader…): the Library says so instead of nothing
  let onlineError: string | null = null;
  if (q.length >= 2 && (online || localItems.length === 0)) {
    const r = await searchOnlineMemesWhy(q, 6);
    onlineItems = r.items;
    onlineError = r.error;
  }

  const combined = [...localItems, ...onlineItems];

  return Response.json({
    categories: MEME_CATEGORIES,
    items: combined,
    localCount: localItems.length,
    onlineCount: onlineItems.length,
    onlineError,
    total: combined.length,
  });
}
