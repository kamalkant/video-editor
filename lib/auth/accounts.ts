import { ACCOUNTS_URL, STUDIO_URL } from "@/lib/apps";
import { safeNextPath } from "@/lib/auth/redirect";
import { ssoUrl } from "@/lib/auth/sso";

/** This app's own address, for links that leave it and come back. */
export function studioOrigin(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  return env || STUDIO_URL;
}

/**
 * Sign-in and sign-up are on the website (one sign-in for every *.viplay.in app): send people there with
 * ?next= the address in this app they were heading to, so they come straight back. Other parameters
 * (?ref= on sign-up, ?error=) go along.
 */
export function accountsRedirect(page: "login" | "signup", request: Request): Response {
  const incoming = new URL(request.url).searchParams;
  const params = new URLSearchParams(incoming);
  const host = requestHost(request);
  params.set("next", `${appOrigin(host)}${safeNextPath(incoming.get("next"), "/editor")}`);
  return Response.redirect(`${ACCOUNTS_URL}/${page}?${params}`, 307);
}

/** The host the browser asked for (behind the hosting's proxy: X-Forwarded-Host). */
function requestHost(request: Request): string | null {
  return request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host");
}

/**
 * This app's address as the browser has it, when it's one of the ViPlay apps (an https *.viplay.in address);
 * else the configured one. (NEXT_PUBLIC_APP_URL left at http://localhost:3000 sent people back to localhost.)
 */
function appOrigin(host: string | null): string {
  const url = host ? ssoUrl(`https://${host}`) : null;
  return url ? url.origin : studioOrigin();
}
