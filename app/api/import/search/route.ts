import { apiError } from "@/lib/http/errors";
import { fakeSearch, isImportFake } from "@/lib/import/fake";
import { ImportError, searchPexels, searchPixabay } from "@/lib/import/stock";
import { isImportSource, type Shape } from "@/lib/import/types";
import { searchYouTube } from "@/lib/import/youtube";

export const runtime = "nodejs";

/** Search a library: ?source=pexels|pixabay|youtube&q=&page=&shape=any|landscape|portrait&cc=1 */
export async function GET(request: Request) {
  const u = new URL(request.url);
  const source = u.searchParams.get("source");
  const q = (u.searchParams.get("q") ?? "").trim().slice(0, 200);
  if (!isImportSource(source)) return apiError(400, "bad_request", "Pick a library.");
  if (!q) return apiError(400, "empty", "Type what you're looking for.");
  const page = u.searchParams.get("page") ?? "1";
  const shape = (["landscape", "portrait"].includes(u.searchParams.get("shape") ?? "") ? u.searchParams.get("shape") : "any") as Shape;
  try {
    if (isImportFake()) return Response.json(fakeSearch(source, q, Math.max(1, Number(page) || 1)));
    if (source === "youtube") return Response.json(await searchYouTube(q, { ccOnly: u.searchParams.get("cc") === "1", pageToken: page === "1" ? null : page }));
    const n = Math.max(1, Math.min(50, Number(page) || 1));
    return Response.json(source === "pexels" ? await searchPexels(q, n, shape) : await searchPixabay(q, n));
  } catch (err) {
    if (err instanceof ImportError) return apiError(err.status, err.code, err.message);
    return apiError(500, "server_error", "The search didn't work. Try again.");
  }
}
