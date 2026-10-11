import { z } from "zod";
import { adminError, pageParams, parseBody, requireAdmin } from "@/lib/auth/admin-guard";
import { isSuperAdmin } from "@/lib/auth/permissions";
import {
  listAllPayoutRequests,
  approvePayout,
  rejectPayout,
  processManualPayout,
  processGatewayPayout,
  bulkApprovePayouts,
  bulkRejectPayouts,
} from "@/lib/referrals/payouts";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "all";
    const data = listAllPayoutRequests({ status, ...pageParams(searchParams) });
    return Response.json({ ok: true, payouts: data.payouts, total: data.total, canDisburse: isSuperAdmin(guard.user) });
  } catch (err: any) {
    console.error("Admin payouts GET error:", err);
    return adminError(500, "server_error", err?.message || "Failed to load payouts");
  }
}

const reasonField = z.string().trim().min(1, "a rejection reason is required").max(500);

const SingleAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), requestId: z.string().min(1) }),
  z.object({ action: z.literal("reject"), requestId: z.string().min(1), reason: reasonField }),
  z.object({
    action: z.literal("mark_paid"),
    requestId: z.string().min(1),
    reference: z.string().trim().min(4, "Bank/UPI reference number (UTR) is required").max(64),
  }),
  z.object({ action: z.literal("process_gateway"), requestId: z.string().min(1) }),
]);

export async function PATCH(req: Request) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  const body = await parseBody(req, SingleAction);
  if (body.invalid) return body.invalid;
  const input = body.data;
  const user = guard.user;

  // moving money out is reserved for super admins; approving/rejecting is any admin
  if ((input.action === "mark_paid" || input.action === "process_gateway") && !isSuperAdmin(user)) {
    return adminError(403, "forbidden", "Only a Super Admin can disburse payouts.");
  }

  try {
    if (input.action === "approve") {
      const updated = approvePayout(input.requestId, user.id);
      return Response.json({ ok: true, payout: updated, message: "Payout request approved" });
    }
    if (input.action === "reject") {
      const updated = rejectPayout(input.requestId, input.reason, user.id);
      return Response.json({ ok: true, payout: updated, message: "Payout rejected and reserved funds returned to user wallet" });
    }
    if (input.action === "mark_paid") {
      const updated = processManualPayout(input.requestId, input.reference, user.id);
      return Response.json({ ok: true, payout: updated, message: "Payout marked as paid with reference ID" });
    }
    const res = await processGatewayPayout(input.requestId, user.id);
    if (!res.success) return Response.json({ ok: false, message: res.error, error: { code: "gateway_error", message: res.error }, payout: res.request }, { status: 502 });
    const queued = res.request.status === "processing";
    return Response.json({
      ok: true,
      payout: res.request,
      message: queued ? "Payout accepted by the gateway and queued; it stays Processing until settled" : "Payout processed via payment gateway",
    });
  } catch (err: any) {
    // state-machine refusals ("Cannot reject a payout that is paid") are conflicts, not server errors
    const msg = err?.message || "Failed to update payout";
    const conflict = /^Cannot |changed meanwhile|Payout mode|not found/i.test(msg);
    if (!conflict) console.error("Admin payouts PATCH error:", err);
    return adminError(conflict ? 409 : 500, conflict ? "conflict" : "server_error", msg);
  }
}

const BulkAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("bulk_approve"), requestIds: z.array(z.string().min(1)).min(1).max(200) }),
  z.object({ action: z.literal("bulk_reject"), requestIds: z.array(z.string().min(1)).min(1).max(200), reason: reasonField }),
]);

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  const body = await parseBody(req, BulkAction);
  if (body.invalid) return body.invalid;
  const input = body.data;

  try {
    if (input.action === "bulk_approve") {
      const res = bulkApprovePayouts(input.requestIds, guard.user.id);
      return Response.json({
        ok: true,
        approved: res.approved,
        failed: res.failed,
        message: `Approved ${res.approved} request(s) (${res.failed} skipped: not in an approvable state)`,
      });
    }
    const res = bulkRejectPayouts(input.requestIds, input.reason, guard.user.id);
    return Response.json({
      ok: true,
      rejected: res.rejected,
      failed: res.failed,
      message: `Rejected ${res.rejected} request(s) and returned their funds (${res.failed} skipped: not in a rejectable state)`,
    });
  } catch (err: any) {
    console.error("Admin payouts POST error:", err);
    return adminError(500, "server_error", err?.message || "Failed to process bulk action");
  }
}
