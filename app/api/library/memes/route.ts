import { queryMemes, MEME_CATEGORIES, type MemeCategory } from "@/lib/library/memeCatalog";

export const runtime = "nodejs";

/**
 * GET /api/library/memes?q=...&category=...
 * Query trending Bollywood & Hollywood meme clips.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const cat = (searchParams.get("category") ?? "all") as MemeCategory;

  const validCategories = MEME_CATEGORIES.map((c) => c.id);
  const category = validCategories.includes(cat) ? cat : "all";

  const items = queryMemes(q, category);

  return Response.json({
    categories: MEME_CATEGORIES,
    items,
    total: items.length,
  });
}
