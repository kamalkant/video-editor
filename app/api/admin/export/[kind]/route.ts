import { adminError, requireAdmin } from "@/lib/auth/admin-guard";
import { EXPORT_KINDS, exportCsv, type ExportKind } from "@/lib/admin/exports";
import { logAudit } from "@/lib/db/audit";

export const runtime = "nodejs";

/** GET /api/admin/export/payments.csv?from=<ms>&to=<ms> (also refunds, payouts, users): a CSV download. */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  const kind = (await params).kind.replace(/\.csv$/, "") as ExportKind;
  if (!EXPORT_KINDS.includes(kind)) return adminError(404, "not_found", `Nothing to export called "${kind}".`);

  const { searchParams } = new URL(req.url);
  const time = (key: string) => {
    const n = Number(searchParams.get(key) ?? NaN);
    return searchParams.get(key) && Number.isFinite(n) ? n : undefined;
  };
  const { csv, rows } = exportCsv(kind, { from: time("from"), to: time("to") });
  // a bulk download of customer data is worth a line in the audit log
  logAudit({ actorId: guard.user.id, action: "admin.export_csv", details: { kind, rows } });
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vdo-${kind}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
