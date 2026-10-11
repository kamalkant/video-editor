import { requireAdmin } from "@/lib/auth/admin-guard";
import { systemHealth } from "@/lib/admin/health";

export const runtime = "nodejs";

/** GET /api/admin/health[?refresh]: the system checks behind Admin → System health. */
export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  const refresh = new URL(req.url).searchParams.has("refresh");
  return Response.json({ ok: true, ...(await systemHealth(refresh)) });
}
