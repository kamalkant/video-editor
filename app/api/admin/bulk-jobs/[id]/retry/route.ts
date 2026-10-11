import { adminError, requireAdmin } from "@/lib/auth/admin-guard";
import { getBulkJobById, retryBulkJob } from "@/lib/db/bulk-jobs";

export const runtime = "nodejs";

/** Creates a new job over only the users that failed in this one. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  try {
    const { id } = await params;
    if (!getBulkJobById(id)) return adminError(404, "not_found", "Job not found");
    const job = retryBulkJob(id, guard.user.id);
    if (!job) return adminError(409, "conflict", "This job has no failed items to retry.");
    return Response.json({ ok: true, job, message: `Retry job ${job.id} created for ${job.total_items} failed user(s)` });
  } catch (err: any) {
    return adminError(500, "server_error", err?.message || "Retry failed");
  }
}
