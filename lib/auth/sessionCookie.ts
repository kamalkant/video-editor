/** The session cookie, shared by every *.viplay.in app (see sso.ts). */
export const SESSION_COOKIE_NAME = "viplay_session";
/** The cookie before single sign-on: only for the host that set it. Still read, so nobody is signed out by the move. */
export const LEGACY_SESSION_COOKIE_NAME = "VDO_session";

/** The session token from a cookie store (Next's cookies() or a request's cookies), the shared cookie first. */
export function sessionTokenFrom(store: { get(name: string): { value: string } | undefined }): string | undefined {
  return store.get(SESSION_COOKIE_NAME)?.value || store.get(LEGACY_SESSION_COOKIE_NAME)?.value || undefined;
}
