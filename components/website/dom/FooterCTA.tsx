"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { SiteVideo } from "../media/SiteVideo";

const LINKS: Array<{ title: string; items: Array<{ label: string; href: string }> }> = [
  {
    title: "Product",
    items: [
      { label: "Features", href: "/#features" },
      { label: "Use Cases", href: "/#use-cases" },
      { label: "Technology", href: "/#technology" },
      { label: "Templates", href: "/#templates" },
      { label: "Pricing", href: "/#pricing" },
      { label: "Open the editor", href: "/editor" },
    ],
  },
  {
    title: "Resources",
    items: [
      { label: "Developer hub", href: "/#resources" },
      { label: "Embed a transparent video", href: "/#resources" },
      { label: "Questions, answered", href: "/#faq" },
      { label: "What's new & coming", href: "/roadmap" },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Sign in", href: "/login" },
      { label: "Create account", href: "/signup" },
      { label: "Billing & plans", href: "/account/billing" },
      { label: "Refer a friend", href: "/account/referrals" },
    ],
  },
];

// what the editor is built on (as it is in the code: lib/player, lib/tracking, lib/render)
const BUILT_WITH = ["WebGL colour & keying", "FFmpeg exports", "Optical-flow tracking", "Gemini AI (captions, dubbing)", "Apple VideoToolbox (Mac)"];

/** The closing call to action and the site footer. */
export function FooterCTA() {
  return (
    <footer className="relative z-20 w-full select-none border-t border-site-line bg-site-bg pb-10 text-site-muted">
      {/* the closing band: real footage, dimmed behind the headline */}
      <div className="relative isolate overflow-hidden border-b border-site-line">
        <div className="absolute inset-0 -z-10 opacity-35">
          <SiteVideo media="hikerAr" showPlayButton={false} className="h-full w-full object-cover" />
        </div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-site-bg via-site-bg/70 to-site-bg" />
        <div aria-hidden="true" className="absolute left-1/2 top-1/2 -z-10 h-72 w-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-600/25 blur-[120px]" />

        <div className="mx-auto max-w-3xl space-y-6 px-6 py-24 text-center sm:py-32">
          <div className="inline-flex items-center gap-2 rounded-full border border-site-line bg-site-surface/70 px-3.5 py-1 text-xs font-medium text-site-muted backdrop-blur-md">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            Free plan · ₹ pricing · GST invoices
          </div>
          <h2 className="text-[clamp(2.25rem,4vw+1rem,4.25rem)] font-bold leading-[1.05] text-site-ink">
            Ready to <span className="site-gradient-text">Rethink Video?</span>
          </h2>
          <p className="mx-auto max-w-xl text-base leading-relaxed text-site-muted">
            Nothing to install: edit in your browser, with captions, dubbing and every social size in one place. Start free, upgrade when you need 4K and more AI.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link href="/signup?next=/editor" className="site-btn-primary inline-flex min-h-12 items-center gap-2 rounded-full px-7 text-sm font-semibold">
              <span>Start free</span>
              <span aria-hidden="true">→</span>
            </Link>
            <Link href="/editor" className="site-btn-ghost inline-flex min-h-12 items-center gap-2 rounded-full px-6 text-sm font-semibold">
              <Icon name="play" className="size-4" />
              <span>Open ViPlay Studio</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12">
        <div className="grid grid-cols-2 gap-10 py-14 text-sm md:grid-cols-12">
          <div className="col-span-2 space-y-4 md:col-span-4">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <img src="/vdo-icon.png" alt="" width={28} height={28} className="size-7 object-contain" />
              <span className="font-display text-xl font-bold tracking-tight text-site-ink">ViPlay Studio</span>
            </Link>
            <p className="max-w-xs leading-relaxed">The AI video editor for Reels, Shorts and YouTube, in your browser.</p>
            <div className="rounded-2xl border border-site-line bg-site-surface/60 p-4 text-xs leading-relaxed">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-site-ink">
                <Icon name="lock" className="size-3.5 text-emerald-400" />
                Your files, your storage
              </div>
              Your source files stay in your own storage. AI features send only what they need, such as a clip&apos;s sound for captions, and only when you click them.
            </div>
          </div>

          {LINKS.map((col) => (
            <nav key={col.title} aria-label={col.title} className="space-y-3 md:col-span-2">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-site-ink">{col.title}</div>
              <ul className="space-y-2.5">
                {col.items.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="transition hover:text-site-ink">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <div className="space-y-3 md:col-span-2">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-site-ink">Built with</div>
            <ul className="space-y-2.5">
              {BUILT_WITH.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-site-line pt-8 text-xs sm:flex-row">
          <span>© 2026 ViPlay Studio. All rights reserved.</span>
          <a href="/roadmap" className="transition hover:text-site-ink">
            What&apos;s new &amp; coming
          </a>
        </div>
      </div>
    </footer>
  );
}
