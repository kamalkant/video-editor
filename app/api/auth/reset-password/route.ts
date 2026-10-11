import { NextResponse } from "next/server";
import { consumeAuthToken } from "@/lib/db/tokens";
import { getUserById, updateUserPassword } from "@/lib/db/users";
import { createSession, deleteSessionsForUser } from "@/lib/db/sessions";
import { setSessionCookie } from "@/lib/auth/session";
import { logAudit } from "@/lib/db/audit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!token) {
      return NextResponse.json(
        { ok: false, message: "Reset token is missing or invalid." },
        { status: 400 }
      );
    }

    if (!password || password.length < 8) {
      return NextResponse.json(
        { ok: false, message: "Password must be at least 8 characters long." },
        { status: 400 }
      );
    }

    const userId = consumeAuthToken(token, "password_reset");
    if (!userId) {
      return NextResponse.json(
        { ok: false, message: "This password reset link is invalid or has expired." },
        { status: 400 }
      );
    }

    const user = getUserById(userId);
    if (!user) {
      return NextResponse.json(
        { ok: false, message: "User account could not be found." },
        { status: 404 }
      );
    }

    // 1. Update password
    updateUserPassword(userId, password);

    // 2. Revoke all previous active sessions for security
    deleteSessionsForUser(userId);

    // 3. Issue fresh session
    const session = createSession(userId);
    await setSessionCookie(session.token);

    logAudit({
      actorId: userId,
      action: "auth.password_reset_success",
      target: userId,
    });

    return NextResponse.json({
      ok: true,
      message: "Your password has been successfully reset.",
    });
  } catch (err) {
    console.error("Password reset error:", err);
    return NextResponse.json({ ok: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
