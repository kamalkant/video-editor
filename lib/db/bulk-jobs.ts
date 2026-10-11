import { assignPoolToUser, revokeUserAssignment } from "../ai/user-keys";
import { setUserDeviceOverride } from "./devices";
import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "./index";
import type { BulkJob, BulkJobStatus, BulkJobType } from "./schema";
import { grantAICredits } from "./ai-credits";
import { logAudit } from "./audit";

export function createBulkJob(data: {
  type: BulkJobType;
  targetUserIds: string[];
  payload: Record<string, any>;
  batchSize?: number;
  createdBy?: string | null;
}): BulkJob {
  const db = getDb();
  const id = "job_" + randomUUID().slice(0, 8);
  const now = Date.now();
  const batchSize = data.batchSize ?? 50;

  const fullPayload = {
    ...data.payload,
    targetUserIds: data.targetUserIds,
  };

  const stmt = db.prepare(`
    INSERT INTO bulk_jobs (
      id, type, status, total_items, processed_items, successful_items,
      failed_items, batch_size, payload, results, error_log, created_by,
      created_at, updated_at
    ) VALUES (?, ?, 'pending', ?, 0, 0, 0, ?, ?, NULL, NULL, ?, ?, ?)
  `);

  stmt.run(
    id,
    data.type,
    data.targetUserIds.length,
    batchSize,
    JSON.stringify(fullPayload),
    data.createdBy ?? null,
    now,
    now
  );

  logAudit({
    actorId: data.createdBy ?? null,
    action: "bulk_job.created",
    target: id,
    details: { type: data.type, totalItems: data.targetUserIds.length },
  });

  return getBulkJobById(id)!;
}

export function getBulkJobById(id: string): BulkJob | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM bulk_jobs WHERE id = ?").get(id) as BulkJob | undefined;
  return row ?? null;
}

export function listBulkJobs(limit = 50): BulkJob[] {
  const db = getDb();
  return db.prepare("SELECT * FROM bulk_jobs ORDER BY created_at DESC LIMIT ?").all(limit) as BulkJob[];
}

export async function processBulkJobBatch(jobId: string, customChunkSize?: number): Promise<BulkJob | null> {
  const job = getBulkJobById(jobId);
  if (!job || job.status === "completed" || job.status === "failed") return job;

  const db = getDb();
  const now = Date.now();
  const payload = JSON.parse(job.payload);
  const userIds: string[] = payload.targetUserIds || [];
  const chunkSize = customChunkSize || job.batch_size || 50;

  const startIndex = job.processed_items;
  const chunk = userIds.slice(startIndex, startIndex + chunkSize);

  if (chunk.length === 0) {
    db.prepare("UPDATE bulk_jobs SET status = 'completed', updated_at = ? WHERE id = ?").run(now, jobId);
    return getBulkJobById(jobId);
  }

  // Claim this chunk atomically: only the caller that advances processed_items from the value it
  // read gets to run it. A second tab / auto-loop racing on the same job gets nothing to do, so
  // no user is credited (or logged out, or notified) twice.
  const claim = db
    .prepare(
      "UPDATE bulk_jobs SET status = 'running', processed_items = ?, updated_at = ? WHERE id = ? AND processed_items = ? AND status IN ('pending', 'running', 'paused')"
    )
    .run(startIndex + chunk.length, now, jobId, startIndex);
  if (claim.changes !== 1) return getBulkJobById(jobId);

  let successCount = 0;
  let failCount = 0;
  const chunkErrors: Array<{ userId: string; error: string }> = [];

  for (const uid of chunk) {
    try {
      if (job.type === "ai_credit_grant") {
        const amount = Number(payload.amount) || 0;
        const reason = payload.reason || "Bulk administrative grant";
        grantAICredits(uid, amount, reason, jobId);
        successCount++;
      } else if (job.type === "force_logout") {
        db.prepare("DELETE FROM sessions WHERE user_id = ?").run(uid);
        db.prepare("UPDATE devices SET is_revoked = 1 WHERE user_id = ?").run(uid);
        successCount++;
      } else if (job.type === "user_status") {
        const newStatus = payload.status === "suspended" ? "suspended" : "active";
        db.prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ?").run(newStatus, now, uid);
        successCount++;
      } else if (job.type === "notification_broadcast") {
        const nId = "notif_" + randomUUID().slice(0, 8);
        db.prepare(`
          INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
          VALUES (?, ?, ?, ?, ?, 0, ?)
        `).run(nId, uid, payload.title || "Announcement", payload.message || "", payload.type || "system", now);
        successCount++;
      } else if ((job.type as any) === "ai_assignment_grant") {
        if (!payload.poolId) throw new Error("Missing poolId for AI assignment");
        assignPoolToUser({
          poolId: payload.poolId,
          userId: uid,
          policy: payload.policy || "USER_FIRST",
          expiresAt: payload.expiresAt ? Number(payload.expiresAt) : null,
          assignedBy: job.created_by || "system",
        });
        successCount++;
      } else if ((job.type as any) === "ai_assignment_revoke") {
        db.prepare("UPDATE user_api_assignments SET status = 'revoked', updated_at = ? WHERE user_id = ?").run(now, uid);
        successCount++;
      } else if ((job.type as any) === "device_revoke_all") {
        db.prepare("UPDATE devices SET is_revoked = 1 WHERE user_id = ?").run(uid);
        db.prepare("DELETE FROM sessions WHERE user_id = ?").run(uid);
        successCount++;
      } else if ((job.type as any) === "user_device_override") {
        setUserDeviceOverride({
          userId: uid,
          maxDevices: Number(payload.maxDevices) || 2,
          reason: payload.reason || "Bulk administrative override",
          updatedBy: job.created_by,
        });
        successCount++;
      } else {
        // never report work that was not done
        throw new Error(`Unsupported job type: ${job.type}`);
      }
    } catch (err: any) {
      failCount++;
      chunkErrors.push({ userId: uid, error: err?.message || "Execution failed" });
    }
  }

  // counters are added to (not overwritten), reading the row fresh for the final status
  const fresh = getBulkJobById(jobId)!;
  const errors: Array<{ userId: string; error: string }> = [...(fresh.error_log ? JSON.parse(fresh.error_log) : []), ...chunkErrors];
  const newSuccessful = fresh.successful_items + successCount;
  const newFailed = fresh.failed_items + failCount;
  const isFinished = fresh.processed_items >= fresh.total_items;
  const finalStatus: BulkJobStatus = isFinished ? (newFailed > 0 && newSuccessful === 0 ? "failed" : "completed") : "running";

  db.prepare(`
    UPDATE bulk_jobs SET
      status = ?,
      successful_items = successful_items + ?,
      failed_items = failed_items + ?,
      error_log = ?,
      updated_at = ?
    WHERE id = ?
  `).run(finalStatus, successCount, failCount, errors.length > 0 ? JSON.stringify(errors) : null, Date.now(), jobId);

  return getBulkJobById(jobId);
}

export function pauseBulkJob(jobId: string): boolean {
  const db = getDb();
  const res = db.prepare("UPDATE bulk_jobs SET status = 'paused', updated_at = ? WHERE id = ? AND status = 'running'").run(Date.now(), jobId);
  return res.changes > 0;
}

/**
 * Retry = a new job over only the users that failed, with the same type and payload. The
 * original job stays as the record of what happened. Returns null when there is nothing to retry.
 */
export function retryBulkJob(jobId: string, actorId?: string | null): BulkJob | null {
  const job = getBulkJobById(jobId);
  if (!job) return null;
  const errors: Array<{ userId: string }> = job.error_log ? JSON.parse(job.error_log) : [];
  const failedIds = [...new Set(errors.map((e) => e.userId))];
  if (failedIds.length === 0) return null;
  const { targetUserIds: _all, ...payload } = JSON.parse(job.payload);
  return createBulkJob({
    type: job.type,
    targetUserIds: failedIds,
    payload: { ...payload, retryOf: job.id },
    batchSize: job.batch_size,
    createdBy: actorId ?? job.created_by,
  });
}

/** Neutralises spreadsheet formulas (=, +, -, @) and quotes a CSV cell. */
function csvCell(v: unknown): string {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}


export function generateBulkJobReportCsv(jobId: string): string | null {
  const job = getBulkJobById(jobId);
  if (!job) return null;

  const lines: string[] = [];
  lines.push("Job ID,Type,Status,Total Items,Processed Items,Successful,Failed,Batch Size,Created At,Updated At");
  lines.push([
    job.id,
    job.type,
    job.status,
    job.total_items,
    job.processed_items,
    job.successful_items,
    job.failed_items,
    job.batch_size,
    new Date(job.created_at).toISOString(),
    new Date(job.updated_at).toISOString(),
  ].map(csvCell).join(","));

  lines.push("");
  lines.push("User ID,Error Reason");

  if (job.error_log) {
    try {
      const errors = JSON.parse(job.error_log);
      for (const err of errors) {
        lines.push([err.userId, err.error || ""].map(csvCell).join(","));
      }
    } catch {
      lines.push([`Error parsing error log`, job.error_log].map(csvCell).join(","));
    }
  }

  return lines.join("\n");
}
