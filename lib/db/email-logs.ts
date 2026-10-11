import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "./index";
import type { EmailLog } from "./schema";

export function logEmailDispatch(data: {
  toEmail: string;
  subject: string;
  templateName: string;
  status: "sent" | "failed" | "simulated";
  errorMessage?: string | null;
}): EmailLog {
  const db = getDb();
  const id = "elog_" + randomUUID().slice(0, 8);
  const now = Date.now();

  db.prepare(`
    INSERT INTO email_logs (id, to_email, subject, template_name, status, error_message, sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.toEmail, data.subject, data.templateName, data.status, data.errorMessage ?? null, now);

  return {
    id,
    to_email: data.toEmail,
    subject: data.subject,
    template_name: data.templateName,
    status: data.status,
    error_message: data.errorMessage ?? null,
    sent_at: now,
  };
}

export function listEmailLogs(limit = 100): EmailLog[] {
  const db = getDb();
  return db.prepare("SELECT * FROM email_logs ORDER BY sent_at DESC LIMIT ?").all(limit) as EmailLog[];
}
