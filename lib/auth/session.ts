import { cookies } from "next/headers";
import { getSessionWithUser, SESSION_DURATION_MS } from "@/lib/db/sessions";
import type { SafeUser } from "@/lib/db/schema";
import { LEGACY_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME, sessionTokenFrom } from "@/lib/auth/sessionCookie";
import { sessionCookieDomain } from "@/lib/auth/sso";

export { LEGACY_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME, sessionTokenFrom };

/**
 * Reads the current session token from HTTP cookies and returns the authenticated user if valid.
 */
export async function getCurrentUser(): Promise<SafeUser | null> {
  try {
    const token = sessionTokenFrom(await cookies());
    if (!token) return null;

    const auth = getSessionWithUser(token);
    return auth ? auth.user : null;
  } catch {
    return null;
  }
}

/**
 * Configures the secure HTTP-only session cookie: for every *.viplay.in app when running there (one sign-in
 * for all of them), host-only elsewhere. The host-only cookie from before is dropped.
 */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    domain: sessionCookieDomain(),
    maxAge: Math.floor(SESSION_DURATION_MS / 1000),
  });
  if (cookieStore.get(LEGACY_SESSION_COOKIE_NAME)) cookieStore.delete(LEGACY_SESSION_COOKIE_NAME);
}

/**
 * Clears the session cookies on logout (the shared one and the host-only one from before).
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    domain: sessionCookieDomain(),
    maxAge: 0,
  });
  cookieStore.set(LEGACY_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
