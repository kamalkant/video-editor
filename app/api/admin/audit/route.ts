import { adminError, pageParams, requireAdmin } from "@/lib/auth/admin-guard";
import { listAuditLogs } from "@/lib/db/audit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  try {
    const { searchParams } = new URL(req.url);
    const { limit, offset } = pageParams(searchParams, 50, 200);
    const time = (key: string) => {
      const v = searchParams.get(key);
      const n = v ? Number(v) : NaN;
      return Number.isFinite(n) ? n : undefined;
    };
    const data = listAuditLogs(limit, offset, {
      q: searchParams.get("q") ?? undefined,
      action: searchParams.get("action") ?? undefined,
      actorId: searchParams.get("actorId") ?? undefined,
      subject: searchParams.get("user") ?? undefined,
      from: time("from"),
      to: time("to"),
    });
    return Response.json({ ok: true, ...data, limit, offset });
  } catch (err: any) {
    return adminError(500, "server_error", err?.message || "Failed to fetch audit logs");
  }
}
