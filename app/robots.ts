import type { MetadataRoute } from "next";

/** Search engines may read the public site, not the app, admin, account or API pages. */
export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/editor", "/edit/", "/account", "/manage-devices", "/results"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
