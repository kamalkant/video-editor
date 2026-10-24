import { apiError } from "@/lib/http/errors";
import { listLibrary } from "@/lib/library";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";

/** The music library: the starter set, the broadcast sounds, the music folder and (signed in) your uploaded sounds. */
export async function GET() {
  try {
    const user = await getCurrentUser();
    return Response.json(await listLibrary(user?.id ?? null));
  } catch {
    return apiError(500, "server_error", "Couldn't load the music library.");
  }
}
