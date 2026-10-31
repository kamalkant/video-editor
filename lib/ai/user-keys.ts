import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/index";
import { encryptString, decryptString, maskSecretKey } from "../crypto/encryption";
import type { CredentialPolicy, UserApiCredential, AdminApiPool, UserApiAssignment, User } from "../db/schema";
import { PROVIDERS, type ProviderId } from "./providers";
import { logAudit } from "../db/audit";

const ENV_MAP: Record<ProviderId, string> = {
  gemini: "GEMINI_API_KEY",
  grok: "XAI_API_KEY",
  openai: "OPENAI_API_KEY",
  pexels: "PEXELS_API_KEY",
  pixabay: "PIXABAY_API_KEY",
};

/**
 * Lists the credentials configured personally by a user.
 */
export function listUserCredentials(userId: string): Array<{
  provider: ProviderId;
  hasKey: boolean;
  last4: string | null;
  enabled: boolean;
  source: "user";
}> {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM user_api_credentials WHERE user_id = ?").all(userId) as UserApiCredential[];
  const map = new Map(rows.map((r) => [r.provider, r]));

  return PROVIDERS.map((p) => {
    const cred = map.get(p.id);
    return {
      provider: p.id,
      // (a key that's switched off is still there: the settings say "Switched off", not "No key")
      hasKey: !!cred,
      last4: cred?.key_last4 || null,
      enabled: cred ? cred.is_enabled === 1 : false,
      source: "user" as const,
    };
  });
}

/**
 * Sets or updates a personal API key for a user.
 */
export function setUserCredential(userId: string, provider: ProviderId, rawKey: string): void {
  const db = getDb();
  const now = Date.now();
  const encrypted = encryptString(rawKey);
  const { last4 } = maskSecretKey(rawKey);

  db.prepare(`
    INSERT INTO user_api_credentials (id, user_id, provider, encrypted_key, key_last4, is_enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(user_id, provider) DO UPDATE SET
      encrypted_key = excluded.encrypted_key,
      key_last4 = excluded.key_last4,
      is_enabled = 1,
      updated_at = excluded.updated_at
  `).run(randomUUID(), userId, provider, encrypted, last4 || "none", now, now);

  logAudit({
    actorId: userId,
    action: "user_api_key.saved",
    target: provider,
    details: { provider, last4 },
  });
}

/**
 * Removes a personal API key for a user.
 */
export function removeUserCredential(userId: string, provider: ProviderId): boolean {
  const db = getDb();
  const res = db.prepare("DELETE FROM user_api_credentials WHERE user_id = ? AND provider = ?").run(userId, provider);

  logAudit({
    actorId: userId,
    action: "user_api_key.removed",
    target: provider,
    details: { provider },
  });

  return res.changes > 0;
}

/**
 * Toggle enable/disable on a user's key.
 */
export function setUserCredentialEnabled(userId: string, provider: ProviderId, enabled: boolean): boolean {
  const db = getDb();
  const res = db.prepare(`
    UPDATE user_api_credentials 
    SET is_enabled = ?, updated_at = ?
    WHERE user_id = ? AND provider = ?
  `).run(enabled ? 1 : 0, Date.now(), userId, provider);
  return res.changes > 0;
}

// ==========================================
// Super Admin API Pools & Assignments
// ==========================================

export function createAdminPool(params: {
  name: string;
  provider: ProviderId;
  rawKey: string;
  allowedModels?: string[];
  maxMonthlySpendCents?: number;
  createdBy: string;
}): AdminApiPool {
  const db = getDb();
  const id = "pool_" + randomUUID().slice(0, 8);
  const now = Date.now();
  const encrypted = encryptString(params.rawKey);
  const { last4 } = maskSecretKey(params.rawKey);

  db.prepare(`
    INSERT INTO admin_api_pools (
      id, name, provider, encrypted_key, key_last4, allowed_models,
      max_monthly_spend_cents, is_active, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).run(
    id,
    params.name,
    params.provider,
    encrypted,
    last4 || "none",
    JSON.stringify(params.allowedModels || []),
    params.maxMonthlySpendCents || 0,
    params.createdBy,
    now,
    now
  );

  logAudit({
    actorId: params.createdBy,
    action: "admin_api_pool.created",
    target: id,
    details: { name: params.name, provider: params.provider, last4 },
  });

  return db.prepare("SELECT * FROM admin_api_pools WHERE id = ?").get(id) as AdminApiPool;
}

export function listAdminPools(): Array<Omit<AdminApiPool, "encrypted_key">> {
  const db = getDb();
  return db.prepare(`
    SELECT id, name, provider, key_last4, allowed_models, max_monthly_spend_cents, is_active, created_by, created_at, updated_at
    FROM admin_api_pools
    ORDER BY created_at DESC
  `).all() as Array<Omit<AdminApiPool, "encrypted_key">>;
}

export function deleteAdminPool(poolId: string, actorId: string): boolean {
  const db = getDb();
  const res = db.prepare("DELETE FROM admin_api_pools WHERE id = ?").run(poolId);
  logAudit({
    actorId,
    action: "admin_api_pool.deleted",
    target: poolId,
  });
  return res.changes > 0;
}

export function assignPoolToUser(params: {
  poolId: string;
  userId: string;
  policy?: CredentialPolicy;
  expiresAt?: number | null;
  assignedBy: string;
}): UserApiAssignment {
  const db = getDb();
  const now = Date.now();
  const id = "assign_" + randomUUID().slice(0, 8);
  const policy = params.policy || "USER_FIRST";

  db.prepare(`
    INSERT INTO user_api_assignments (
      id, pool_id, user_id, policy, status, expires_at, assigned_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)
    ON CONFLICT(pool_id, user_id) DO UPDATE SET
      policy = excluded.policy,
      status = 'active',
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
  `).run(id, params.poolId, params.userId, policy, params.expiresAt ?? null, params.assignedBy, now, now);

  logAudit({
    actorId: params.assignedBy,
    action: "api_pool.assigned",
    target: params.userId,
    details: { poolId: params.poolId, policy, expiresAt: params.expiresAt },
  });

  return db.prepare("SELECT * FROM user_api_assignments WHERE pool_id = ? AND user_id = ?").get(params.poolId, params.userId) as UserApiAssignment;
}

export function listUserAssignments(userId: string): Array<{
  assignmentId: string;
  poolId: string;
  poolName: string;
  provider: ProviderId;
  policy: CredentialPolicy;
  status: string;
  expiresAt: number | null;
}> {
  const db = getDb();
  return db.prepare(`
    SELECT 
      a.id as assignmentId,
      a.pool_id as poolId,
      p.name as poolName,
      p.provider as provider,
      a.policy,
      a.status,
      a.expires_at as expiresAt
    FROM user_api_assignments a
    JOIN admin_api_pools p ON a.pool_id = p.id
    WHERE a.user_id = ? AND a.status = 'active' AND p.is_active = 1
  `).all(userId) as any;
}

export function revokeUserAssignment(assignmentId: string, actorId: string): boolean {
  const db = getDb();
  const res = db.prepare("UPDATE user_api_assignments SET status = 'revoked', updated_at = ? WHERE id = ?").run(Date.now(), assignmentId);
  logAudit({
    actorId,
    action: "api_pool.revoked",
    target: assignmentId,
  });
  return res.changes > 0;
}

// ==========================================
// Key Resolution Engine (Isolated & Safe)
// ==========================================

export async function resolveAiKey(
  userId: string | null,
  provider: ProviderId
): Promise<{
  key: string | null;
  source: "user" | "assigned" | "env_super_admin" | "credits";
  policy: CredentialPolicy;
}> {
  const db = getDb();

  // If no user is logged in, no credentials
  if (!userId) {
    return { key: null, source: "credits", policy: "USER_FIRST" };
  }

  // Get user role
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as User | undefined;
  const isSuperAdmin = user?.role === "super_admin";

  // Check if user has an active assignment for this provider
  const assigned = db.prepare(`
    SELECT a.*, p.encrypted_key, p.is_active as pool_active
    FROM user_api_assignments a
    JOIN admin_api_pools p ON a.pool_id = p.id
    WHERE a.user_id = ? AND p.provider = ? AND a.status = 'active' AND p.is_active = 1
    AND (a.expires_at IS NULL OR a.expires_at > ?)
    LIMIT 1
  `).get(userId, provider, Date.now()) as (UserApiAssignment & { encrypted_key: string; pool_active: number }) | undefined;

  const policy: CredentialPolicy = assigned?.policy || "USER_FIRST";

  // Check if user has a personal key
  const personal = db.prepare(`
    SELECT * FROM user_api_credentials
    WHERE user_id = ? AND provider = ? AND is_enabled = 1
  `).get(userId, provider) as UserApiCredential | undefined;

  const decryptedPersonal = personal?.encrypted_key ? decryptString(personal.encrypted_key) : null;
  const decryptedAssigned = assigned?.encrypted_key ? decryptString(assigned.encrypted_key) : null;

  // Resolve according to policy:
  if (policy === "USER_KEY_ONLY") {
    if (decryptedPersonal) return { key: decryptedPersonal, source: "user", policy };
    return { key: null, source: "credits", policy };
  }

  if (policy === "ADMIN_ASSIGNED_ONLY") {
    if (decryptedAssigned) return { key: decryptedAssigned, source: "assigned", policy };
    return { key: null, source: "credits", policy };
  }

  if (policy === "ADMIN_FIRST") {
    if (decryptedAssigned) return { key: decryptedAssigned, source: "assigned", policy };
    if (decryptedPersonal) return { key: decryptedPersonal, source: "user", policy };
  } else {
    // Default: USER_FIRST
    if (decryptedPersonal) return { key: decryptedPersonal, source: "user", policy };
    if (decryptedAssigned) return { key: decryptedAssigned, source: "assigned", policy };
  }

  // Super Admin exception: Only Super Admin can fall back to .env.local
  if (isSuperAdmin) {
    const envKey = process.env[ENV_MAP[provider]]?.trim() || null;
    if (envKey) return { key: envKey, source: "env_super_admin", policy };
  }

  // Standard users NEVER get .env.local keys. They fall back to platform credits.
  return { key: null, source: "credits", policy };
}
