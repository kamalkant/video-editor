// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";
import { AdminLayoutShell } from "../../app/admin/AdminLayoutShell";

let currentPathname = "/admin";

vi.mock("next/navigation", () => ({
  usePathname: () => currentPathname,
}));

const mockUser = {
  id: "admin_1",
  name: "Kamal Kant",
  email: "admin@vdo.studio",
  role: "super_admin",
};

describe("Admin Layout: Top Header & Left Navigation", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders top header with brand, shortcuts, and user profile", () => {
    currentPathname = "/admin";
    render(
      <AdminLayoutShell user={mockUser}>
        <div>Page Content</div>
      </AdminLayoutShell>
    );

    expect(screen.getByText("ViPlay")).toBeDefined();
    expect(screen.getByText("Admin Suite")).toBeDefined();
    expect(screen.getByText("Kamal Kant")).toBeDefined();
    expect(screen.getByText("super_admin")).toBeDefined();
    expect(screen.getByText("Billing Portal")).toBeDefined();
    expect(screen.getByText("Studio")).toBeDefined();
    expect(screen.getByText("Page Content")).toBeDefined();
  });

  it("marks Dashboard as active when on /admin", () => {
    currentPathname = "/admin";
    render(
      <AdminLayoutShell user={mockUser}>
        <div>Page Content</div>
      </AdminLayoutShell>
    );

    const dashboardLinks = screen.getAllByRole("link", { name: /Dashboard/i });
    const activeDashboard = dashboardLinks.find((l) => l.getAttribute("aria-current") === "page");
    expect(activeDashboard).toBeDefined();
    expect(activeDashboard?.className).toContain("bg-primary text-white");

    const plansLinks = screen.getAllByRole("link", { name: /Plans & Pricing/i });
    expect(plansLinks[0].getAttribute("aria-current")).toBeNull();
    expect(plansLinks[0].className).toContain("text-muted");
  });

  it("marks Plans & Pricing as active when on /admin/plans", () => {
    currentPathname = "/admin/plans";
    render(
      <AdminLayoutShell user={mockUser}>
        <div>Page Content</div>
      </AdminLayoutShell>
    );

    const plansLinks = screen.getAllByRole("link", { name: /Plans & Pricing/i });
    const activePlans = plansLinks.find((l) => l.getAttribute("aria-current") === "page");
    expect(activePlans).toBeDefined();
    expect(activePlans?.className).toContain("bg-primary text-white");

    const dashboardLinks = screen.getAllByRole("link", { name: /Dashboard/i });
    expect(dashboardLinks[0].getAttribute("aria-current")).toBeNull();
  });

  it("marks Subscriptions & Payments as active when on /admin/subscriptions", () => {
    currentPathname = "/admin/subscriptions";
    render(
      <AdminLayoutShell user={mockUser}>
        <div>Page Content</div>
      </AdminLayoutShell>
    );

    const subsLinks = screen.getAllByRole("link", { name: /Subscriptions & Payments/i });
    const activeSubs = subsLinks.find((l) => l.getAttribute("aria-current") === "page");
    expect(activeSubs).toBeDefined();
    expect(activeSubs?.className).toContain("bg-primary text-white");
  });

  it("marks Coupons & Discounts as active when on /admin/coupons", () => {
    currentPathname = "/admin/coupons";
    render(
      <AdminLayoutShell user={mockUser}>
        <div>Page Content</div>
      </AdminLayoutShell>
    );

    const couponsLinks = screen.getAllByRole("link", { name: /Coupons & Discounts/i });
    const activeCoupons = couponsLinks.find((l) => l.getAttribute("aria-current") === "page");
    expect(activeCoupons).toBeDefined();
    expect(activeCoupons?.className).toContain("bg-primary text-white");
  });
});
