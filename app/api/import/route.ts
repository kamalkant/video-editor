import { jsonBody } from "@/lib/ai/http";
import { apiError } from "@/lib/http/errors";
import { startImport } from "@/lib/import/jobs";
import { isImportSource } from "@/lib/import/types";

export const runtime = "nodejs";

/** Import a library item into My Assets: { source, id, rights? } ("mine" | "cc" for YouTube). Poll /api/import/jobs/[jobId]. */
export async function POST(request: Request) {
  const b = await jsonBody(request);
  if (!b || !isImportSource(b.source) || typeof b.id !== "string" || !/^[\w-]{1,40}$/.test(b.id)) return apiError(400, "bad_request", "Pick something to import.");
  const rights = b.rights === "mine" || b.rights === "cc" ? b.rights : null;
  if (b.source === "youtube" && !rights) return apiError(400, "rights", "Confirm that it's your own video, or pick a Creative Commons one.");
  return Response.json(startImport(b.source, b.id, rights), { status: 201 });
}
