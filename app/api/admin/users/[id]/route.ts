import { z } from "zod";
import { adminError, parseBody, requireAdmin, requireSuperAdmin } from "@/lib/auth/admin-guard";
import { canGrantRole, canManageUser, MIN_PASSWORD_LENGTH } from "@/lib/auth/admin-policy";
import {
  countOtherActiveSuperAdmins,
  getSafeUserById,
  getUserById,
  softDeleteUser,
  updateUserPassword,
  updateUserRole,
  updateUserStatus,
} from "@/lib/db/users";
import { deleteUserSessions } from "@/lib/db/sessions";
import { logAudit } from "@/lib/db/audit";
import { getUserOverview } from "@/lib/db/user-overview";

export const runtime = "nodejs";

const UpdateUser = z
  .object({
    role: z.enum(["user", "admin", "super_admin"]),
    status: z.enum(["active", "suspended"]),
    password: z.string().min(MIN_PASSWORD_LENGTH, `password must be at least ${MIN_PASSWORD_LENGTH} characters`).max(200),
  })
  .partial();

/** The "user 360" view: plan, payments, refunds, credits, devices, referrals and audit trail of one account. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  const { id } = await params;
  const overview = getUserOverview(id);
  if (!overview) return adminError(404, "not_found", "User not found.");
  return Response.json({ ok: true, overview });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  const actor = guard.user;

  const { id } = await params;
  const target = getUserById(id);
  if (!target || target.status === "deleted") {
    return adminError(404, "not_found", "User not found.");
  }
  const body = await parseBody(request, UpdateUser);
  if (body.invalid) return body.invalid;
  const { role, status, password } = body.data;

  const roleChange = role !== undefined && role !== target.role;
  const statusChange = status !== undefined && status !== target.status;
  const isSelf = target.id === actor.id;

  // validate everything first: a request either applies fully or not at all
  if (!canManageUser(actor, target)) {
    return adminError(403, "forbidden", "Only a Super Admin can modify admin or super admin accounts.");
  }
  if (roleChange && isSelf) {
    return adminError(400, "bad_request", "You cannot change your own role.");
  }
  if (roleChange && !canGrantRole(actor, role!)) {
    return adminError(403, "forbidden", "Only a Super Admin can grant admin or super admin privileges.");
  }
  if (statusChange && isSelf) {
    return adminError(400, "bad_request", "You cannot suspend your own account.");
  }
  const losesSuperAdmin = target.role === "super_admin" && ((roleChange && role !== "super_admin") || (statusChange && status !== "active"));
  if (losesSuperAdmin && countOtherActiveSuperAdmins(target.id) === 0) {
    return adminError(409, "conflict", "This is the last active Super Admin; promote another account first.");
  }

  try {
    if (roleChange) {
      updateUserRole(id, role!);
      logAudit({ actorId: actor.id, action: "admin.update_role", target: id, details: { oldRole: target.role, newRole: role } });
    }
    if (statusChange) {
      updateUserStatus(id, status!);
      if (status === "suspended") deleteUserSessions(id);
      logAudit({ actorId: actor.id, action: "admin.update_status", target: id, details: { oldStatus: target.status, newStatus: status } });
    }
    if (password !== undefined) {
      updateUserPassword(id, password);
      deleteUserSessions(id); // revoke active sessions on password change
      logAudit({ actorId: actor.id, action: "admin.reset_password", target: id });
    }
    return Response.json({ ok: true, user: getSafeUserById(id), updated: roleChange || statusChange || password !== undefined });
  } catch (err) {
    console.error("Failed to update user:", err);
    return adminError(500, "server_error", "Failed to update user.");
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperAdmin();
  if (guard.denied) return guard.denied;
  const actor = guard.user;

  const { id } = await params;
  if (id === actor.id) {
    return adminError(400, "bad_request", "You cannot delete your own account.");
  }
  const target = getUserById(id);
  if (!target || target.status === "deleted") {
    return adminError(404, "not_found", "User not found.");
  }
  if (target.role === "super_admin" && countOtherActiveSuperAdmins(target.id) === 0) {
    return adminError(409, "conflict", "This is the last active Super Admin; promote another account first.");
  }

  try {
    softDeleteUser(id);
  } catch (err) {
    console.error("Failed to delete user:", err);
    return adminError(500, "server_error", "Failed to delete user.");
  }

  logAudit({
    actorId: actor.id,
    action: "admin.delete_user",
    target: id,
    details: { email: target.email, name: target.name, role: target.role, mode: "soft" },
  });

  return Response.json({ ok: true, message: "User deleted. Their payments and audit history are kept." });
}
