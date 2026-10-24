import { jsonBody } from "@/lib/ai/http";
import { apiError } from "@/lib/http/errors";
import { startImport } from "@/lib/import/jobs";
import { isImportSource } from "@/lib/import/types";
import { requireUser } from "@/lib/auth/requireUser";
import { ownerScope } from "@/lib/auth/owner";

export const runtime = "nodejs";

/** Import a library item into My Assets: { source, id }. Poll /api/import/jobs/[jobId]. */
export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const b = await jsonBody(request);
  if (!b || !isImportSource(b.source) || typeof b.id !== "string" || !/^[\w-]{1,40}$/.test(b.id)) return apiError(400, "bad_request", "Pick something to import.");
  const source = b.source;
  const id = b.id;
  // (the imported file is theirs: lib/auth/owner)
  return Response.json(ownerScope.run({ userId: user.id }, () => startImport(source, id)), { status: 201 });
}
