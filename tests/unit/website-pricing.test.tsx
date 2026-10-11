// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import React from "react";
import { PricingSection, type PlanData } from "../../components/website/sections/PricingSection";
import { AuthProvider } from "../../lib/auth/AuthContext";
import { GET as getPlansRoute } from "../../app/api/plans/route";

const samplePlans: PlanData[] = [
  {
    id: "plan_free",
    name: "Free Tier",
    slug: "free",
    description: "Ideal for beginners",
    interval: "monthly",
    currency: "INR",
    price_amount: 0,
    tax_rate_percent: 18,
    trial_days: 0,
    ai_credits_monthly: 10,
    device_limit: 1,
    features: ["720p Export", "Standard Effects", "10 AI Credits"],
    is_active: true,
    is_public: true,
  },
  {
    id: "plan_weekly_pro",
    name: "Weekly Pro",
    slug: "weekly-pro",
    description: "Fast turnaround projects",
    interval: "weekly",
    currency: "INR",
    price_amount: 29900,
    tax_rate_percent: 18,
    trial_days: 3,
    ai_credits_monthly: 60,
    device_limit: 2,
    features: ["4K 60fps Export", "Fast Proxy Editing", "60 AI Credits"],
    is_active: true,
    is_public: true,
  },
  {
    id: "plan_monthly_pro",
    name: "Monthly Pro",
    slug: "monthly-pro",
    description: "Most popular for creators",
    interval: "monthly",
    currency: "INR",
    price_amount: 99900,
    tax_rate_percent: 18,
    trial_days: 7,
    ai_credits_monthly: 250,
    device_limit: 2,
    features: ["4K Export", "VP9 Alpha WebM", "250 AI Credits", "Brand Kits"],
    is_active: true,
    is_public: true,
  },
  {
    id: "plan_annual_studio",
    name: "Annual Studio",
    slug: "annual-studio",
    description: "Maximum savings for studios",
    interval: "yearly",
    currency: "INR",
    price_amount: 799900,
    tax_rate_percent: 18,
    trial_days: 14,
    ai_credits_monthly: 3500,
    device_limit: 4,
    features: ["Everything in Pro", "4 Devices", "3,500 AI Credits", "Multicam"],
    is_active: true,
    is_public: true,
  },
];

describe("Config-Driven Website Pricing Section", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("1. Public GET /api/plans returns 200 OK with active plans", async () => {
    const res = await getPlansRoute();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.plans)).toBe(true);
    expect(body.plans.length).toBeGreaterThanOrEqual(4);

    const freePlan = body.plans.find((p: any) => p.slug === "free");
    expect(freePlan).toBeDefined();
    expect(freePlan.price_amount).toBe(0);

    const monthlyPlan = body.plans.find((p: any) => p.slug === "monthly-pro");
    expect(monthlyPlan).toBeDefined();
    expect(monthlyPlan.price_amount).toBe(99900);
  });

  it("2. PricingSection renders all 4 plans in responsive columns", () => {
    render(<PricingSection initialPlans={samplePlans} />);

    expect(screen.getByText("Free Tier")).toBeDefined();
    expect(screen.getByText("Weekly Pro")).toBeDefined();
    expect(screen.getByText("Monthly Pro")).toBeDefined();
    expect(screen.getByText("Annual Studio")).toBeDefined();
  });

  it("3. Formats prices, currency symbols, and billing intervals accurately", () => {
    render(<PricingSection initialPlans={samplePlans} />);

    // Free Tier price
    expect(screen.getByText("₹0")).toBeDefined();
    expect(screen.getByText("/week")).toBeDefined();

    // Key spec badges
    expect(screen.getByText("1 Device")).toBeDefined();
    expect(screen.getAllByText(/2 Devices/i).length).toBe(2);
    expect(screen.getAllByText(/4 Devices/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/10 AI Credits/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/250 AI Credits/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/3500 AI Credits/i).length).toBeGreaterThan(0);
  });

  it("4. Highlights '★ Most Popular' badge on Monthly Pro card", () => {
    render(<PricingSection initialPlans={samplePlans} />);

    const popularBadge = screen.getByText("★ Most Popular");
    expect(popularBadge).toBeDefined();

    const saveBadge = screen.getByText("Save 33%");
    expect(saveBadge).toBeDefined();
  });

  it("5. Sets appropriate CTA destinations for Free vs Paid plans", () => {
    render(<PricingSection initialPlans={samplePlans} />);

    // Free tier links to Studio
    const freeCta = screen.getByRole("link", { name: /Start Free in Studio/i });
    // a visitor signs up first (the editor itself needs an account)
    expect(freeCta.getAttribute("href")).toBe("/signup?next=/editor");

    // Monthly Pro links to signup with redirect to billing checkout
    const monthlyCta = screen.getByRole("link", { name: /Get Started with Monthly Pro/i });
    expect(monthlyCta.getAttribute("href")).toContain("/signup?next=");
    expect(monthlyCta.getAttribute("href")).toContain("plan_monthly_pro");

    // Annual Studio links to signup with redirect to billing checkout
    const annualCta = screen.getByRole("link", { name: /Get Started with Annual Studio/i });
    expect(annualCta.getAttribute("href")).toContain("/signup?next=");
    expect(annualCta.getAttribute("href")).toContain("plan_annual_studio");
  });

  it("6. Re-fetches /api/plans client-side and dynamically updates when config changes", async () => {
    const updatedPlans = [
      ...samplePlans.map((p) =>
        p.id === "plan_monthly_pro"
          ? { ...p, price_amount: 89900, name: "Monthly Creator Special" }
          : p
      ),
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, plans: updatedPlans }),
    });

    render(<PricingSection initialPlans={samplePlans} />);

    // Wait for the client-side fetch to reflect dynamic admin change
    await waitFor(() => {
      expect(screen.getByText("Monthly Creator Special")).toBeDefined();
    });
  });

  it("7. Sets direct checkout and billing destinations without signup when user is logged in", () => {
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
        <PricingSection initialPlans={samplePlans} />
      </AuthProvider>
    );

    // Free tier links directly to Studio without signup
    const freeCta = screen.getByRole("link", { name: /Open Studio/i });
    expect(freeCta.getAttribute("href")).toBe("/editor");

    // Monthly Pro links directly to billing checkout without signup
    const monthlyCta = screen.getByRole("link", { name: /Monthly Pro/i });
    expect(monthlyCta.getAttribute("href")).toBe("/account/billing?plan=plan_monthly_pro");
    expect(monthlyCta.getAttribute("href")).not.toContain("/signup");

    // Annual Studio links directly to billing checkout without signup
    const annualCta = screen.getByRole("link", { name: /Annual Studio/i });
    expect(annualCta.getAttribute("href")).toBe("/account/billing?plan=plan_annual_studio");
    expect(annualCta.getAttribute("href")).not.toContain("/signup");
  });
});
