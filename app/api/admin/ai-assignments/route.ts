import { requireAdmin, requireSuperAdmin } from "@/lib/auth/admin-guard";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/http/errors";
import {
  createAdminPool,
  listAdminPools,
  deleteAdminPool,
  assignPoolToUser,
  revokeUserAssignment,
} from "@/lib/ai/user-keys";
import { getDb } from "@/lib/db";
import type { ProviderId } from "@/lib/ai/providers";
import type { CredentialPolicy } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function GET() {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;

  const pools = listAdminPools();
  const db = getDb();
  const assignments = db.prepare(`
    SELECT 
      a.id, a.pool_id, a.user_id, a.policy, a.status, a.expires_at, a.created_at,
      u.email as user_email, u.name as user_name,
      p.name as pool_name, p.provider
    FROM user_api_assignments a
    JOIN users u ON a.user_id = u.id
    JOIN admin_api_pools p ON a.pool_id = p.id
    ORDER BY a.created_at DESC
  `).all();

  return NextResponse.json({ ok: true, pools, assignments });
}

export async function POST(request: Request) {
  const guard = await requireSuperAdmin();
  if (guard.denied) return guard.denied;
  const currentUser = guard.user;

  try {
    const body = await request.json();
    const { action } = body;

    if (action === "create_pool") {
      const { name, provider, rawKey, allowedModels, maxMonthlySpendCents } = body;
      if (!name || !provider || !rawKey) {
        return apiError(400, "bad_request", "Name, provider, and rawKey are required.");
      }

      const pool = createAdminPool({
        name,
        provider: provider as ProviderId,
        rawKey,
        allowedModels: Array.isArray(allowedModels) ? allowedModels : [],
        maxMonthlySpendCents: Number(maxMonthlySpendCents) || 0,
        createdBy: currentUser.id,
      });

      return NextResponse.json({ ok: true, pool });
    }

    if (action === "assign") {
      const { poolId, userIds, policy, expiresAt } = body;
      if (!poolId || !Array.isArray(userIds) || userIds.length === 0) {
        return apiError(400, "bad_request", "poolId and array of userIds are required.");
      }

      const results = [];
      for (const uid of userIds) {
        const assignment = assignPoolToUser({
          poolId,
          userId: uid,
          policy: (policy as CredentialPolicy) || "USER_FIRST",
          expiresAt: expiresAt ? Number(expiresAt) : null,
          assignedBy: currentUser.id,
        });
        results.push(assignment);
      }

      return NextResponse.json({ ok: true, count: results.length, assignments: results });
    }

    return apiError(400, "bad_request", "Invalid action specified.");
  } catch (err: any) {
    return apiError(500, "internal_error", err.message || "Failed to process request.");
  }
}

export async function DELETE(request: Request) {
  const guard = await requireSuperAdmin();
  if (guard.denied) return guard.denied;
  const currentUser = guard.user;

  const { searchParams } = new URL(request.url);
  const poolId = searchParams.get("poolId");
  const assignmentId = searchParams.get("assignmentId");

  if (assignmentId) {
    const revoked = revokeUserAssignment(assignmentId, currentUser.id);
    return NextResponse.json({ ok: true, revoked });
  }

  if (poolId) {
    const deleted = deleteAdminPool(poolId, currentUser.id);
    return NextResponse.json({ ok: true, deleted });
  }

  return apiError(400, "bad_request", "Provide either assignmentId or poolId.");
}
