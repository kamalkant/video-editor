// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { TopNav } from "@/components/website/dom/TopNav";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { ScrollTimelineHero } from "@/components/website/hero/ScrollTimelineHero";
import { VideoEditorShowcaseSection } from "@/components/website/sections/VideoEditorShowcaseSection";
import { AllToolsFeaturesShowcaseSection } from "@/components/website/sections/AllToolsFeaturesShowcaseSection";
import { UseCasesSection } from "@/components/website/sections/UseCasesSection";
import { TemplatesShowcaseSection } from "@/components/website/sections/TemplatesShowcaseSection";
import { ResourcesSection } from "@/components/website/sections/ResourcesSection";
import { AiCutoutModule } from "@/components/website/modules/AiCutoutModule";
import { OverlayCompositionModule } from "@/components/website/modules/OverlayCompositionModule";
import { MotionTrackingModule } from "@/components/website/modules/MotionTrackingModule";
import { AiGenerationModule } from "@/components/website/modules/AiGenerationModule";
import { TimelinePreviewModule } from "@/components/website/modules/TimelinePreviewModule";
import { PlatformFormatsModule } from "@/components/website/modules/PlatformFormatsModule";
import { CompareReviewModule } from "@/components/website/modules/CompareReviewModule";
import { ShareAnywhereModule } from "@/components/website/modules/ShareAnywhereModule";
import { MarketingWebsite } from "@/components/website/MarketingWebsite";

describe("VDO Premium Website Master Experience", () => {
  afterEach(cleanup);

  it("TopNav renders transparent header with ViPlay logo, links, Globe, and authentication CTAs", () => {
    render(<TopNav />);
    expect(screen.getByText("ViPlay")).toBeDefined();
    expect(screen.getByText("Features").closest("a")?.getAttribute("href")).toBe("/#features");
    expect(screen.getByText("Use Cases").closest("a")?.getAttribute("href")).toBe("/#use-cases");
    expect(screen.getByText("Technology").closest("a")?.getAttribute("href")).toBe("/#technology");
    expect(screen.getByText("Templates").closest("a")?.getAttribute("href")).toBe("/#templates");
    expect(screen.getByText("Pricing").closest("a")?.getAttribute("href")).toBe("/#pricing");
    expect(screen.getByText("Resources").closest("a")?.getAttribute("href")).toBe("/#resources");

    // Language selector removed per user request
    expect(screen.queryByLabelText("Language selector")).toBeNull();
    expect(screen.getByTestId("theme-toggle-button")).toBeDefined();

    // Sign In → /login?next=/editor; Try ViPlay → /signup?next=/editor
    const signIn = screen.getByText("Sign In");
    expect(signIn.getAttribute("href")).toBe("/login?next=/editor");

    // a new visitor signs up first (then lands in the editor)
    const tryVdo = screen.getByText(/Try ViPlay/);
    expect(tryVdo.getAttribute("href")).toBe("/signup?next=/editor");
  });

  it("TopNav renders authenticated user state with user pill and Go to Studio link", () => {
    const mockUser = {
      id: "u-1",
      email: "alex@vdo.studio",
      name: "Alex Creator",
      role: "creator" as const,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    };

    render(
      <AuthProvider initialUser={mockUser}>
        <TopNav />
      </AuthProvider>
    );

    expect(screen.getByLabelText("User profile menu")).toBeDefined();
    expect(screen.getByText("A")).toBeDefined();
    expect(screen.getByText("Go to Studio")).toBeDefined();
    const studioLink = screen.getByText("Go to Studio").closest("a");
    expect(studioLink?.getAttribute("href")).toBe("/editor");
  });

  it("TopNav dynamically applies blur backdrop effect when user scrolls", () => {
    const { container } = render(<TopNav />);
    const header = container.querySelector("header");
    expect(header).toBeDefined();
    expect(header?.className).toContain("bg-transparent");

    // Simulate scroll down
    Object.defineProperty(window, "scrollY", { value: 60, writable: true });
    fireEvent.scroll(window);
    expect(header?.className).toContain("backdrop-blur-xl");

    // Simulate scroll back to top
    Object.defineProperty(window, "scrollY", { value: 0, writable: true });
    fireEvent.scroll(window);
    expect(header?.className).toContain("bg-transparent");
  });

  it("VideoEditorShowcaseSection renders 10s interactive video editor with timeline, clips, and studio CTA", () => {
    render(<VideoEditorShowcaseSection />);
    expect(screen.getByText(/Live Web Studio Experience/)).toBeDefined();
    expect(screen.getByText(/Right Inside Your Browser/)).toBeDefined();
    expect(screen.getByText("Cyber Grid 4K.vdo")).toBeDefined();
    expect(screen.getByText("Open in Studio")).toBeDefined();
    expect(screen.getByText("V1 • 4K Master")).toBeDefined();
    expect(screen.getByText("00:10 (Max)")).toBeDefined();

    // Check Open in Studio links to /editor
    const openInStudio = screen.getByText("Open in Studio").closest("a");
    expect(openInStudio?.getAttribute("href")).toBe("/editor");
  });

  it("AllToolsFeaturesShowcaseSection renders 22 tools matrix with search and category filtering", () => {
    render(<AllToolsFeaturesShowcaseSection />);
    expect(screen.getByText(/The Complete Creator Arsenal/)).toBeDefined();
    expect(screen.getByText(/Audio & Music Library/)).toBeDefined();
    expect(screen.getByText(/Stock & Media Library/)).toBeDefined();
    expect(screen.getByText(/AI Cutout & Chroma Key/)).toBeDefined();
    expect(screen.getByText(/Transparent Web Avatars/)).toBeDefined();
    expect(screen.getByText(/Apple VideoToolbox Export/)).toBeDefined();

    // Test live search filter
    const searchInput = screen.getByPlaceholderText(/Search all 22 features/);
    fireEvent.change(searchInput, { target: { value: "stock" } });
    expect(screen.getByText(/Stock & Media Library/)).toBeDefined();
    expect(screen.queryByText(/Audio & Music Library/)).toBeNull();

    // Click on card to verify Quick-Look modal opens
    fireEvent.click(screen.getByText(/Stock & Media Library/));
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText(/Technical Capabilities & Specs/)).toBeDefined();
    expect(screen.getByText(/Close \(Esc\)/)).toBeDefined();
  });

  it("ScrollTimelineHero renders 3D horizontal timeline hero with video controls and format badges", () => {
    render(<ScrollTimelineHero mousePos={{ x: 0, y: 0 }} />);
    expect(screen.getByText("Limits.")).toBeDefined();
    expect(screen.getAllByText(/Try ViPlay Free/).length).toBeGreaterThan(0);
    expect(screen.getByText("Watch Video")).toBeDefined();

    // Feature badges
    expect(screen.getByText("Ultra Fast")).toBeDefined();
    expect(screen.getByText("Any Format")).toBeDefined();
    expect(screen.getByText("Transparent Video")).toBeDefined();
    expect(screen.getByText("AI Powered")).toBeDefined();

    // Tool badges
    expect(screen.getByText("AI Tools")).toBeDefined();
    expect(screen.getByText("Green Screen")).toBeDefined();
    expect(screen.getByText("Effects")).toBeDefined();
    expect(screen.getByText("4K Export")).toBeDefined();

    // Timeline timecode markers
    expect(screen.getAllByText("00:00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("00:05").length).toBeGreaterThan(0);
    expect(screen.getAllByText("00:10").length).toBeGreaterThan(0);

    // Scroll to explore indicator
    expect(screen.getByText("Scroll to explore")).toBeDefined();
  });

  it("01 AiCutoutModule renders Before/After split stage and interactive filter tags", () => {
    render(<AiCutoutModule />);
    expect(screen.getByText("01")).toBeDefined();
    expect(screen.getByText("AI Cutout & Green Screen")).toBeDefined();
    expect(screen.getByText(/Remove backgrounds/)).toBeDefined();
    expect(screen.getByText("Before")).toBeDefined();
    expect(screen.getByText("After (Transparent)")).toBeDefined();

    // Tag buttons
    const greenScreenTag = screen.getByText("Green Screen");
    fireEvent.click(greenScreenTag);
    expect(greenScreenTag).toBeDefined();
  });

  it("02 OverlayCompositionModule renders multi-layer panel with toggles", () => {
    render(<OverlayCompositionModule />);
    expect(screen.getByText("02")).toBeDefined();
    expect(screen.getByText("Overlay & Composition")).toBeDefined();
    expect(screen.getAllByText(/Combine videos, images and avatars/).length).toBeGreaterThan(0);
    expect(screen.getByText("Avatar (Alpha)")).toBeDefined();
    expect(screen.getByText("Background Video")).toBeDefined();
    expect(screen.getByText("Text Title")).toBeDefined();
    expect(screen.getByText("Graphics / HUD")).toBeDefined();
    expect(screen.getByText("Effects (Glow)")).toBeDefined();
  });

  it("03 MotionTrackingModule renders animated car tracking box and functional Blur toggle", () => {
    render(<MotionTrackingModule />);
    expect(screen.getByText("03")).toBeDefined();
    expect(screen.getByText("Motion Tracking")).toBeDefined();
    expect(screen.getByText(/Track objects, blur areas/)).toBeDefined();
    expect(screen.getByText(/Privacy Blur Tracking/)).toBeDefined();
    // (no invented confidence number any more: just the tracked point)
    expect(screen.getByText(/Optical Flow/)).toBeDefined();

    const blurBtn = screen.getByText("Blur Active");
    fireEvent.click(blurBtn);
    expect(screen.getByText("Disabled")).toBeDefined();
  });

  it("04 AiGenerationModule renders prompt input and generate button", () => {
    render(<AiGenerationModule />);
    expect(screen.getByText("04")).toBeDefined();
    expect(screen.getByText("AI Video Generation Preview")).toBeDefined();
    expect(screen.getByText(/Generate, review and refine/)).toBeDefined();
    // the pictures are examples, and the button says so
    expect(screen.getByRole("button", { name: /Show an example/ })).toBeDefined();

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "A futuristic ocean with bioluminescent whales" } });
    expect(screen.getByDisplayValue("A futuristic ocean with bioluminescent whales")).toBeDefined();
  });

  it("05 TimelinePreviewModule renders multi-track timeline, playhead, and audio waveform", () => {
    render(<TimelinePreviewModule />);
    expect(screen.getByText("05")).toBeDefined();
    expect(screen.getByText("Timeline Preview")).toBeDefined();
    expect(screen.getByText("Video")).toBeDefined();
    expect(screen.getByText("Audio")).toBeDefined();
    expect(screen.getByText("Music")).toBeDefined();
    expect(screen.getByText(/Frame-by-frame preview/)).toBeDefined();
  });

  it("06 PlatformFormatsModule renders 5 format cards with interactive metadata inspector", () => {
    render(<PlatformFormatsModule />);
    expect(screen.getByText("06")).toBeDefined();
    expect(screen.getByText("Any Format. Any Platform.")).toBeDefined();
    expect(screen.getAllByText("16:9").length).toBeGreaterThan(0);
    expect(screen.getAllByText("9:16").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1:1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("4K").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Alpha").length).toBeGreaterThan(0);

    // Switch active card
    const verticalCard = screen.getByText("Shorts & Reels");
    fireEvent.click(verticalCard);
    expect(screen.getByText(/2160 × 3840/)).toBeDefined();
  });

  it("07 CompareReviewModule renders split curtain comparison with mode selector", () => {
    render(<CompareReviewModule />);
    expect(screen.getByText("07")).toBeDefined();
    expect(screen.getByText("Compare & Review")).toBeDefined();
    expect(screen.getByText("Split")).toBeDefined();
    expect(screen.getByText("Side-by-Side")).toBeDefined();
    expect(screen.getByText("Diff")).toBeDefined();
    expect(screen.getByText(/Original/)).toBeDefined();
    expect(screen.getByText(/Generated V2/)).toBeDefined();

    // Switch to side-by-side mode
    const sideBtn = screen.getByText("Side-by-Side");
    fireEvent.click(sideBtn);
    expect(screen.getByText("Side-by-Side")).toBeDefined();
  });

  it("08 ShareAnywhereModule renders responsive embed snippet, copy action, and QR code", () => {
    render(<ShareAnywhereModule />);
    expect(screen.getByText("08")).toBeDefined();
    expect(screen.getByText("Share Anywhere")).toBeDefined();
    expect(screen.getByText("Copy")).toBeDefined();
    expect(screen.getByText("Play on Mobile")).toBeDefined();
    expect(screen.getByText("Share QR")).toBeDefined();
    expect(screen.getByText("Autoplay muted")).toBeDefined();
    expect(screen.getByText("Preserve Alpha Canvas")).toBeDefined();
  });

  it("UseCasesSection, TemplatesShowcaseSection, and ResourcesSection render properly", () => {
    const { unmount: u1 } = render(<UseCasesSection />);
    expect(screen.getByText(/Engineered For Every Workflow/)).toBeDefined();
    expect(screen.getAllByText(/Content Creators/).length).toBeGreaterThan(0);
    u1();

    const { unmount: u2 } = render(<TemplatesShowcaseSection />);
    expect(screen.getByText(/Studio Master Templates/)).toBeDefined();
    expect(screen.getByText(/Cyberpunk 4K Intro/)).toBeDefined();
    u2();

    const { unmount: u3 } = render(<ResourcesSection />);
    expect(screen.getByText(/Developer & Creator Hub/)).toBeDefined();
    expect(screen.getByText(/Dual-Stream HTML Embed Snippet/)).toBeDefined();
    u3();
  
});

    it("MarketingWebsite master root renders all sections seamlessly", async () => {
    render(<MarketingWebsite />);
    expect(screen.getByText("Limits.")).toBeDefined();
    // (the sections below the hero load as their own chunks: server-rendered on the site, a moment later here)
    expect(await screen.findByText("Engineered For Every Dimension Of Video", {}, { timeout: 5000 })).toBeDefined();
    expect((await screen.findAllByText("01", {}, { timeout: 5000 })).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("06", {}, { timeout: 5000 })).length).toBeGreaterThan(0);
    expect(screen.queryByText("Timeline Preview")).toBeNull();
    expect(screen.queryByText("Share Anywhere")).toBeNull();
    expect(screen.queryByText("Live Web Studio Experience")).toBeNull();
  });
});
