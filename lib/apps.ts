/**
 * Where each ViPlay app lives. One sign-in for all of them (lib/auth/sso.ts): accounts (sign-in, sign-up,
 * billing, admin) are on the website; the studio and the photo editor send people there and get them back.
 * The website is viplay.in (NEXT_PUBLIC_ACCOUNTS_URL to change). Safe in client code and in next.config.ts.
 */
const trim = (url: string) => url.trim().replace(/\/+$/, "");

export const ACCOUNTS_URL = trim(process.env.NEXT_PUBLIC_ACCOUNTS_URL || "https://viplay.in");
export const STUDIO_URL = trim(process.env.NEXT_PUBLIC_STUDIO_URL || "https://video.viplay.in");
export const PHOTO_URL = trim(process.env.NEXT_PUBLIC_PHOTO_URL || "https://photo.viplay.in");
