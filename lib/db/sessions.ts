import { randomBytes, randomUUID } from "node:crypto";
import { getDb } from "./index";
import type { SafeUser, Session, User } from "./schema";
import { toSafeUser } from "./users";

// Default session lifespan: 30 days
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export function createSession(userId: string, durationMs: number = SESSION_DURATION_MS): Session {
  const db = getDb();
  const id = randomUUID();
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  const expiresAt = now + durationMs;

  const stmt = db.prepare(`
    INSERT INTO sessions (id, user_id, token, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(id, userId, token, expiresAt, now);

  return {
    id,
    user_id: userId,
    token,
    expires_at: expiresAt,
    created_at: now,
  };
}

export function getSessionWithUser(token: string): { session: Session; user: SafeUser } | null {
  if (!token || typeof token !== "string") return null;

  const db = getDb();
  const now = Date.now();

  const stmt = db.prepare(`
    SELECT 
      s.id as session_id,
      s.user_id,
      s.token,
      s.expires_at,
      s.created_at as session_created_at,
      u.*
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > ?
    LIMIT 1
  `);

  const row = stmt.get(token, now) as (User & {
    session_id: string;
    user_id: string;
    token: string;
    expires_at: number;
    session_created_at: number;
  }) | undefined;

  if (!row) return null;

  // If user is suspended, session is invalid
  if (row.status !== "active") return null;

  const session: Session = {
    id: row.session_id,
    user_id: row.user_id,
    token: row.token,
    expires_at: row.expires_at,
    created_at: row.session_created_at,
  };

  // (the user goes to the browser as it is, GET /api/auth/me: never with the session's token)
  const user = { ...row } as Partial<typeof row>;
  for (const k of ["session_id", "user_id", "token", "expires_at", "session_created_at"] as const) delete user[k];
  return { session, user: toSafeUser(user as User) };
}

export function deleteSession(token: string): boolean {
  if (!token) return false;
  const db = getDb();
  try {
    db.prepare("UPDATE devices SET is_revoked = 1 WHERE session_token = ?").run(token);
  } catch {
    // ignore if devices table not ready
  }
  const stmt = db.prepare("DELETE FROM sessions WHERE token = ?");
  const res = stmt.run(token);
  return res.changes > 0;
}

/** Signs the user out everywhere except the session `keepToken` (after they change their password). */
export function deleteOtherUserSessions(userId: string, keepToken: string): number {
  const db = getDb();
  try {
    db.prepare("UPDATE devices SET is_revoked = 1 WHERE user_id = ? AND session_token != ?").run(userId, keepToken);
  } catch {
    // ignore if devices table not ready
  }
  return Number(db.prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?").run(userId, keepToken).changes);
}

export function deleteUserSessions(userId: string): boolean {
  const db = getDb();
  try {
    db.prepare("UPDATE devices SET is_revoked = 1 WHERE user_id = ?").run(userId);
  } catch {
    // ignore if devices table not ready
  }
  const stmt = db.prepare("DELETE FROM sessions WHERE user_id = ?");
  const res = stmt.run(userId);
  return res.changes > 0;
}

export function cleanupExpiredSessions(): void {
  const db = getDb();
  const now = Date.now();
  try {
    db.prepare(`
      UPDATE devices SET is_revoked = 1 
      WHERE session_token IN (SELECT token FROM sessions WHERE expires_at <= ?)
    `).run(now);
  } catch {
    // ignore if devices table not ready
  }
  const stmt = db.prepare("DELETE FROM sessions WHERE expires_at <= ?");
  stmt.run(now);
}

export const deleteSessionsForUser = deleteUserSessions;

