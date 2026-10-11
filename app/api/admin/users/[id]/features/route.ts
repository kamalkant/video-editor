import { requireAdmin } from "@/lib/auth/admin-guard";
import { apiError } from "@/lib/http/errors";
import { canManageUser } from "@/lib/auth/admin-policy";
import { getUserById } from "@/lib/db/users";
import {
  getAllFeatureFlags,
  getComputedFeaturesForUser,
  getUserFeatureOverrides,
  setUserFeatureOverride,
} from "@/lib/db/features";
import { logAudit } from "@/lib/db/audit";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;

  const { id } = await params;
  const targetUser = getUserById(id);
  if (!targetUser) {
    return apiError(404, "not_found", "User not found.");
  }

  const allTools = getAllFeatureFlags();
  const overrides = getUserFeatureOverrides(id);
  const computed = getComputedFeaturesForUser(targetUser);

  return Response.json({
    userId: id,
    userRole: targetUser.role,
    overrides,
    computed,
    allTools,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  const currentUser = guard.user;

  const { id } = await params;
  const targetUser = getUserById(id);
  if (!targetUser) {
    return apiError(404, "not_found", "User not found.");
  }
  if (!canManageUser(currentUser!, targetUser)) {
    return apiError(403, "forbidden", "Only a Super Admin can change tool access for admin accounts.");
  }

  try {
    const body = await request.json();
    const toolId = typeof body?.toolId === "string" ? body.toolId : "";
    // enabled can be true (grant), false (revoke), or null (reset to role default)
    const enabled = body?.enabled === null ? null : typeof body?.enabled === "boolean" ? body.enabled : undefined;

    if (!toolId || enabled === undefined) {
      return apiError(400, "bad_request", "Tool ID and enabled state (boolean or null) are required.");
    }

    setUserFeatureOverride(id, toolId, enabled, currentUser!.email ?? undefined);

    logAudit({
      actorId: currentUser!.id,
      action: "admin.user_feature_override",
      target: id,
      details: { toolId, enabled },
    });

    const overrides = getUserFeatureOverrides(id);
    const computed = getComputedFeaturesForUser(targetUser);

    return Response.json({
      ok: true,
      overrides,
      computed,
    });
  } catch (err) {
    console.error("Failed to update user feature override:", err);
    return apiError(500, "server_error", "Failed to update feature override.");
  }
}
