import { ACCOUNTS_URL, STUDIO_URL } from "@/lib/apps";
import { safeNextPath } from "@/lib/auth/redirect";

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
  params.set("next", `${studioOrigin()}${safeNextPath(incoming.get("next"), "/editor")}`);
  return Response.redirect(`${ACCOUNTS_URL}/${page}?${params}`, 307);
}
