import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "./index";
import type { Notification } from "./schema";

export function createNotification(data: {
  userId?: string | null;
  title: string;
  message: string;
  type?: "billing" | "security" | "system" | "promotion";
}): Notification {
  const db = getDb();
  const id = "notif_" + randomUUID().slice(0, 8);
  const now = Date.now();

  db.prepare(`
    INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(id, data.userId ?? null, data.title, data.message, data.type || "system", now);

  return {
    id,
    user_id: data.userId ?? null,
    title: data.title,
    message: data.message,
    type: data.type || "system",
    is_read: 0,
    created_at: now,
  };
}

export function listUserNotifications(userId: string, limit = 50): Notification[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM notifications 
    WHERE user_id = ? OR user_id IS NULL
    ORDER BY created_at DESC 
    LIMIT ?
  `).all(userId, limit) as Notification[];
}

export function markNotificationAsRead(id: string, userId: string): boolean {
  const db = getDb();
  const res = db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND (user_id = ? OR user_id IS NULL)").run(id, userId);
  return res.changes > 0;
}

export function markAllNotificationsAsRead(userId: string): number {
  const db = getDb();
  const res = db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ? OR user_id IS NULL").run(userId);
  return Number(res.changes);
}
