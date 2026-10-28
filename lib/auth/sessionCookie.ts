/**
 * The session cookie, shared by every *.viplay.in app (see sso.ts). The test copies (dev.viplay.in, …) have
 * their own database, so they set SESSION_COOKIE_NAME to their own name: signing in there must not replace
 * the real sign-in, which the same domain-wide cookie would.
 */
export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME?.trim() || "viplay_session";
/** The cookie before single sign-on: only for the host that set it. Still read, so nobody is signed out by the move. */
export const LEGACY_SESSION_COOKIE_NAME = "VDO_session";

/** The session token from a cookie store (Next's cookies() or a request's cookies), the shared cookie first. */
export function sessionTokenFrom(store: { get(name: string): { value: string } | undefined }): string | undefined {
  return store.get(SESSION_COOKIE_NAME)?.value || store.get(LEGACY_SESSION_COOKIE_NAME)?.value || undefined;
}
