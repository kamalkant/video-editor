import type { MetadataRoute } from "next";
import { getSiteUrl } from "../lib/seo/config";

/** Search engines may index the public site, but not the app, admin, account, auth utilities or API routes. */
export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/admin/",
        "/api/",
        "/editor",
        "/edit/",
        "/account",
        "/account/",
        "/manage-devices",
        "/results",
        "/forgot-password",
        "/reset-password",
        "/verify-email",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
