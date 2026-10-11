import { getDb } from "./index";
import type { FeatureFlag, ParsedFeatureFlag, UserRole } from "./schema";

export function parseFeatureFlag(row: FeatureFlag): ParsedFeatureFlag {
  let allowedRoles: UserRole[] = ["super_admin", "admin", "user"];
  try {
    const parsed = JSON.parse(row.allowed_roles);
    if (Array.isArray(parsed)) allowedRoles = parsed as UserRole[];
  } catch {
    // fallback default
  }

  return {
    tool_id: row.tool_id,
    title: row.title,
    description: row.description,
    enabled_global: Boolean(row.enabled_global),
    allowed_roles: allowedRoles,
    updated_at: row.updated_at,
    updated_by: row.updated_by,
  };
}

export function getAllFeatureFlags(): ParsedFeatureFlag[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM feature_flags ORDER BY tool_id ASC").all() as FeatureFlag[];
  return rows.map(parseFeatureFlag);
}

export function getFeatureFlag(toolId: string): ParsedFeatureFlag | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM feature_flags WHERE tool_id = ?").get(toolId) as FeatureFlag | undefined;
  return row ? parseFeatureFlag(row) : null;
}

export function updateFeatureFlag(
  toolId: string,
  data: {
    enabled_global?: boolean;
    allowed_roles?: UserRole[];
    updated_by?: string;
  }
): ParsedFeatureFlag | null {
  const db = getDb();
  const current = getFeatureFlag(toolId);
  if (!current) return null;

  const enabledGlobal = data.enabled_global !== undefined ? (data.enabled_global ? 1 : 0) : current.enabled_global ? 1 : 0;
  const allowedRoles = data.allowed_roles ? JSON.stringify(data.allowed_roles) : JSON.stringify(current.allowed_roles);
  const now = Date.now();
  const updatedBy = data.updated_by ?? "admin";

  const stmt = db.prepare(`
    UPDATE feature_flags
    SET enabled_global = ?, allowed_roles = ?, updated_at = ?, updated_by = ?
    WHERE tool_id = ?
  `);

  stmt.run(enabledGlobal, allowedRoles, now, updatedBy, toolId);

  return getFeatureFlag(toolId);
}

/**
 * Checks if a specific tool is enabled for a given user role.
 * Super admins can bypass role restrictions, but global feature disable is respected unless overridden.
 */
export function isToolEnabledForRole(toolId: string, role?: UserRole | null): boolean {
  const flag = getFeatureFlag(toolId);
  if (!flag) return true; // If flag doesn't exist, default to open

  // If globally disabled, no regular user or admin can use it
  if (!flag.enabled_global) {
    // Only super_admin can preview/test globally disabled tools
    return role === "super_admin";
  }

  // If no role provided (guest user)
  if (!role) {
    // Only available to guests if 'user' role is allowed
    return flag.allowed_roles.includes("user");
  }

  if (role === "super_admin") return true;

  return flag.allowed_roles.includes(role);
}

/**
 * Computes a dictionary of toolId -> boolean for a specific user role.
 */
export function getComputedFeaturesForRole(role?: UserRole | null): Record<string, boolean> {
  const allFlags = getAllFeatureFlags();
  const features: Record<string, boolean> = {};

  for (const flag of allFlags) {
    if (!flag.enabled_global) {
      features[flag.tool_id] = role === "super_admin";
    } else if (!role) {
      features[flag.tool_id] = flag.allowed_roles.includes("user");
    } else if (role === "super_admin") {
      features[flag.tool_id] = true;
    } else {
      features[flag.tool_id] = flag.allowed_roles.includes(role);
    }
  }

  return features;
}

/**
 * Returns all explicit feature overrides configured for a specific user.
 */
export function getUserFeatureOverrides(userId: string): Record<string, boolean> {
  const db = getDb();
  const rows = db.prepare("SELECT tool_id, enabled FROM user_feature_overrides WHERE user_id = ?").all(userId) as Array<{
    tool_id: string;
    enabled: number;
  }>;

  const overrides: Record<string, boolean> = {};
  for (const r of rows) {
    overrides[r.tool_id] = Boolean(r.enabled);
  }
  return overrides;
}

/**
 * Sets or removes an explicit tool override for a specific user.
 * Passing enabled = null removes the override, reverting to the user's role default.
 */
export function setUserFeatureOverride(
  userId: string,
  toolId: string,
  enabled: boolean | null,
  updatedBy: string = "admin"
): void {
  const db = getDb();
  if (enabled === null) {
    const stmt = db.prepare("DELETE FROM user_feature_overrides WHERE user_id = ? AND tool_id = ?");
    stmt.run(userId, toolId);
    return;
  }

  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO user_feature_overrides (user_id, tool_id, enabled, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, tool_id) DO UPDATE SET
      enabled = excluded.enabled,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `);

  stmt.run(userId, toolId, enabled ? 1 : 0, now, updatedBy);
}

/**
 * Checks if a specific tool is enabled for a specific user, considering user-level overrides.
 */
export function isToolEnabledForUser(toolId: string, user?: { id: string; role: UserRole } | null): boolean {
  const flag = getFeatureFlag(toolId);
  if (!flag) return true;

  if (!flag.enabled_global) {
    return user?.role === "super_admin";
  }

  if (user) {
    const overrides = getUserFeatureOverrides(user.id);
    if (overrides[toolId] !== undefined) {
      return overrides[toolId];
    }
  }

  return isToolEnabledForRole(toolId, user ? user.role : null);
}

/**
 * Computes a dictionary of toolId -> boolean personalized for a specific user.
 */
export function getComputedFeaturesForUser(user?: { id: string; role: UserRole } | null): Record<string, boolean> {
  const allFlags = getAllFeatureFlags();
  const overrides = user ? getUserFeatureOverrides(user.id) : {};
  const features: Record<string, boolean> = {};

  for (const flag of allFlags) {
    if (!flag.enabled_global) {
      features[flag.tool_id] = user?.role === "super_admin";
    } else if (overrides[flag.tool_id] !== undefined) {
      features[flag.tool_id] = overrides[flag.tool_id];
    } else if (!user) {
      features[flag.tool_id] = flag.allowed_roles.includes("user");
    } else if (user.role === "super_admin") {
      features[flag.tool_id] = true;
    } else {
      features[flag.tool_id] = flag.allowed_roles.includes(user.role);
    }
  }

  return features;
}

