import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "@/lib/auth/passwords";
import { getDb } from "./index";
import type { SafeUser, User, UserIdentity, UserRole, UserStatus } from "./schema";

export function toSafeUser(user: User): SafeUser {
  const { password_hash, password_salt, ...safe } = user;
  return safe;
}

export function createUser(data: {
  email?: string | null;
  name: string;
  password?: string | null;
  role?: UserRole;
  status?: UserStatus;
  emailVerified?: boolean;
  phoneNumber?: string | null;
  phoneVerified?: boolean;
}): SafeUser {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  const cleanEmail = data.email ? data.email.trim().toLowerCase() : null;
  const cleanName = data.name.trim();
  const role: UserRole = data.role ?? "user";
  const status: UserStatus = data.status ?? "active";
  const emailVerified = data.emailVerified ? now : 0;
  const cleanPhone = data.phoneNumber ? data.phoneNumber.trim() : null;
  const phoneVerified = data.phoneVerified ? now : 0;

  let hash = "";
  let salt = "";
  if (data.password) {
    const res = hashPassword(data.password);
    hash = res.hash;
    salt = res.salt;
  }

  const stmt = db.prepare(`
    INSERT INTO users (
      id, email, name, password_hash, password_salt, role, status,
      created_at, updated_at, email_verified, phone_number, phone_verified
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    cleanEmail,
    cleanName,
    hash,
    salt,
    role,
    status,
    now,
    now,
    emailVerified,
    cleanPhone,
    phoneVerified
  );

  return {
    id,
    email: cleanEmail,
    name: cleanName,
    role,
    status,
    created_at: now,
    updated_at: now,
    last_login_at: null,
    email_verified: emailVerified,
    phone_number: cleanPhone,
    phone_verified: phoneVerified,
    must_change_password: 0,
  };
}

export function getUserByEmail(email: string): User | null {
  if (!email) return null;
  const db = getDb();
  const cleanEmail = email.trim().toLowerCase();
  const stmt = db.prepare("SELECT * FROM users WHERE email = ? LIMIT 1");
  const row = stmt.get(cleanEmail) as User | undefined;
  return row ?? null;
}

export function getUserByPhone(phone: string): User | null {
  if (!phone) return null;
  const db = getDb();
  const cleanPhone = phone.trim();
  const stmt = db.prepare("SELECT * FROM users WHERE phone_number = ? LIMIT 1");
  const row = stmt.get(cleanPhone) as User | undefined;
  return row ?? null;
}

export function getUserById(id: string): User | null {
  if (!id) return null;
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM users WHERE id = ? LIMIT 1");
  const row = stmt.get(id) as User | undefined;
  return row ?? null;
}

export function getSafeUserById(id: string): SafeUser | null {
  const user = getUserById(id);
  return user ? toSafeUser(user) : null;
}

export function getUserByIdentity(provider: "google" | "email" | "phone", providerUserId: string): User | null {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT u.* FROM users u
    JOIN user_identities i ON u.id = i.user_id
    WHERE i.provider = ? AND i.provider_user_id = ?
    LIMIT 1
  `);
  const row = stmt.get(provider, providerUserId) as User | undefined;
  return row ?? null;
}

export function linkIdentity(userId: string, provider: "google" | "email" | "phone", providerUserId: string): void {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO user_identities (id, user_id, provider, provider_user_id, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(provider, provider_user_id) DO UPDATE SET user_id = excluded.user_id
  `);
  stmt.run(id, userId, provider, providerUserId, now);
}

export function getUserIdentities(userId: string): UserIdentity[] {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM user_identities WHERE user_id = ?");
  return stmt.all(userId) as UserIdentity[];
}

export function setEmailVerified(userId: string): void {
  const db = getDb();
  const now = Date.now();
  const stmt = db.prepare("UPDATE users SET email_verified = ?, updated_at = ? WHERE id = ?");
  stmt.run(now, now, userId);
}

export function setPhoneVerified(userId: string, phoneNumber: string): void {
  const db = getDb();
  const now = Date.now();
  const cleanPhone = phoneNumber.trim();
  const stmt = db.prepare("UPDATE users SET phone_number = ?, phone_verified = ?, updated_at = ? WHERE id = ?");
  stmt.run(cleanPhone, now, now, userId);
}

export function listUsers(opts: {
  search?: string;
  role?: UserRole | "all";
  status?: UserStatus | "all";
  limit?: number;
  offset?: number;
} = {}): { users: SafeUser[]; total: number } {
  const db = getDb();
  const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
  const offset = Math.max(0, opts.offset ?? 0);
  const search = opts.search?.trim().toLowerCase() ?? "";

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (search) {
    conditions.push("(email LIKE ? OR name LIKE ? OR phone_number LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (opts.role && opts.role !== "all") {
    conditions.push("role = ?");
    params.push(opts.role);
  }

  if (opts.status && opts.status !== "all") {
    conditions.push("status = ?");
    params.push(opts.status);
  } else {
    // soft-deleted accounts only show up when asked for explicitly
    conditions.push("status != 'deleted'");
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countStmt = db.prepare(`SELECT COUNT(*) as count FROM users ${whereClause}`);
  const totalRow = countStmt.get(...params) as { count: number } | undefined;
  const total = totalRow?.count ?? 0;

  const listStmt = db.prepare(`
    SELECT id, email, name, role, status, created_at, updated_at, last_login_at, email_verified, phone_number, phone_verified
    FROM users
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `);

  const rows = listStmt.all(...params, limit, offset) as SafeUser[];

  return { users: rows, total };
}

export function updateUserRole(id: string, role: UserRole): SafeUser | null {
  const db = getDb();
  const now = Date.now();
  const stmt = db.prepare("UPDATE users SET role = ?, updated_at = ? WHERE id = ?");
  stmt.run(role, now, id);
  return getSafeUserById(id);
}

export function updateUserStatus(id: string, status: UserStatus): SafeUser | null {
  const db = getDb();
  const now = Date.now();
  const stmt = db.prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ?");
  stmt.run(status, now, id);
  return getSafeUserById(id);
}

export function updateUserPassword(id: string, newPass: string): boolean {
  const db = getDb();
  const now = Date.now();
  const { hash, salt } = hashPassword(newPass);
  const stmt = db.prepare("UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0, updated_at = ? WHERE id = ?");
  const res = stmt.run(hash, salt, now, id);
  return res.changes > 0;
}

export function updateLastLogin(id: string): void {
  const db = getDb();
  const now = Date.now();
  const stmt = db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?");
  stmt.run(now, id);
}

/** Active super admins other than `exceptId` (to refuse demoting/suspending/deleting the last one). */
export function countOtherActiveSuperAdmins(exceptId: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) as count FROM users WHERE role = 'super_admin' AND status = 'active' AND id != ?")
    .get(exceptId) as { count: number };
  return row.count;
}

/**
 * Soft delete: the account can never sign in again and its personal data is scrubbed
 * (email/name/phone/password, sessions, linked logins, devices, stored API keys), but
 * payments, refunds, subscriptions, coupon redemptions and audit history are kept, so
 * revenue and the financial trail stay intact. The original email becomes free to reuse.
 */
export function softDeleteUser(id: string): boolean {
  const db = getDb();
  const now = Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    const res = db
      .prepare(`
        UPDATE users
        SET status = 'deleted', email = ?, name = 'Deleted user', password_hash = ?, password_salt = ?,
            phone_number = NULL, phone_verified = 0, email_verified = 0, updated_at = ?
        WHERE id = ? AND status != 'deleted'
      `)
      .run(`deleted+${id}@deleted.invalid`, randomBytes(32).toString("hex"), randomBytes(16).toString("hex"), now, id);
    if (res.changes !== 1) {
      db.exec("ROLLBACK");
      return false;
    }
    for (const table of ["sessions", "user_identities", "auth_tokens", "devices", "user_api_credentials"]) {
      db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(id);
    }
    db.prepare(`
      UPDATE subscriptions SET status = 'cancelled', cancelled_at = ?, updated_at = ?
      WHERE user_id = ? AND status IN ('active', 'trialing', 'grace_period', 'past_due')
    `).run(now, now, id);
    db.exec("COMMIT");
    return true;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw err;
  }
}

export function deleteUser(id: string): boolean {
  const db = getDb();
  const stmt = db.prepare("DELETE FROM users WHERE id = ?");
  const res = stmt.run(id);
  return res.changes > 0;
}

export function getUserStats(): {
  total: number;
  active: number;
  suspended: number;
  superAdmins: number;
  admins: number;
  users: number;
} {
  const db = getDb();
  const rows = db.prepare("SELECT role, status, count(*) as count FROM users GROUP BY role, status").all() as Array<{
    role: UserRole;
    status: UserStatus;
    count: number;
  }>;

  let total = 0;
  let active = 0;
  let suspended = 0;
  let superAdmins = 0;
  let admins = 0;
  let users = 0;

  for (const r of rows) {
    if (r.status === "deleted") continue; // soft-deleted accounts are not users any more
    total += r.count;
    if (r.status === "active") active += r.count;
    if (r.status === "suspended") suspended += r.count;

    if (r.role === "super_admin") superAdmins += r.count;
    else if (r.role === "admin") admins += r.count;
    else users += r.count;
  }

  return { total, active, suspended, superAdmins, admins, users };
}
