"use client";

import dynamic from "next/dynamic";
import { AtmosphericWebGlStage } from "./canvas/AtmosphericWebGlStage";
import { TopNav } from "./dom/TopNav";
import { ScrollMotionCard } from "./dom/ScrollMotionCard";
import { ScrollTimelineHero } from "./hero/ScrollTimelineHero";
import { useResolvedTheme } from "@/lib/editor/theme";
import type { PlanData } from "./sections/PricingSection";

// Below-the-fold sections dynamically loaded with ssr: true to preserve SEO while splitting client JS
const AllToolsFeaturesShowcaseSection = dynamic(
  () => import("./sections/AllToolsFeaturesShowcaseSection").then((m) => m.AllToolsFeaturesShowcaseSection),
  { ssr: true },
);
const UseCasesSection = dynamic(
  () => import("./sections/UseCasesSection").then((m) => m.UseCasesSection),
  { ssr: true },
);
const TemplatesShowcaseSection = dynamic(
  () => import("./sections/TemplatesShowcaseSection").then((m) => m.TemplatesShowcaseSection),
  { ssr: true },
);
const ResourcesSection = dynamic(
  () => import("./sections/ResourcesSection").then((m) => m.ResourcesSection),
  { ssr: true },
);
const ExplodedLayerSection = dynamic(
  () => import("./sections/ExplodedLayerSection").then((m) => m.ExplodedLayerSection),
  { ssr: true },
);
const EcosystemCtaSection = dynamic(
  () => import("./sections/EcosystemCtaSection").then((m) => m.EcosystemCtaSection),
  { ssr: true },
);
const PricingSection = dynamic(
  () => import("./sections/PricingSection").then((m) => m.PricingSection),
  { ssr: true },
);
const FaqSection = dynamic(
  () => import("./sections/FaqSection").then((m) => m.FaqSection),
  { ssr: true },
);
const FooterCTA = dynamic(
  () => import("./dom/FooterCTA").then((m) => m.FooterCTA),
  { ssr: true },
);

// Interactive Feature Modules (Full-Width Large Stages)
const AiCutoutModule = dynamic(
  () => import("./modules/AiCutoutModule").then((m) => m.AiCutoutModule),
  { ssr: true },
);
const OverlayCompositionModule = dynamic(
  () => import("./modules/OverlayCompositionModule").then((m) => m.OverlayCompositionModule),
  { ssr: true },
);
const MotionTrackingModule = dynamic(
  () => import("./modules/MotionTrackingModule").then((m) => m.MotionTrackingModule),
  { ssr: true },
);
const AiGenerationModule = dynamic(
  () => import("./modules/AiGenerationModule").then((m) => m.AiGenerationModule),
  { ssr: true },
);
const PlatformFormatsModule = dynamic(
  () => import("./modules/PlatformFormatsModule").then((m) => m.PlatformFormatsModule),
  { ssr: true },
);
const CompareReviewModule = dynamic(
  () => import("./modules/CompareReviewModule").then((m) => m.CompareReviewModule),
  { ssr: true },
);

export function MarketingWebsite({ initialPlans }: { initialPlans?: PlanData[] } = {}) {
  const theme = useResolvedTheme();
  const isLight = theme === "light";

  // (the mouse parallax lives in the components that move: components/website/usePointerPosition)

  return (
    <div
      data-site-theme={isLight ? "light" : "dark"}
      className="vdo-site relative min-h-screen overflow-x-hidden bg-site-bg font-sans text-site-ink transition-colors duration-500"
    >
      {/* the page's backdrop: soft light, no WebGL */}
      <AtmosphericWebGlStage />

      {/* Glass Top Navigation Bar */}
      <TopNav />

      {/* Main Narrative Stack */}
      <main id="main" className="relative z-10 w-full flex flex-col items-center">
        {/* 01: Curved 3D Elliptical Hero Stage */}
        <section id="hero" className="w-full">
          <ScrollTimelineHero />
        </section>

        {/* 01.8: Complete Studio Tools & Features Matrix (from VIDEO_STUDIO_PRESENTATION.md) */}
        <section id="all-features" className="w-full py-16 sm:py-24 px-4 sm:px-8 lg:px-12 max-w-7xl mx-auto">
          <AllToolsFeaturesShowcaseSection />
        </section>

        {/* 02: Sequential Borderless Showcases with Scroll-Driven 3D Parallax */}
        <section id="features" className="w-full py-16 sm:py-24 px-4 sm:px-8 lg:px-12 max-w-7xl mx-auto">
          {/* Section Lead Banner */}
          <div className="text-center mb-16 sm:mb-20">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-500/10 border border-purple-400/25 text-purple-300 text-xs font-mono uppercase tracking-widest mb-4">
              ✨ Next-Gen Video Suite
            </div>
            <h2 className={`text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight ${isLight ? "text-slate-900" : "text-white"}`}>
              Engineered For Every Dimension Of Video
            </h2>
            <p className={`text-sm sm:text-base max-w-2xl mx-auto mt-4 leading-relaxed ${isLight ? "text-slate-600" : "text-slate-400"}`}>
              Real-time alpha cutouts, neural video synthesis, multi-layer overlays, and cross-platform format mastering.
            </p>
          </div>

          {/* Sequential Floating Borderless Showcases with Scroll-Driven 3D Parallax */}
          <div className="space-y-28 sm:space-y-40">
            {/* 01 AI Cutout & Green Screen */}
            <ScrollMotionCard>
              <AiCutoutModule />
            </ScrollMotionCard>

            {/* 02 Overlay & Composition */}
            <ScrollMotionCard>
              <OverlayCompositionModule />
            </ScrollMotionCard>

            {/* 03 Motion Tracking */}
            <ScrollMotionCard>
              <MotionTrackingModule />
            </ScrollMotionCard>

            {/* 04 AI Video Generation Preview */}
            <ScrollMotionCard>
              <AiGenerationModule />
            </ScrollMotionCard>

            {/* 06 Any Format. Any Platform. */}
            <ScrollMotionCard>
              <PlatformFormatsModule />
            </ScrollMotionCard>

            {/* 07 Compare & Review */}
            <ScrollMotionCard>
              <CompareReviewModule />
            </ScrollMotionCard>
          </div>
        </section>

        {/* 02.5: Workflow Use Cases */}
        <section id="use-cases" className="w-full py-16 sm:py-24 px-4 sm:px-8 lg:px-12 max-w-7xl mx-auto">
          <UseCasesSection />
        </section>

        {/* 03: High-Visibility Exploded 3D Layer Stack Section */}
        <section id="technology" className="w-full">
          <ExplodedLayerSection />
        </section>

        {/* 03.5: Production Templates Showcase */}
        <section id="templates" className="w-full py-16 sm:py-24 px-4 sm:px-8 lg:px-12 max-w-7xl mx-auto">
          <TemplatesShowcaseSection />
        </section>

        {/* 04: Config-Driven Pricing & Conversion Section */}
        <section id="pricing" className="w-full">
          <PricingSection initialPlans={initialPlans} />
          <EcosystemCtaSection />
        </section>

        <section id="faq" className="w-full">
          <FaqSection />
        </section>

        {/* 05: Developer & Creator Resources */}
        <section id="resources" className="w-full py-16 sm:py-24 px-4 sm:px-8 lg:px-12 max-w-7xl mx-auto">
          <ResourcesSection />
        </section>
      </main>

      {/* 06: Universal Grand Footer at the VERY BOTTOM of the website */}
      <FooterCTA />
    </div>
  );
}
