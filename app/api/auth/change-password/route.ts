import { cookies } from "next/headers";
import { z } from "zod";
import { adminError, parseBody } from "@/lib/auth/admin-guard";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/admin-policy";
import { verifyPassword } from "@/lib/auth/passwords";
import { getCurrentUser } from "@/lib/auth/session";
import { sessionTokenFrom } from "@/lib/auth/sessionCookie";
import { logAudit } from "@/lib/db/audit";
import { SEED_ADMIN_PASSWORD } from "@/lib/db/seed";
import { deleteOtherUserSessions } from "@/lib/db/sessions";
import { getUserById, updateUserPassword } from "@/lib/db/users";

export const runtime = "nodejs";

const Body = z.object({
  currentPassword: z.string().max(200).optional(),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH, `The new password needs at least ${MIN_PASSWORD_LENGTH} characters.`).max(200),
});

/** The signed-in user changes their own password (the current one is required when they have one). Other devices are signed out. */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return adminError(401, "unauthorized", "Sign in required.");
  const body = await parseBody(req, Body);
  if (body.invalid) return body.invalid;
  const { currentPassword, newPassword } = body.data;

  const user = getUserById(me.id);
  if (!user) return adminError(401, "unauthorized", "Sign in required.");
  if (user.password_hash && user.password_salt) {
    if (!currentPassword || !verifyPassword(currentPassword, user.password_hash, user.password_salt)) {
      return adminError(400, "wrong_password", "Your current password isn't right.");
    }
    if (verifyPassword(newPassword, user.password_hash, user.password_salt)) {
      return adminError(400, "same_password", "Pick a password different from the current one.");
    }
  }
  if (newPassword === SEED_ADMIN_PASSWORD) return adminError(400, "weak_password", "That password is public. Pick another one.");

  updateUserPassword(user.id, newPassword);
  const token = sessionTokenFrom(await cookies()) ?? "";
  const signedOut = deleteOtherUserSessions(user.id, token);
  logAudit({ actorId: user.id, action: "user.change_password", target: user.id, details: { otherSessionsEnded: signedOut } });
  return Response.json({ ok: true, message: "Password changed." });
}
