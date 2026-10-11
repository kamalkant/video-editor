import { z } from "zod";
import { adminError, parseBody, requireAdmin } from "@/lib/auth/admin-guard";
import { listBulkJobs, createBulkJob } from "@/lib/db/bulk-jobs";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  try {
    return Response.json({ ok: true, jobs: listBulkJobs(50) });
  } catch (err: any) {
    return adminError(500, "server_error", err?.message || "Failed to list bulk jobs");
  }
}

/** Job types that lock people out or sign them out: never applied to staff accounts or the requester. */
const DISRUPTIVE = new Set(["user_status", "force_logout", "device_revoke_all"]);

const target = {
  // resolved on the server so "all users" really means all of them (not one page of a list)
  targetScope: z.enum(["all", "active"]).optional(),
  targetUserIds: z.array(z.string().min(1)).min(1).max(100_000).optional(),
  batchSize: z.number().int().min(1).max(500).default(50),
};

const Job = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ai_credit_grant"),
    payload: z.object({ amount: z.number().int().min(1).max(100_000), reason: z.string().trim().max(300).optional() }),
    ...target,
  }),
  z.object({
    type: z.literal("notification_broadcast"),
    payload: z.object({
      title: z.string().trim().min(1).max(200),
      message: z.string().trim().min(1).max(5000),
      type: z.enum(["system", "billing", "security"]).default("system"),
    }),
    ...target,
  }),
  z.object({ type: z.literal("force_logout"), payload: z.object({}).passthrough().default({}), ...target }),
  z.object({ type: z.literal("device_revoke_all"), payload: z.object({}).passthrough().default({}), ...target }),
  z.object({
    type: z.literal("user_device_override"),
    payload: z.object({ maxDevices: z.number().int().min(1).max(100), reason: z.string().trim().max(300).optional() }),
    ...target,
  }),
  z.object({ type: z.literal("user_status"), payload: z.object({ status: z.enum(["active", "suspended"]) }), ...target }),
  z.object({
    type: z.literal("ai_assignment_grant"),
    payload: z.object({
      poolId: z.string().min(1),
      policy: z.string().optional(),
      expiresAt: z.number().int().positive().nullable().optional(),
    }),
    ...target,
  }),
  z.object({ type: z.literal("ai_assignment_revoke"), payload: z.object({}).passthrough().default({}), ...target }),
]);

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  const body = await parseBody(req, Job);
  if (body.invalid) return body.invalid;
  const input = body.data;
  if (!input.targetScope && !input.targetUserIds) {
    return adminError(400, "bad_request", "Choose a target scope (all / active) or a list of user ids.");
  }

  // never target deleted accounts; disruptive jobs also skip admins, super admins and the requester
  const disruptive = DISRUPTIVE.has(input.type);
  const conditions = ["status != 'deleted'"];
  if (input.targetScope === "active") conditions.push("status = 'active'");
  if (disruptive) conditions.push("role = 'user'");
  const eligible = getDb()
    .prepare(`SELECT id FROM users WHERE ${conditions.join(" AND ")} ORDER BY created_at ASC`)
    .all() as Array<{ id: string }>;
  let ids = eligible.map((u) => u.id).filter((id) => !(disruptive && id === guard.user.id));
  if (input.targetUserIds) {
    const wanted = new Set(input.targetUserIds);
    ids = ids.filter((id) => wanted.has(id));
  }
  if (ids.length === 0) {
    return adminError(400, "bad_request", "No eligible users match this selection.");
  }

  try {
    const job = createBulkJob({
      type: input.type,
      targetUserIds: ids,
      payload: input.payload,
      batchSize: input.batchSize,
      createdBy: guard.user.id,
    });
    return Response.json({ ok: true, job, targetCount: ids.length });
  } catch (err: any) {
    return adminError(500, "server_error", err?.message || "Failed to create bulk job");
  }
}
