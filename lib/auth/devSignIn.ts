import { safeNextPath } from "@/lib/auth/redirect";
import { setSessionCookie } from "@/lib/auth/session";
import type { UserRole } from "@/lib/db/schema";
import { createSession } from "@/lib/db/sessions";
import { createUser, getUserByEmail } from "@/lib/db/users";

/** The account `npm run dev` signs you into on your own computer. */
export const LOCAL_DEV_EMAIL = "dev@localhost";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Signing in is on the website (viplay.in), and its cookie is for *.viplay.in only: it never reaches a server
 * on your own computer, which then sent you to the live site. So under `next dev` on localhost (any port)
 * /login signs you in here instead. Never in a production build, never on another host.
 */
export function localSignInAllowed(request: Request, env: string | undefined = process.env.NODE_ENV): boolean {
  if (env !== "development") return false;
  return LOCAL_HOSTS.has(new URL(request.url).hostname);
}

/** Signs in the local account (made the first time; LOCAL_DEV_ROLE=admin for an admin) and goes back to ?next=. */
export async function localSignIn(request: Request): Promise<Response> {
  const user =
    getUserByEmail(LOCAL_DEV_EMAIL) ??
    createUser({ email: LOCAL_DEV_EMAIL, name: "Local Dev", role: localRole(), emailVerified: true });
  await setSessionCookie(createSession(user.id).token);
  const next = safeNextPath(new URL(request.url).searchParams.get("next"), "/editor");
  return new Response(null, { status: 307, headers: { Location: next } });
}

function localRole(): UserRole {
  const role = process.env.LOCAL_DEV_ROLE;
  return role === "admin" || role === "super_admin" ? role : "user";
}
