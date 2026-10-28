import type { NextConfig } from "next";
import { ACCOUNTS_URL } from "./lib/apps";

/**
 * Security headers on every page and file: no framing by other sites (clickjacking), no type guessing, a
 * short referrer, only this site may use the camera / microphone / screen (Record, voice search), and HTTPS
 * from now on when live. A Content-Security-Policy is still to do (EDITOR_AUDIT.md backlog).
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), display-capture=(self), geolocation=(), browsing-topics=()" },
  ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  // the browser tests run a second dev server with its own build folder (and storage)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // the dev badge sits over the bottom-left rail buttons: hide it for the browser tests only
  ...(process.env.NEXT_DIST_DIR === ".next-e2e" ? { devIndicators: false as const } : {}),
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    cpus: Number(process.env.BUILD_CPUS || 2),
    webpackBuildWorker: false,
  },
  headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  redirects() {
    // accounts are on the website (lib/apps.ts): the menu's links, and links in emails sent before the
    // split (reset password, verify email), go there; sign-in and sign-up are app/login and app/signup
    const accounts = ["/account", "/account/:path*", "/admin", "/admin/:path*", "/manage-devices", "/roadmap", "/forgot-password", "/reset-password", "/verify-email", "/api/auth/verify-email"];
    return [
      { source: "/", destination: "/editor", permanent: false },
      ...accounts.map((source) => ({ source, destination: `${ACCOUNTS_URL}${source}`, permanent: false })),
    ];
  },
};

export default nextConfig;
