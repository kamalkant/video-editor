import { SITE_NAME, DEFAULT_DESCRIPTION } from "./config";

export interface BuildHomeSchemaParams {
  siteUrl: string;
  plans?: Array<{ name: string; price_amount: number; currency: string }> | null;
  faqs: Array<{ q: string; a: string }>;
}

export function buildHomeJsonLd({ siteUrl, plans, faqs }: BuildHomeSchemaParams) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: SITE_NAME,
        description: DEFAULT_DESCRIPTION,
        inLanguage: "en-IN",
      },
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: SITE_NAME,
        url: siteUrl,
        logo: {
          "@type": "ImageObject",
          url: `${siteUrl}/vdo-icon.png`,
          width: 512,
          height: 512,
        },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteUrl}/#application`,
        name: SITE_NAME,
        url: siteUrl,
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Web browser",
        description: DEFAULT_DESCRIPTION,
        featureList: [
          "Word-by-word captions in Hindi, Hinglish and English",
          "Edit video by transcript",
          "Hindi to English and English to Hindi AI Dubbing",
          "Transparent Web Avatars with alpha channel (WebM & MOV)",
          "Precision Multi-Track NLE Timeline with J/K/L shuttle",
          "Single-click multi-format export (16:9, 9:16, 1:1)",
          "Optical-flow motion tracking and WebGL chroma keying",
          "Smart audio ducking and speech priority mixing",
        ],
        offers: (plans ?? []).map((p) => ({
          "@type": "Offer",
          name: p.name,
          price: (p.price_amount / 100).toFixed(2),
          priceCurrency: p.currency,
          availability: "https://schema.org/InStock",
        })),
        publisher: {
          "@id": `${siteUrl}/#organization`,
        },
      },
      {
        "@type": "FAQPage",
        "@id": `${siteUrl}/#faq`,
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: {
            "@type": "Answer",
            text: f.a,
          },
        })),
      },
    ],
  };
}
