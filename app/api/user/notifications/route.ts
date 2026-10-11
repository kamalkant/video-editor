import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { listUserNotifications, markNotificationAsRead, markAllNotificationsAsRead } from "@/lib/db/notifications";

export const runtime = "nodejs";

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return apiError(401, "unauthorized", "Sign in required to view notifications.");
  }

  const notifications = listUserNotifications(currentUser.id, 50);
  const unreadCount = notifications.filter((n) => n.is_read === 0).length;

  return NextResponse.json({ ok: true, notifications, unreadCount });
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return apiError(401, "unauthorized", "Sign in required.");
  }

  try {
    const body = await request.json();
    const { action, notificationId } = body;

    if (action === "mark_read" && notificationId) {
      const updated = markNotificationAsRead(notificationId, currentUser.id);
      return NextResponse.json({ ok: true, updated });
    }

    if (action === "mark_all_read") {
      const count = markAllNotificationsAsRead(currentUser.id);
      return NextResponse.json({ ok: true, count });
    }

    return apiError(400, "bad_request", "Invalid action specified.");
  } catch (err: any) {
    return apiError(500, "internal_error", err.message || "Failed to update notification.");
  }
}
