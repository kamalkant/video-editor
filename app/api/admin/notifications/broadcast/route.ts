import { z } from "zod";
import { adminError, parseBody, requireSuperAdmin } from "@/lib/auth/admin-guard";
import { createNotification } from "@/lib/db/notifications";
import { logAudit } from "@/lib/db/audit";

export const runtime = "nodejs";

const Broadcast = z.object({
  title: z.string().trim().min(1, "title is required").max(200),
  message: z.string().trim().min(1, "message is required").max(5000),
  type: z.enum(["system", "billing", "security"]).default("system"),
});

/** In-app notice to every user at once: reserved for super admins, like the "all users" campaign audience. */
export async function POST(req: Request) {
  const guard = await requireSuperAdmin();
  if (guard.denied) return guard.denied;
  const body = await parseBody(req, Broadcast);
  if (body.invalid) return body.invalid;
  const { title, message, type } = body.data;

  try {
    const notif = createNotification({ userId: null, title, message, type });
    logAudit({ actorId: guard.user.id, action: "notification.broadcast", target: notif.id, details: { title, type } });
    return Response.json({ ok: true, notification: notif });
  } catch (err: any) {
    return adminError(500, "server_error", err?.message || "Broadcast failed");
  }
}
