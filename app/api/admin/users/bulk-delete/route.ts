import { z } from "zod";
import { parseBody, requireSuperAdmin } from "@/lib/auth/admin-guard";
import { softDeleteUsers } from "@/lib/db/users";
import { logAudit } from "@/lib/db/audit";

const bodySchema = z.object({
  ids: z.array(z.string().min(1).max(100)).min(1, "Select at least one user.").max(100, "Delete at most 100 users at a time."),
});

const REASON: Record<string, string> = {
  self: "your own account",
  not_found: "not found or already deleted",
  last_super_admin: "the last active Super Admin",
  failed: "couldn't be deleted",
};

/**
 * Soft-delete the selected users (Admin › Users, Super Admin only), like DELETE /api/admin/users/[id] for
 * each: they can no longer sign in and their personal details are erased; payments and audit history are
 * kept. Your own account and the last active Super Admin are skipped and said why.
 */
export async function POST(request: Request) {
  const guard = await requireSuperAdmin();
  if (guard.denied) return guard.denied;
  const actor = guard.user;
  const body = await parseBody(request, bodySchema);
  if (body.invalid) return body.invalid;

  const { deleted, skipped } = softDeleteUsers(body.data.ids, actor.id);
  for (const target of deleted) {
    logAudit({
      actorId: actor.id,
      action: "admin.delete_user",
      target: target.id,
      details: { email: target.email, name: target.name, role: target.role, mode: "soft", bulk: true },
    });
  }
  logAudit({
    actorId: actor.id,
    action: "admin.bulk_delete_users",
    target: null,
    details: { requested: body.data.ids.length, deleted: deleted.map((u) => u.id), skipped },
  });

  const parts = [`${deleted.length} user${deleted.length === 1 ? "" : "s"} deleted.`];
  if (skipped.length) parts.push(`Skipped ${skipped.length}: ${[...new Set(skipped.map((s) => REASON[s.reason]))].join(", ")}.`);
  if (deleted.length) parts.push("Their payments and audit history are kept.");
  return Response.json({
    ok: true,
    deleted: deleted.map((u) => u.id),
    skipped: skipped.map((s) => ({ ...s, message: REASON[s.reason] })),
    message: parts.join(" "),
  });
}
