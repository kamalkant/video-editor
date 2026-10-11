"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { useResolvedTheme } from "@/lib/editor/theme";
import { useAuth } from "@/lib/auth/AuthContext";

export type PlanData = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  interval: string;
  currency: string;
  price_amount: number;
  tax_rate_percent: number;
  trial_days: number;
  ai_credits_monthly: number;
  device_limit: number;
  features: string[];
  is_active: boolean;
  is_public: boolean;
};

const DEFAULT_PLANS: PlanData[] = [
  {
    id: "plan_free",
    name: "Free Tier",
    slug: "free",
    description: "Ideal for beginners and hobbyists creating quick video clips.",
    interval: "monthly",
    currency: "INR",
    price_amount: 0,
    tax_rate_percent: 18,
    trial_days: 0,
    ai_credits_monthly: 10,
    device_limit: 1,
    features: [
      "720p & 1080p Export",
      "Standard Transitions & Effects",
      "10 AI Studio Credits",
      "1 Active Device Session",
      "Local-first .VDO storage",
    ],
    is_active: true,
    is_public: true,
  },
  {
    id: "plan_weekly_pro",
    name: "Weekly Pro",
    slug: "weekly-pro",
    description: "Short-term access for fast turnaround projects and event editing.",
    interval: "weekly",
    currency: "INR",
    price_amount: 29900,
    tax_rate_percent: 18,
    trial_days: 3,
    ai_credits_monthly: 60,
    device_limit: 2,
    features: [
      "Up to 4K 60fps Export",
      "720p Fast Proxy Editing",
      "Full AI Suite (Voiceover & Subtitles)",
      "2 Active Device Sessions",
      "No Watermarks",
      "Priority support",
    ],
    is_active: true,
    is_public: true,
  },
  {
    id: "plan_monthly_pro",
    name: "Monthly Pro",
    slug: "monthly-pro",
    description: "Our most popular plan for digital creators, YouTubers, and freelancers.",
    interval: "monthly",
    currency: "INR",
    price_amount: 99900,
    tax_rate_percent: 18,
    trial_days: 7,
    ai_credits_monthly: 250,
    device_limit: 2,
    features: [
      "Up to 4K 60fps Export",
      "Transparent VP9 WebM Alpha Export",
      "Fast Proxy Editing & OPFS Cache",
      "250 AI Studio Credits per month",
      "2 Active Device Sessions",
      "Automatic Audio Metering & Limiting",
      "Custom Brand Kits",
    ],
    is_active: true,
    is_public: true,
  },
  {
    id: "plan_annual_studio",
    name: "Annual Studio",
    slug: "annual-studio",
    description: "Maximum power and savings for production studios and professional editors.",
    interval: "yearly",
    currency: "INR",
    price_amount: 799900,
    tax_rate_percent: 18,
    trial_days: 14,
    ai_credits_monthly: 3500,
    device_limit: 4,
    features: [
      "Everything in Monthly Pro",
      "4 Active Device Sessions",
      "3,500 AI Studio Credits annually",
      "Parallel-Track Multicam Editing",
      "Priority support & early access",
      "Dedicated Technical Support",
      "Save over 33% annually",
    ],
    is_active: true,
    is_public: true,
  },
];

function formatPrice(amountInPaise: number, currency: string) {
  if (amountInPaise === 0) return "₹0";
  const num = amountInPaise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 0,
  }).format(num);
}

function formatInterval(interval: string) {
  switch (interval.toLowerCase()) {
    case "weekly":
      return "/week";
    case "monthly":
      return "/mo";
    case "yearly":
      return "/yr";
    default:
      return `/${interval}`;
  }
}

// Row width and card width by plan count (literal classes, so Tailwind sees them). gap-6 = 1.5rem.
const PLAN_ROW: Record<number, { row: string; card: string }> = {
  1: { row: "max-w-md", card: "w-full" },
  2: { row: "max-w-4xl", card: "w-full md:w-[calc((100%-1.5rem)/2)]" },
  3: { row: "max-w-6xl", card: "w-full md:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-3rem)/3)]" },
  4: { row: "", card: "w-full md:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-4.5rem)/4)]" },
};

export function PricingSection({ initialPlans }: { initialPlans?: PlanData[] }) {
  const { user } = useAuth();
  const [plans, setPlans] = useState<PlanData[]>(initialPlans || DEFAULT_PLANS);
  const [userSubscription, setUserSubscription] = useState<any>(null);
  const theme = useResolvedTheme();
  const isLight = theme === "light";

  // When logged in, fetch user's active subscription so we know their active plan
  useEffect(() => {
    if (!user) {
      setUserSubscription(null);
      return;
    }
    let mounted = true;
    fetch("/api/user/subscription")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (mounted && data?.ok) {
          setUserSubscription(data);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [user]);

  // Re-fetch client-side to ensure admin changes reflect immediately without full page cache
  useEffect(() => {
    let mounted = true;
    async function fetchLivePlans() {
      try {
        const res = await fetch("/api/plans");
        if (res.ok) {
          const data = await res.json();
          if (mounted && Array.isArray(data.plans) && data.plans.length > 0) {
            setPlans(data.plans);
          }
        }
      } catch {
        // Fall back gracefully to initial or default plans
      }
    }
    fetchLivePlans();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="relative w-full px-4 sm:px-8 lg:px-12 py-20 sm:py-28 max-w-7xl mx-auto">
      {/* Section Header */}
      <div className="flex flex-col items-center text-center space-y-4 max-w-3xl mx-auto mb-14">
        <div className="inline-flex items-center gap-2 rounded-full border border-site-line bg-site-surface/70 px-3.5 py-1.5 text-xs font-medium uppercase tracking-[0.14em] text-site-muted">
          <Icon name="elements" className="size-3.5 text-cyan-400" />
          <span>Config-Driven Plans & Pricing</span>
        </div>

        <h2 className={`text-3xl sm:text-5xl font-black tracking-tight leading-tight ${
          isLight ? "text-slate-900" : "text-white"
        }`}>
          Simple, Transparent Plans for{" "}
          <span className="site-gradient-text">
            Every Creator.
          </span>
        </h2>

        <p className={`text-sm sm:text-base leading-relaxed ${
          isLight ? "text-slate-600" : "text-slate-400"
        }`}>
          Upgrade, change or cancel anytime. Prices in ₹ with GST invoices. Your source files stay in your own storage; AI features send only what they need, when you click them.
        </p>
      </div>

      {/* Pricing cards: as many columns as there are plans (up to 4), centred, so a removed plan leaves no gap */}
      <div className={`flex flex-wrap justify-center items-stretch gap-6 w-full mx-auto ${PLAN_ROW[Math.min(plans.length, 4)]?.row ?? ""}`}>
        {plans.map((plan, _i, all) => {
          const isFree = plan.price_amount === 0;
          const isPopular = plan.slug === "monthly-pro" || plan.id === "plan_monthly_pro";
          const isAnnual = plan.slug === "annual-studio" || plan.interval === "yearly";
          // the yearly saving, worked out from the real monthly price (not a fixed number)
          const monthly = all.find((x) => x.interval === "monthly" && x.price_amount > 0 && x.currency === plan.currency);
          const saving = isAnnual && monthly ? Math.round((1 - plan.price_amount / (monthly.price_amount * 12)) * 100) : 0;

          // Determine if this card represents the user's active plan
          const isCurrentPlan = Boolean(
            user && userSubscription?.plan && (
              userSubscription.plan.id === plan.id ||
              (isFree && (userSubscription.plan.price_amount === 0 || !userSubscription.plan.id))
            )
          );
          const userHasPaidPlan = Boolean(
            user && userSubscription?.plan && (userSubscription.plan.price_amount || 0) > 0
          );

          // CTA destination and label logic
          let ctaHref: string;
          let ctaText: string;

          if (user) {
            if (isFree) {
              ctaHref = "/editor";
              ctaText = isCurrentPlan ? "Active Plan (Open Studio)" : "Open Studio";
            } else {
              if (isCurrentPlan) {
                ctaHref = "/account/billing";
                ctaText = "Current Active Plan";
              } else {
                ctaHref = `/account/billing?plan=${plan.id}`;
                ctaText = userHasPaidPlan ? `Switch to ${plan.name}` : `Upgrade to ${plan.name}`;
              }
            }
          } else {
            // Unauthenticated visitor: sign up with next parameter
            ctaHref = isFree
              ? "/signup?next=/editor"
              : `/signup?next=${encodeURIComponent(`/account/billing?plan=${plan.id}`)}`;
            ctaText = isFree ? "Start Free in Studio" : `Get Started with ${plan.name}`;
          }

          return (
            <div
              key={plan.id}
              className={`${PLAN_ROW[Math.min(all.length, 4)]?.card ?? ""} relative rounded-3xl p-6 sm:p-7 flex flex-col justify-between transition-all duration-300 shadow-xl ${
                isCurrentPlan
                  ? isLight
                    ? "bg-white border-2 border-emerald-500 shadow-emerald-500/20 ring-2 ring-emerald-500/30 scale-[1.02] z-10"
                    : "bg-slate-900/95 border-2 border-emerald-500/80 shadow-[0_20px_50px_rgba(16,185,129,0.25)] ring-1 ring-emerald-500/50 scale-[1.02] z-10"
                  : isPopular
                  ? "z-10 border border-purple-400/60 bg-site-surface shadow-[var(--site-shadow-glow)] lg:scale-[1.03]"
                  : "border border-site-line bg-site-surface/70 shadow-[var(--site-shadow-card)] hover:-translate-y-1 hover:border-purple-400/30"
              }`}
            >
              {/* Badge for Current, Popular, or Annual */}
              {isCurrentPlan ? (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-full bg-emerald-500 text-slate-950 text-xs font-extrabold uppercase tracking-wider shadow-md flex items-center gap-1.5">
                  <Icon name="check" className="size-3 text-slate-950 stroke-[3]" />
                  <span>Your Current Plan</span>
                </div>
              ) : isPopular ? (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-site-accent-fill px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-md">
                  ★ Most Popular
                </div>
              ) : isAnnual && saving > 0 ? (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-full bg-cyan-500 text-slate-950 text-xs font-extrabold uppercase tracking-wider shadow-md">
                  Save {saving}%
                </div>
              ) : null}

              {/* Card Body */}
              <div className="space-y-5">
                <div>
                  <h3 className={`text-xl font-bold tracking-tight ${isLight ? "text-slate-900" : "text-white"}`}>
                    {plan.name}
                  </h3>
                  <p className={`text-xs mt-1.5 line-clamp-2 leading-relaxed ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                    {plan.description || "Everything you need to create stunning video projects."}
                  </p>
                </div>

                {/* Price Display */}
                <div className="pt-2 pb-1 border-y border-line/40">
                  <div className="flex items-baseline gap-1">
                    <span className="font-display text-4xl font-bold tracking-tight text-site-ink">
                      {formatPrice(plan.price_amount, plan.currency)}
                    </span>
                    <span className={`text-xs font-semibold ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                      {formatInterval(plan.interval)}
                    </span>
                  </div>
                  <div className="text-xs text-muted font-mono mt-1">
                    {isFree ? "Free forever • No credit card" : "+18% GST calculated at checkout"}
                  </div>
                </div>

                {/* Key Spec Badges */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold ${
                    isLight ? "bg-slate-100 text-slate-700" : "bg-slate-800 text-slate-300"
                  }`}>
                    <Icon name="monitor" className="size-3 text-cyan-400" />
                    <span>{plan.device_limit} {plan.device_limit === 1 ? "Device" : "Devices"}</span>
                  </span>

                  <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold ${
                    isLight ? "bg-purple-50 text-purple-700" : "bg-purple-950/40 text-purple-300 border border-purple-800/40"
                  }`}>
                    <Icon name="sparkles" className="size-3 text-purple-400" />
                    <span>{plan.ai_credits_monthly} AI Credits</span>
                  </span>

                  {plan.trial_days > 0 && (
                    <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold ${
                      isLight ? "bg-emerald-50 text-emerald-700" : "bg-emerald-950/40 text-emerald-300 border border-emerald-800/40"
                    }`}>
                      <span>{plan.trial_days}-day free trial</span>
                    </span>
                  )}
                </div>

                {/* Plan Features List */}
                <div className="space-y-2 pt-2">
                  <div className="text-xs font-mono font-bold uppercase tracking-wider text-muted">
                    Included Capabilities
                  </div>
                  <ul className="space-y-2 text-xs">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Icon
                          name="check"
                          className={`size-3.5 shrink-0 mt-0.5 ${
                            isPopular ? "text-site-accent" : "text-cyan-400"
                          }`}
                        />
                        <span className={`leading-tight ${isLight ? "text-slate-700" : "text-slate-300"}`}>
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Call to Action Button */}
              <div className="pt-6 mt-6 border-t border-line/40">
                <Link
                  href={ctaHref}
                  className={`flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2 text-center text-sm font-semibold leading-tight transition-all duration-200 ${
                    isCurrentPlan
                      ? "bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/25"
                      : isPopular
                      ? "site-btn-primary"
                      : "site-btn-ghost"
                  }`}
                >
                  <span>{ctaText}</span>
                  <Icon name={isCurrentPlan ? "check" : "chevronRight"} className="size-3.5 shrink-0" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Trust & Invariance Guarantee Notice */}
      <div className={`mt-14 p-4 sm:p-5 rounded-2xl border text-center max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-3 text-xs ${
        isLight ? "bg-slate-50 border-slate-200 text-slate-600" : "bg-slate-900/50 border-slate-800 text-slate-400"
      }`}>
        <div className="size-8 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
          <Icon name="check" className="size-4" />
        </div>
        <div className="text-left">
          <span className={`font-bold ${isLight ? "text-slate-900" : "text-slate-200"}`}>
            Local-First Media Invariance Guarantee:
          </span>{" "}
          Your high-resolution master video files remain on your local disk. Project files are never held hostage or deleted if a subscription lapses.
        </div>
      </div>
    </div>
  );
}
