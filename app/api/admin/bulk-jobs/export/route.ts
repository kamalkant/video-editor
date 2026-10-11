import { adminError, requireAdmin } from "@/lib/auth/admin-guard";
import { generateBulkJobReportCsv } from "@/lib/db/bulk-jobs";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  if (!jobId) return adminError(400, "bad_request", "jobId is required.");

  const csv = generateBulkJobReportCsv(jobId);
  if (csv === null) return adminError(404, "not_found", "Job not found.");

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bulk-job-${jobId.replace(/[^A-Za-z0-9_-]/g, "")}-report.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
