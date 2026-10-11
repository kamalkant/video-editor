import { requireAdmin } from "@/lib/auth/admin-guard";
import { apiError } from "@/lib/http/errors";
import { getAllFeatureFlags, updateFeatureFlag } from "@/lib/db/features";
import { logAudit } from "@/lib/db/audit";
import type { UserRole } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function GET() {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;

  const features = getAllFeatureFlags();
  return Response.json({ features });
}

export async function PATCH(request: Request) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  const currentUser = guard.user;

  try {
    const body = await request.json();
    const toolId = typeof body?.toolId === "string" ? body.toolId : "";
    if (!toolId) {
      return apiError(400, "bad_request", "Tool ID is required.");
    }

    const enabledGlobal = typeof body?.enabled_global === "boolean" ? body.enabled_global : undefined;
    const ROLES: UserRole[] = ["user", "admin", "super_admin"];
    if (Array.isArray(body?.allowed_roles) && !body.allowed_roles.every((r: unknown) => ROLES.includes(r as UserRole))) {
      return apiError(400, "bad_request", "allowed_roles may only contain user, admin and super_admin.");
    }
    const allowedRoles = Array.isArray(body?.allowed_roles) ? ([...new Set(body.allowed_roles)] as UserRole[]) : undefined;

    const updated = updateFeatureFlag(toolId, {
      enabled_global: enabledGlobal,
      allowed_roles: allowedRoles,
      updated_by: currentUser!.email ?? undefined,
    });

    if (!updated) {
      return apiError(404, "not_found", `Feature flag '${toolId}' not found.`);
    }

    logAudit({
      actorId: currentUser!.id,
      action: "admin.update_feature_flag",
      target: toolId,
      details: { enabled_global: enabledGlobal, allowed_roles: allowedRoles },
    });

    return Response.json({ ok: true, feature: updated });
  } catch (err) {
    console.error("Failed to update feature flag:", err);
    return apiError(500, "server_error", "Failed to update feature flag.");
  }
}
