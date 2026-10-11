import type { SafeUser, UserRole } from "@/lib/db/schema";
import { isSuperAdmin } from "@/lib/auth/permissions";

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Who may manage whom. A super admin manages every account; a plain admin manages only
 * regular users (never peers: resetting another admin's password would be a takeover).
 */
export function canManageUser(actor: SafeUser, target: { role: UserRole }): boolean {
  if (isSuperAdmin(actor)) return true;
  return target.role === "user";
}

/** Roles the actor may hand out: plain admins cannot grant any staff role. */
export function canGrantRole(actor: SafeUser, role: UserRole): boolean {
  if (isSuperAdmin(actor)) return true;
  return role === "user";
}
