import { randomUUID } from "node:crypto";
import { getDb } from "./index";
import type { AuditLog } from "./schema";

export function logAudit(data: {
  actorId?: string | null;
  action: string;
  target?: string | null;
  details?: Record<string, unknown> | string | null;
}): void {
  try {
    const db = getDb();
    const id = randomUUID();
    const now = Date.now();
    const detailsStr = typeof data.details === "object" && data.details !== null ? JSON.stringify(data.details) : (data.details ?? null);

    const stmt = db.prepare(`
      INSERT INTO audit_logs (id, actor_id, action, target, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, data.actorId ?? null, data.action, data.target ?? null, detailsStr, now);
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}

export type AuditLogFilter = {
  q?: string; // free text over action, target, actor name/email and details
  action?: string; // exact action, or a prefix ending in "." (e.g. "payout.")
  actorId?: string;
  subject?: string; // a user: what they did, or what was done to them (actor or target)
  from?: number; // epoch ms, inclusive
  to?: number; // epoch ms, inclusive
};

const likeEscape = (v: string) => v.replace(/[\\%_]/g, (c) => "\\" + c);

export function listAuditLogs(limit = 50, offset = 0, filter: AuditLogFilter = {}): { logs: AuditLog[]; total: number } {
  const db = getDb();
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (filter.q?.trim()) {
    const like = `%${likeEscape(filter.q.trim().toLowerCase())}%`;
    conditions.push(
      "(LOWER(a.action) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(a.target, '')) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(a.details, '')) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(u.name, '')) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(u.email, '')) LIKE ? ESCAPE '\\')"
    );
    params.push(like, like, like, like, like);
  }
  if (filter.action) {
    if (filter.action.endsWith(".")) {
      conditions.push("a.action LIKE ? ESCAPE '\\'");
      params.push(`${likeEscape(filter.action)}%`);
    } else {
      conditions.push("a.action = ?");
      params.push(filter.action);
    }
  }
  if (filter.actorId) {
    conditions.push("a.actor_id = ?");
    params.push(filter.actorId);
  }
  if (filter.subject) {
    conditions.push("(a.actor_id = ? OR a.target = ?)");
    params.push(filter.subject, filter.subject);
  }
  if (filter.from !== undefined) {
    conditions.push("a.created_at >= ?");
    params.push(filter.from);
  }
  if (filter.to !== undefined) {
    conditions.push("a.created_at <= ?");
    params.push(filter.to);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRow = db
    .prepare(`SELECT COUNT(*) as count FROM audit_logs a LEFT JOIN users u ON a.actor_id = u.id ${where}`)
    .get(...params) as { count: number };
  const total = countRow?.count ?? 0;

  const rows = db.prepare(`
    SELECT a.*, u.email as actor_email, u.name as actor_name
    FROM audit_logs a
    LEFT JOIN users u ON a.actor_id = u.id
    ${where}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as Array<AuditLog & { actor_email?: string; actor_name?: string }>;

  return { logs: rows, total };
}
