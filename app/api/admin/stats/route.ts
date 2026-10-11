import { requireAdmin } from "@/lib/auth/admin-guard";
import { apiError } from "@/lib/http/errors";
import { getUserStats } from "@/lib/db/users";
import { getAllFeatureFlags } from "@/lib/db/features";
import { listAuditLogs } from "@/lib/db/audit";

export const runtime = "nodejs";

export async function GET() {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;

  const userStats = getUserStats();
  const features = getAllFeatureFlags();
  const { logs } = listAuditLogs(10, 0);

  const enabledFeatures = features.filter((f) => f.enabled_global).length;

  return Response.json({
    users: userStats,
    features: {
      total: features.length,
      enabled: enabledFeatures,
      disabled: features.length - enabledFeatures,
    },
    recentLogs: logs,
  });
}
