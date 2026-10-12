import type { Metadata } from "next";
import localFont from "next/font/local";
import { redirect } from "next/navigation";
import { MarketingWebsite } from "@/components/website/MarketingWebsite";
import { listPlans } from "@/lib/db/plans";
import { preload } from "react-dom";
import { FAQS } from "@/components/website/sections/faqs";
import { getSiteUrl, DEFAULT_TITLE, DEFAULT_DESCRIPTION } from "@/lib/seo/config";
import { buildHomeJsonLd } from "@/lib/seo/schema";

export const dynamic = "force-dynamic";

// the website's own font (the editor keeps the system font)
// (as --font-sans too: the site's `font-sans` classes then use it)
// (the files live in app/fonts, Latin, from Google Fonts: the build never needs the internet, which some hosts block)
const inter = localFont({ src: "./fonts/Inter-latin.woff2", weight: "100 900", display: "swap", variable: "--font-sans", adjustFontFallback: "Arial" });
// headings (globals.css: .vdo-site h1/h2/h3 use --font-display)
const interTight = localFont({ src: "./fonts/InterTight-latin.woff2", weight: "500 800", display: "swap", variable: "--font-display-face", adjustFontFallback: "Arial" });

const TITLE = DEFAULT_TITLE;
const DESCRIPTION = DEFAULT_DESCRIPTION;

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

  // Preload critical hero LCP media poster so the browser initiates download on the first HTML byte
  preload("/website/images/Creating_video_editing_product_demo_20261011025631.webp", {
    as: "image",
    fetchPriority: "high",
  });

  // what search engines read about the product, organization and verified FAQs
  const jsonLd = buildHomeJsonLd({
    siteUrl: getSiteUrl(),
    plans: initialPlans,
    faqs: FAQS,
  });

  return (
    <div className={`${inter.variable} ${interTight.variable} ${inter.className}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <MarketingWebsite initialPlans={initialPlans ?? undefined} />
    </div>
  );
}
