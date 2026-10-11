import { apiError } from "@/lib/http/errors";
import { listLibrary } from "@/lib/library";

export const runtime = "nodejs";

/** The music library: the starter set (made on this Mac) and your folder. */
export async function GET() {
  try {
    return Response.json(await listLibrary());
  } catch {
    return apiError(500, "server_error", "Couldn't load the music library.");
  }
}
