import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getDb } from "./index";
import type { AuthToken } from "./schema";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createAuthToken(
  userId: string,
  type: "email_verify" | "password_reset",
  durationMs: number = 24 * 60 * 60 * 1000 // 24 hours default for email verify, 1 hour for password reset
): string {
  const db = getDb();
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const id = randomUUID();
  const now = Date.now();
  const expiresAt = now + durationMs;

  // Invalidate any existing unused tokens of the same type for this user
  const delStmt = db.prepare("DELETE FROM auth_tokens WHERE user_id = ? AND type = ?");
  delStmt.run(userId, type);

  const stmt = db.prepare(`
    INSERT INTO auth_tokens (id, user_id, token_hash, type, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, userId, tokenHash, type, expiresAt, now);

  return rawToken;
}

export function verifyAuthToken(
  token: string,
  type: "email_verify" | "password_reset"
): AuthToken | null {
  if (!token || typeof token !== "string") return null;

  const db = getDb();
  const tokenHash = hashToken(token.trim());
  const now = Date.now();

  const stmt = db.prepare(`
    SELECT * FROM auth_tokens
    WHERE token_hash = ? AND type = ? AND expires_at > ?
    LIMIT 1
  `);
  const row = stmt.get(tokenHash, type, now) as AuthToken | undefined;
  return row ?? null;
}

export function consumeAuthToken(
  token: string,
  type: "email_verify" | "password_reset"
): string | null {
  const record = verifyAuthToken(token, type);
  if (!record) return null;

  const db = getDb();
  const delStmt = db.prepare("DELETE FROM auth_tokens WHERE id = ?");
  delStmt.run(record.id);

  return record.user_id;
}

export function deleteAuthTokensForUser(userId: string, type?: "email_verify" | "password_reset"): void {
  const db = getDb();
  if (type) {
    db.prepare("DELETE FROM auth_tokens WHERE user_id = ? AND type = ?").run(userId, type);
  } else {
    db.prepare("DELETE FROM auth_tokens WHERE user_id = ?").run(userId);
  }
}
