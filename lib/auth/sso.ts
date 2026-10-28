/**
 * One sign-in for every ViPlay app: viplay.in (website and accounts), video.viplay.in (studio),
 * photo.viplay.in and any later *.viplay.in app. The session cookie is set for the whole domain, and
 * signing in may send people back to any of these apps. Safe in client code (no server imports).
 */
export const SSO_DOMAIN = (process.env.NEXT_PUBLIC_SSO_DOMAIN || "viplay.in").trim().toLowerCase();

export function isSsoHost(hostname: string, domain: string = SSO_DOMAIN): boolean {
  const host = hostname.toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}

/** The address if it is https on one of the apps (no user info, no other port), else null. */
export function ssoUrl(value: string, domain: string = SSO_DOMAIN): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  return isSsoHost(url.hostname, domain) ? url : null;
}

/** The cookie Domain when this app runs on the SSO domain (from NEXT_PUBLIC_APP_URL); elsewhere (localhost) host-only. */
export function sessionCookieDomain(appUrl: string | undefined = process.env.NEXT_PUBLIC_APP_URL, domain: string = SSO_DOMAIN): string | undefined {
  if (!appUrl) return undefined;
  try {
    return isSsoHost(new URL(appUrl).hostname, domain) ? domain : undefined;
  } catch {
    return undefined;
  }
}
