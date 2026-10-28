import { ssoUrl } from "./sso";

/**
 * Where to go after signing in or up: only a path on this site. Anything else (another site,
 * "//host", "/\host", control characters) falls back, so a crafted ?next= link can't send a
 * freshly signed-in user to a look-alike page.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/editor"): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 2048) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  return next;
}

/**
 * Like safeNextPath, but also an https address on another ViPlay app (video.viplay.in, photo.viplay.in, …),
 * which send people here to sign in and get them back afterwards. Nothing outside the domain.
 */
export function safeNextTarget(next: string | null | undefined, fallback = "/editor"): string {
  if (typeof next === "string" && next.length <= 2048 && !/[\u0000-\u001f\u007f]/.test(next)) {
    const url = ssoUrl(next);
    if (url) return url.href;
  }
  return safeNextPath(next, fallback);
}

/** A target from safeNextTarget that is another app's address (leave with a full page load, not the router). */
export function isAppUrl(target: string): boolean {
  return target.startsWith("https://");
}

/** A referral code as it may appear in ?ref= (codes are short letters, digits and dashes). */
export function cleanReferralCode(ref: string | null | undefined): string | null {
  if (typeof ref !== "string") return null;
  const code = ref.trim();
  return /^[A-Za-z0-9_-]{3,40}$/.test(code) ? code : null;
}
