import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { CapabilityBanner } from "@/components/layout/CapabilityBanner";
import { THEME_SCRIPT } from "@/lib/editor/themeScript";
import { getCurrentUser } from "@/lib/auth/session";
import { getComputedFeaturesForUser } from "@/lib/db/features";
import { AuthProvider } from "@/lib/auth/AuthContext";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#111a2e",
};

export const metadata: Metadata = {
  // (social cards and canonical links need the site's own address)
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: "ViPlay Studio",
  description: "AI video editor for Reels, Shorts and YouTube: word-by-word captions, editing by transcript, dubbing and transparent web avatars.",
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
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 btn btn-primary">
          Skip to main content
        </a>
        <Suspense fallback={null}>
          <CapabilityBanner />
        </Suspense>
        <AuthProvider initialUser={user} initialFeatures={features}>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
