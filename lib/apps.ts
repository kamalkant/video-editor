/**
 * Where each ViPlay app lives. One sign-in for all of them (lib/auth/sso.ts): accounts (sign-in, sign-up,
 * billing, admin) are on the website; the studio and the photo editor send people there and get them back.
 * The website is on stage.viplay.in for now (viplay.in shows "coming soon"): moving it is this one default,
 * or NEXT_PUBLIC_ACCOUNTS_URL. Safe in client code and in next.config.ts.
 */
const trim = (url: string) => url.trim().replace(/\/+$/, "");

export const ACCOUNTS_URL = trim(process.env.NEXT_PUBLIC_ACCOUNTS_URL || "https://stage.viplay.in");
export const STUDIO_URL = trim(process.env.NEXT_PUBLIC_STUDIO_URL || "https://video.viplay.in");
export const PHOTO_URL = trim(process.env.NEXT_PUBLIC_PHOTO_URL || "https://photo.viplay.in");

/**
 * The website (accounts) for the app at `host`: NEXT_PUBLIC_ACCOUNTS_URL when set; a test copy
 * (dev-video.viplay.in, …) signs in on the website's test copy, dev.viplay.in, which has its database
 * (stage.viplay.in's sign-in isn't known there); else ACCOUNTS_URL.
 */
export function accountsUrlFor(host: string | null | undefined, domain = (process.env.NEXT_PUBLIC_SSO_DOMAIN || "viplay.in").trim().toLowerCase()): string {
  const env = process.env.NEXT_PUBLIC_ACCOUNTS_URL?.trim();
  if (env) return trim(env);
  const h = (host ?? "").toLowerCase().split(":")[0];
  if (h.startsWith("dev-") && h.endsWith(`.${domain}`) && !h.slice(0, -domain.length - 1).includes(".")) return `https://dev.${domain}`;
  return ACCOUNTS_URL;
}

