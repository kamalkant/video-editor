// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { PricingSection, type PlanData } from "../../components/website/sections/PricingSection";

const plan = (id: string, price: number): PlanData => ({
  id, name: `Plan ${id}`, slug: id, description: "", interval: "monthly", currency: "INR", price_amount: price,
  tax_rate_percent: 18, trial_days: 0, ai_credits_monthly: 10, device_limit: 1, features: ["x"], is_active: true, is_public: true,
});
const card = (id: string) => screen.getByText(`Plan ${id}`).closest("[class*='rounded-3xl']")!;
const plans = (n: number) => Array.from({ length: n }, (_, i) => plan(`p${i + 1}`, (i + 1) * 100));

describe("pricing cards fill the row, whatever the plan count", () => {
  afterEach(cleanup);

  it.each([
    [4, "lg:w-[calc((100%-4.5rem)/4)]"],
    [3, "lg:w-[calc((100%-3rem)/3)]"],
    [2, "md:w-[calc((100%-1.5rem)/2)]"],
  ])("%i plans: every card takes an equal share", (n, width) => {
    render(<PricingSection initialPlans={plans(n)} />);
    for (let i = 1; i <= n; i++) expect(card(`p${i}`).className).toContain(width);
    // a centred, wrapping row: an archived plan leaves no empty slot
    expect(card("p1").parentElement!.className).toContain("justify-center");
  });

  it("a single plan is centred at a readable width, not stretched across the page", () => {
    render(<PricingSection initialPlans={plans(1)} />);
    expect(card("p1").parentElement!.className).toContain("max-w-md");
  });
});
