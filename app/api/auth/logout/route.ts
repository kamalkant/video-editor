import { cookies } from "next/headers";
import { deleteSession } from "@/lib/db/sessions";
import { clearSessionCookie } from "@/lib/auth/session";
import { sessionTokenFrom } from "@/lib/auth/sessionCookie";

export const runtime = "nodejs";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = sessionTokenFrom(cookieStore);
    if (token) {
      deleteSession(token);
    }
    await clearSessionCookie();
    return Response.json({ ok: true });
  } catch (err) {
    console.error("Logout error:", err);
    await clearSessionCookie();
    return Response.json({ ok: true });
  }
}
