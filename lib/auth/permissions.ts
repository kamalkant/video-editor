import type { SafeUser, UserRole } from "@/lib/db/schema";
import { isToolEnabledForRole } from "@/lib/db/features";

export function isAdmin(user: SafeUser | null): boolean {
  if (!user) return false;
  return user.role === "admin" || user.role === "super_admin";
}

export function isSuperAdmin(user: SafeUser | null): boolean {
  if (!user) return false;
  return user.role === "super_admin";
}

export function canAccessTool(user: SafeUser | null, toolId: string): boolean {
  return isToolEnabledForRole(toolId, user ? user.role : null);
}

export function checkRoleHierarchy(currentRole: UserRole, targetRole: UserRole): boolean {
  const levels: Record<UserRole, number> = {
    super_admin: 3,
    admin: 2,
    user: 1,
  };
  return levels[currentRole] >= levels[targetRole];
}
