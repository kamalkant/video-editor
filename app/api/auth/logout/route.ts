import { cookies } from "next/headers";
import { deleteSession } from "@/lib/db/sessions";
import { clearSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
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
