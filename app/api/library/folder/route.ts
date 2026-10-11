import { apiError } from "@/lib/http/errors";
import { indexFolder, LibraryError, setLibraryFolder } from "@/lib/library";

export const runtime = "nodejs";

/** Use a music folder (full path) and read it: { folder } (null: none). */
export async function POST(request: Request) {
  let folder: unknown;
  try {
    folder = ((await request.json()) as { folder?: unknown }).folder;
  } catch {
    return apiError(400, "bad_request", "Send JSON.");
  }
  if (folder !== null && typeof folder !== "string") return apiError(400, "bad_request", "Send the folder's full path.");
  try {
    await setLibraryFolder(folder as string | null);
    const items = folder ? await indexFolder(folder as string) : [];
    return Response.json({ folder, count: items.length });
  } catch (err) {
    if (err instanceof LibraryError) return apiError(400, "bad_folder", err.message);
    return apiError(500, "server_error", "Couldn't read that folder.");
  }
}
