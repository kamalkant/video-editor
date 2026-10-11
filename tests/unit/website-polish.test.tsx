// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FaqSection, FAQS } from "@/components/website/sections/FaqSection";
import { ResourcesSection } from "@/components/website/sections/ResourcesSection";

afterEach(cleanup);

describe("website polish", () => {
  it("the FAQ answers the questions people ask before paying", () => {
    render(<FaqSection />);
    for (const f of FAQS) expect(screen.getByText(f.q)).toBeDefined();
    expect(FAQS.some((f) => f.a.includes("₹0"))).toBe(true);
    expect(FAQS.some((f) => /GST/.test(f.q))).toBe(true);
  });

  it("resource cards open real pages (none fall back to the editor)", () => {
    render(<ResourcesSection />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/#templates", "/#faq", "/roadmap"]));
    expect(hrefs).not.toContain("/editor");
  });

  it("no invented numbers or 'open source' claims are left in the rendered resources", () => {
    const { container } = render(<ResourcesSection />);
    expect(container.textContent).not.toMatch(/12,000|Open Source|Discord/);
  });
});
