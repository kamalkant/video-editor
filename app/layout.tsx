import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { CapabilityBanner } from "@/components/layout/CapabilityBanner";
import Script from "next/script";
import { THEME_SCRIPT } from "@/lib/editor/themeScript";
import { getCurrentUser } from "@/lib/auth/session";
import { getComputedFeaturesForUser } from "@/lib/db/features";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { getSiteUrl, SITE_NAME, DEFAULT_TITLE, DEFAULT_DESCRIPTION } from "@/lib/seo/config";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#111a2e",
};

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: DEFAULT_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_IN",
    url: "/",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  icons: {
    icon: [
      { url: "/vdo-icon.png" },
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/vdo-icon.png",
    apple: "/vdo-icon.png",
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  const features = getComputedFeaturesForUser(user);

  return (
    // the saved theme (light / system) is set on <html> before React loads
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* the saved theme, applied before the first paint (next/script puts it in the page's HTML; a plain
            <script> in a component makes React warn when the layout renders on the client) */}
        <Script id="theme" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 btn btn-primary">
          Skip to main content
        </a>
        {/* (a server setup problem: for the people who run the site, not every visitor) */}
        {(user?.role === "admin" || user?.role === "super_admin") && (
          <Suspense fallback={null}>
            <CapabilityBanner />
          </Suspense>
        )}
        <AuthProvider initialUser={user} initialFeatures={features}>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
