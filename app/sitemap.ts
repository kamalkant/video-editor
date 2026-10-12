import type { MetadataRoute } from "next";
import { getSiteUrl } from "../lib/seo/config";

/** The primary public discoverable pages search engines should index. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${base}/roadmap`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
  ];
}
