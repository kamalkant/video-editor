import { NextResponse } from "next/server";
import { consumeAuthToken } from "@/lib/db/tokens";
import { getUserById, setEmailVerified } from "@/lib/db/users";
import { logAudit } from "@/lib/db/audit";
import { setSessionCookie } from "@/lib/auth/session";
import { createSession } from "@/lib/db/sessions";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  const host = request.headers.get("host") || "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;

  if (!token) {
    return NextResponse.redirect(`${baseUrl}/verify-email?status=invalid`);
  }

  const userId = consumeAuthToken(token, "email_verify");
  if (!userId) {
    return NextResponse.redirect(`${baseUrl}/verify-email?status=expired_or_invalid`);
  }

  setEmailVerified(userId);

  const user = getUserById(userId);
  if (user && user.status === "active") {
    // Automatically issue a session so the user is signed in upon verification
    const session = createSession(user.id);
    await setSessionCookie(session.token);
  }

  logAudit({
    actorId: userId,
    action: "user.email_verified",
    target: userId,
  });

  return NextResponse.redirect(`${baseUrl}/verify-email?status=success`);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = typeof body?.token === "string" ? body.token.trim() : "";

    if (!token) {
      return NextResponse.json({ ok: false, message: "Token is required." }, { status: 400 });
    }

    const userId = consumeAuthToken(token, "email_verify");
    if (!userId) {
      return NextResponse.json(
        { ok: false, message: "The verification link has expired or is invalid." },
        { status: 400 }
      );
    }

    setEmailVerified(userId);

    const user = getUserById(userId);
    if (user && user.status === "active") {
      const session = createSession(user.id);
      await setSessionCookie(session.token);
    }

    logAudit({
      actorId: userId,
      action: "user.email_verified",
      target: userId,
    });

    return NextResponse.json({ ok: true, message: "Email successfully verified." });
  } catch (err) {
    console.error("Email verification POST error:", err);
    return NextResponse.json({ ok: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
