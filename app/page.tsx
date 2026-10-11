import type { Metadata } from "next";
import localFont from "next/font/local";
import { redirect } from "next/navigation";
import { MarketingWebsite } from "@/components/website/MarketingWebsite";
import { listPlans } from "@/lib/db/plans";

export const dynamic = "force-dynamic";

// the website's own font (the editor keeps the system font)
// (as --font-sans too: the site's `font-sans` classes then use it)
// (the files live in app/fonts, Latin, from Google Fonts: the build never needs the internet, which some hosts block)
const inter = localFont({ src: "./fonts/Inter-latin.woff2", weight: "100 900", display: "swap", variable: "--font-sans", adjustFontFallback: "Arial" });
// headings (globals.css: .vdo-site h1/h2/h3 use --font-display)
const interTight = localFont({ src: "./fonts/InterTight-latin.woff2", weight: "500 800", display: "swap", variable: "--font-display-face", adjustFontFallback: "Arial" });

const TITLE = "ViPlay Studio — AI video editor for Reels, Shorts & YouTube";
const DESCRIPTION =
  "Edit in your browser: word-by-word captions in Hindi, Hinglish and English, edit by transcript, Hindi ↔ English dubbing, studio voice, and YouTube + Shorts + square in one export. Plans from ₹0.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", url: "/", siteName: "ViPlay Studio", locale: "en_IN" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

/**
 * Root Route (/) — the ViPlay Studio website.
 * Backward Compatibility: Any legacy project link formatted as ?p= or ?v= seamlessly redirects to /editor.
 */
export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; v?: string; job?: string }>;
}) {
  const params = await searchParams;

  // Backward compatibility: If an existing project or video ID is present, redirect to the full Studio editor
  if (params.p || params.v || params.job) {
    const q = new URLSearchParams();
    if (params.p) q.set("p", params.p);
    if (params.v) q.set("v", params.v);
    if (params.job) q.set("job", params.job);
    redirect(`/editor?${q.toString()}`);
  }

  // (null, not [], when the plans can't be read: the pricing section then shows its built-in plans)
  let initialPlans: ReturnType<typeof listPlans> | null = null;
  try {
    const plans = listPlans(false);
    initialPlans = plans.length ? plans : null;
  } catch (error) {
    console.error("Failed to load initial plans for SSR:", error);
  }

  // what search engines read about the product (the same plans and prices as the page)
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "ViPlay Studio",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web browser",
    description: DESCRIPTION,
    offers: (initialPlans ?? []).map((p) => ({
      "@type": "Offer",
      name: p.name,
      price: (p.price_amount / 100).toFixed(2),
      priceCurrency: p.currency,
    })),
  };

  return (
    <div className={`${inter.variable} ${interTight.variable} ${inter.className}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <MarketingWebsite initialPlans={initialPlans ?? undefined} />
    </div>
  );
}
