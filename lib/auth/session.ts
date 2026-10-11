import { cookies } from "next/headers";
import { getSessionWithUser, SESSION_DURATION_MS } from "@/lib/db/sessions";
import type { SafeUser } from "@/lib/db/schema";

export const SESSION_COOKIE_NAME = "VDO_session";

/**
 * Reads the current session token from HTTP cookies and returns the authenticated user if valid.
 */
export async function getCurrentUser(): Promise<SafeUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;

    const auth = getSessionWithUser(token);
    return auth ? auth.user : null;
  } catch {
    return null;
  }
}

/**
 * Configures the secure HTTP-only session cookie.
 */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_DURATION_MS / 1000),
  });
}

/**
 * Clears the session cookie on logout.
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
