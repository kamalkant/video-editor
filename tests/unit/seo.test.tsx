import { describe, expect, it } from "vitest";
import { getSiteUrl, CANONICAL_BASE, NO_INDEX_ROBOTS, SITE_NAME, DEFAULT_TITLE, DEFAULT_DESCRIPTION } from "../../lib/seo/config";
import robots from "../../app/robots";
import sitemap from "../../app/sitemap";
import { metadata as adminMetadata } from "../../app/admin/layout";
import { metadata as accountMetadata } from "../../app/account/layout";
import { metadata as editorMetadata } from "../../app/editor/page";
import { metadata as playerMetadata } from "../../app/player/page";
import { metadata as forgotPasswordMetadata } from "../../app/forgot-password/layout";
import { metadata as resetPasswordMetadata } from "../../app/reset-password/layout";
import { metadata as verifyEmailMetadata } from "../../app/verify-email/layout";
import { metadata as manageDevicesMetadata } from "../../app/manage-devices/layout";
import { metadata as editVideoMetadata } from "../../app/edit/[videoId]/page";
import { metadata as resultsMetadata } from "../../app/results/[jobId]/page";
import { metadata as loginMetadata } from "../../app/login/layout";
import { metadata as signupMetadata } from "../../app/signup/layout";
import { metadata as roadmapMetadata } from "../../app/roadmap/page";

describe("Technical SEO configuration and helpers", () => {
  it("defaults to canonical production host https://video.viplay.in", () => {
    expect(CANONICAL_BASE).toBe("https://video.viplay.in");
    expect(SITE_NAME).toBe("ViPlay Studio");
    expect(DEFAULT_TITLE).toContain("ViPlay Studio");
    expect(DEFAULT_DESCRIPTION).toBeDefined();
  });

  it("resolves canonical URLs properly and strips trailing slashes", () => {
    const originalEnv = process.env.NEXT_PUBLIC_APP_URL;
    try {
      delete process.env.NEXT_PUBLIC_APP_URL;
      expect(getSiteUrl()).toBe("https://video.viplay.in");
      expect(getSiteUrl("/roadmap")).toBe("https://video.viplay.in/roadmap");
      expect(getSiteUrl("roadmap")).toBe("https://video.viplay.in/roadmap");

      process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
      expect(getSiteUrl()).toBe("https://video.viplay.in");

      process.env.NEXT_PUBLIC_APP_URL = "https://staging.viplay.in/";
      expect(getSiteUrl()).toBe("https://staging.viplay.in");
      expect(getSiteUrl("/pricing")).toBe("https://staging.viplay.in/pricing");
    } finally {
      if (originalEnv !== undefined) {
        process.env.NEXT_PUBLIC_APP_URL = originalEnv;
      } else {
        delete process.env.NEXT_PUBLIC_APP_URL;
      }
    }
  });

  it("NO_INDEX_ROBOTS preset prevents indexing and caching across search bots", () => {
    const robots = NO_INDEX_ROBOTS as any;
    expect(robots.index).toBe(false);
    expect(robots.follow).toBe(false);
    expect(robots.nocache).toBe(true);
    expect(robots.googleBot).toEqual({
      index: false,
      follow: false,
      noimageindex: true,
    });
  });
});

describe("robots.txt configuration", () => {
  const robotsConfig = robots();

  it("allows general crawling for public roots while disallowing private surfaces", () => {
    expect(robotsConfig.rules).toBeDefined();
    const rule = Array.isArray(robotsConfig.rules) ? robotsConfig.rules[0] : robotsConfig.rules;
    expect(rule.userAgent).toBe("*");
    expect(rule.allow).toBe("/");

    const disallows = rule.disallow as string[];
    expect(disallows).toContain("/admin");
    expect(disallows).toContain("/admin/");
    expect(disallows).toContain("/api/");
    expect(disallows).toContain("/editor");
    expect(disallows).toContain("/edit/");
    expect(disallows).toContain("/account");
    expect(disallows).toContain("/account/");
    expect(disallows).toContain("/manage-devices");
    expect(disallows).toContain("/results");
    expect(disallows).toContain("/forgot-password");
    expect(disallows).toContain("/reset-password");
    expect(disallows).toContain("/verify-email");
  });

  it("serves an absolute canonical sitemap URL", () => {
    expect(robotsConfig.sitemap).toBe(`${getSiteUrl()}/sitemap.xml`);
  });
});

describe("XML sitemap generation", () => {
  it("generates an entry for each indexable high-value public page", () => {
    const entries = sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls).toContain(`${getSiteUrl()}/`);
    expect(urls).toContain(`${getSiteUrl()}/roadmap`);

    const rootEntry = entries.find((e) => e.url === `${getSiteUrl()}/`);
    expect(rootEntry?.priority).toBe(1.0);
    expect(rootEntry?.changeFrequency).toBe("weekly");

    const roadmapEntry = entries.find((e) => e.url === `${getSiteUrl()}/roadmap`);
    expect(roadmapEntry?.priority).toBe(0.7);
    expect(roadmapEntry?.changeFrequency).toBe("weekly");

    // Private routes must NOT be in sitemap
    for (const entry of entries) {
      expect(entry.url).not.toContain("/admin");
      expect(entry.url).not.toContain("/editor");
      expect(entry.url).not.toContain("/account");
      expect(entry.url).not.toContain("/edit");
      expect(entry.url).not.toContain("/results");
      expect(entry.url).not.toContain("/manage-devices");
      expect(entry.url).not.toContain("/forgot-password");
    }
  });
});

describe("Defense-in-depth: Private route metadata indexing protection", () => {
  it.each([
    ["admin", adminMetadata],
    ["account", accountMetadata],
    ["editor", editorMetadata],
    ["player", playerMetadata],
    ["forgot-password", forgotPasswordMetadata],
    ["reset-password", resetPasswordMetadata],
    ["verify-email", verifyEmailMetadata],
    ["manage-devices", manageDevicesMetadata],
    ["editVideo", editVideoMetadata],
    ["results", resultsMetadata],
  ])("enforces noindex on private surface: %s", (_name, metadata) => {
    expect(metadata.robots).toBeDefined();
    const robots = metadata.robots as any;
    expect(robots.index).toBe(false);
    expect(robots.follow).toBe(false);
  });
});

describe("Public discoverable metadata", () => {
  it("provides canonical and titles for public authentication pages", () => {
    expect(loginMetadata.title).toBe("Sign In");
    expect(loginMetadata.alternates?.canonical).toBe("/login");
    expect(loginMetadata.openGraph?.title).toContain("Sign In");

    expect(signupMetadata.title).toBe("Create Free Account");
    expect(signupMetadata.alternates?.canonical).toBe("/signup");
    expect(signupMetadata.openGraph?.title).toContain("Create Free Account");
  });

  it("provides canonical and title for roadmap page", () => {
    expect(roadmapMetadata.title).toContain("Product Roadmap");
    expect(roadmapMetadata.alternates?.canonical).toBe("/roadmap");
  });
});

describe("Structured Data Schema.org generation", () => {
  it("builds a multi-entity @graph including WebSite, Organization, SoftwareApplication, and FAQPage", async () => {
    const { buildHomeJsonLd } = await import("../../lib/seo/schema");
    const testPlans = [
      { name: "Free", price_amount: 0, currency: "INR" },
      { name: "Pro Monthly", price_amount: 149900, currency: "INR" },
    ];
    const testFaqs = [
      { q: "Is ViPlay free to try?", a: "Yes, you can start immediately without credit card." },
      { q: "Does rendering require server uploads?", a: "Browser-accelerated timeline with private local processing." },
    ];

    const graph = buildHomeJsonLd({
      siteUrl: "https://viplay.in",
      plans: testPlans,
      faqs: testFaqs,
    });

    expect(graph["@context"]).toBe("https://schema.org");
    expect(graph["@graph"]).toHaveLength(4);

    const website = graph["@graph"].find((item) => item["@type"] === "WebSite");
    expect(website).toBeDefined();
    expect(website?.url).toBe("https://viplay.in");

    const org = graph["@graph"].find((item) => item["@type"] === "Organization");
    expect(org).toBeDefined();
    expect(org?.url).toBe("https://viplay.in");
    expect(org?.logo?.url).toBe("https://viplay.in/vdo-icon.png");

    const app = graph["@graph"].find((item) => item["@type"] === "SoftwareApplication");
    expect(app).toBeDefined();
    expect(app?.applicationCategory).toBe("MultimediaApplication");
    expect(app?.operatingSystem).toBe("Web browser");
    expect(app?.offers).toHaveLength(2);
    expect(app?.offers?.[0]).toEqual({
      "@type": "Offer",
      name: "Free",
      price: "0.00",
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
    });
    expect(app?.offers?.[1]).toEqual({
      "@type": "Offer",
      name: "Pro Monthly",
      price: "1499.00",
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
    });

    const faq = graph["@graph"].find((item) => item["@type"] === "FAQPage");
    expect(faq).toBeDefined();
    expect(faq?.mainEntity).toHaveLength(2);
    expect(faq?.mainEntity?.[0].name).toBe("Is ViPlay free to try?");
    expect(faq?.mainEntity?.[0].acceptedAnswer?.text).toBe("Yes, you can start immediately without credit card.");
  });
});
