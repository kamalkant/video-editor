import type { Metadata } from "next";

export const CANONICAL_BASE = "https://video.viplay.in";

/**
 * Returns the absolute base URL for canonical tags, sitemaps, and OpenGraph.
 * Respects NEXT_PUBLIC_APP_URL in local/staging environments, defaulting to the
 * canonical production domain https://video.viplay.in.
 */
export function getSiteUrl(path: string = ""): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const isLocalhost =
    !envUrl ||
    envUrl === "undefined" ||
    envUrl.includes("localhost") ||
    envUrl.includes("127.0.0.1");

  const base = isLocalhost ? CANONICAL_BASE : envUrl.replace(/\/+$/, "");
  if (!path) return base;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

export const SITE_NAME = "ViPlay Studio";
export const DEFAULT_TITLE = "ViPlay Studio — AI video editor for Reels, Shorts & YouTube";
export const DEFAULT_DESCRIPTION =
  "Edit in your browser: word-by-word captions in Hindi, Hinglish and English, edit by transcript, Hindi ↔ English dubbing, studio voice, and YouTube + Shorts + square in one export. Plans from ₹0.";

/**
 * Defense-in-depth robots metadata for private, authenticated, or utility application routes.
 */
export const NO_INDEX_ROBOTS: Metadata["robots"] = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: {
    index: false,
    follow: false,
    noimageindex: true,
  },
};
