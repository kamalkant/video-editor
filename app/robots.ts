import type { MetadataRoute } from "next";

/** The studio is an app, not a page to find: search engines index the website (lib/apps.ts) instead. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
