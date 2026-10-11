"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { useResolvedTheme } from "@/lib/editor/theme";

/** Resource cards: each opens a real page (or copies the real embed code). */
const RESOURCES = [
  {
    id: "embed-generator",
    title: "Dual-Stream HTML Embed Snippet",
    icon: "library" as const,
    desc: "The embed code for a see-through video avatar: MOV (HEVC alpha) for Safari and iPhone, WebM (VP9 alpha) for Chrome and Android.",
    action: "Copy Embed Snippet",
    tag: "Web Developer Tool",
    href: null,
  },
  {
    id: "templates",
    title: "Start from a template",
    icon: "export" as const,
    desc: "News, podcast, sports, Reels and YouTube templates that open straight in the editor, ready to change.",
    action: "Browse templates",
    tag: "Templates",
    href: "/#templates",
  },
  {
    id: "faq",
    title: "Questions & answers",
    icon: "library" as const,
    desc: "Free plan, Hindi and Hinglish captions, privacy, GST invoices and cancelling, answered plainly.",
    action: "Read the FAQ",
    tag: "Help",
    href: "/#faq",
  },
  {
    id: "roadmap",
    title: "What's new & coming",
    icon: "smile" as const,
    desc: "Every feature, what is ready today and what is in Beta or coming next, on one honest page.",
    action: "See the roadmap",
    tag: "Roadmap",
    href: "/roadmap",
  },
];

export function ResourcesSection() {
  const theme = useResolvedTheme();
  const isLight = theme === "light";
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const handleCopySnippet = () => {
    const snippet = '<video autoplay loop muted playsinline class="vdo-avatar">\n  <source src="avatar.mov" type="video/mp4; codecs=\"hvc1\"">\n  <source src="avatar.webm" type="video/webm">\n</video>';
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(snippet);
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2500);
    }
  };

  return (
    <div className="w-full select-none">
      {/* Section Header */}
      <div className="text-center mb-10 sm:mb-12">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-400/25 text-cyan-300 text-xs font-mono uppercase tracking-widest mb-4">
          <span className="size-2 rounded-full bg-cyan-400 animate-pulse" />
          Developer & Creator Hub
        </div>

        <h2
          className={`text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight ${
            isLight ? "text-slate-900" : "text-white"
          }`}
        >
          Everything You Need <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-purple-400 bg-clip-text text-transparent">
            To Build With ViPlay Studio.
          </span>
        </h2>

        <p
          className={`text-sm sm:text-base max-w-2xl mx-auto mt-3 leading-relaxed ${
            isLight ? "text-slate-600" : "text-slate-300"
          }`}
        >
          Documentation, dual-stream transparent video embed generators, hardware acceleration specs, and community templates.
        </p>
      </div>

      {/* Grid of 4 Resource Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
        {RESOURCES.map((res) => (
          <div
            key={res.id}
            className={`rounded-[32px] p-6 sm:p-8 border transition-all duration-300 flex flex-col justify-between ${
              isLight
                ? "bg-white/85 border-purple-200/50 shadow-md hover:shadow-xl"
                : "bg-[#0a051d]/85 border-white/10 hover:border-cyan-400/40 shadow-[0_15px_40px_rgba(0,0,0,0.6)]"
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="size-12 rounded-2xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-sm">
                  <Icon name={res.icon} className="size-6" />
                </div>
                <span className={`text-xs font-mono uppercase tracking-widest px-2.5 py-1 rounded-full border ${isLight ? "text-purple-700 bg-purple-100 border-purple-200 font-semibold" : "text-purple-400 bg-purple-950/60 border-purple-400/30"}`}>
                  {res.tag}
                </span>
              </div>

              <h3
                className={`text-lg sm:text-xl font-bold mb-2 transition-colors ${
                  isLight ? "text-slate-900" : "text-white"
                }`}
              >
                {res.title}
              </h3>

              <p className={`text-xs sm:text-sm leading-relaxed mb-6 ${isLight ? "text-slate-600" : "text-slate-300"}`}>
                {res.desc}
              </p>
            </div>

            <div className={`pt-4 border-t flex items-center justify-between ${isLight ? "border-slate-200" : "border-white/10"}`}>
              {res.id === "embed-generator" ? (
                <button
                  type="button"
                  onClick={handleCopySnippet}
                  className="px-4 py-2 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition flex items-center gap-2 shadow-md"
                >
                  <span>{copiedSnippet ? "✓ Snippet Copied!" : res.action}</span>
                  <span>📋</span>
                </button>
              ) : (
                <Link
                  href={res.href ?? "/editor"}
                  className={`px-4 py-2 rounded-full font-bold text-xs transition flex items-center gap-1.5 ${isLight ? "bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 shadow-sm" : "bg-white/10 hover:bg-white/20 text-white"}`}
                >
                  <span>{res.action}</span>
                  <span>→</span>
                </Link>
              )}

              <span className="text-xs font-mono text-slate-500">Free plan</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
