import { adminError, requireAdmin } from "@/lib/auth/admin-guard";
import { processBulkJobBatch, getBulkJobById } from "@/lib/db/bulk-jobs";
import { logAudit } from "@/lib/db/audit";

export const runtime = "nodejs";

/** Runs the next batch of the job (its own batch_size). Safe to call concurrently: each batch is claimed once. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  try {
    const { id } = await params;
    const before = getBulkJobById(id);
    if (!before) return adminError(404, "not_found", "Job not found");

    const job = await processBulkJobBatch(id);
    if (!job) return adminError(404, "not_found", "Job not found");

    if (job.processed_items !== before.processed_items) {
      logAudit({
        actorId: guard.user.id,
        action: "bulk_job.batch_executed",
        target: id,
        details: { from: before.processed_items, to: job.processed_items, status: job.status },
      });
    }
    return Response.json({ ok: true, job });
  } catch (err: any) {
    return adminError(500, "server_error", err?.message || "Batch execution failed");
  }
}
