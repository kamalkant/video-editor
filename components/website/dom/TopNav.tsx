"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useResolvedTheme, setTheme } from "@/lib/editor/theme";
import { useAuth } from "@/lib/auth/AuthContext";

/** The page sections in the header (desktop) and the menu (phones). */
const NAV_LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#use-cases", label: "Use Cases" },
  { href: "/#technology", label: "Technology" },
  { href: "/#templates", label: "Templates" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#resources", label: "Resources" },
];
const SIGNUP = "/signup?next=/editor";

export function TopNav() {
  const theme = useResolvedTheme();
  const isLight = theme === "light";
  const [isScrolled, setIsScrolled] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pastHero, setPastHero] = useState(false);
  const { user, logout, isAdmin } = useAuth();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 15);
      setPastHero(window.scrollY > 500);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // the section on screen, for the active link
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const ids = NAV_LINKS.map((l) => l.href.slice(2));
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-35% 0px -55% 0px", threshold: [0, 0.25, 0.5] },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  // the phone menu closes with Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const toggleTheme = () => {
    setTheme(isLight ? "dark" : "light");
  };

  const menuItem = "flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-site-ink transition hover:bg-site-ink/[0.06]";
  return (
    <>
    <header
      className={`fixed inset-x-3 top-3 z-50 mx-auto flex h-14 max-w-6xl select-none items-center justify-between rounded-full border pl-4 pr-2 text-site-ink transition-all duration-300 ease-out sm:pl-5 ${
        isScrolled
          ? "border-site-line bg-site-surface/70 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.45)] backdrop-blur-xl backdrop-saturate-150"
          : "border-transparent bg-transparent"
      }`}
    >
      <Link href="/" className="group flex items-center gap-2.5 rounded-full">
        <img src="/vdo-icon.png" alt="" width={28} height={28} className="size-7 object-contain transition-transform group-hover:scale-105" />
        <span className="font-display text-xl font-bold tracking-tight text-site-ink">ViPlay</span>
      </Link>

      <nav aria-label="Main" className="hidden items-center gap-1 text-sm font-medium lg:flex">
        {NAV_LINKS.map((l) => {
          const on = active === l.href.slice(2);
          return (
            <a
              key={l.href}
              href={l.href}
              aria-current={on ? "location" : undefined}
              className={`rounded-full px-3 py-1.5 transition ${on ? "bg-site-ink/[0.07] text-site-ink" : "text-site-muted hover:text-site-ink"}`}
            >
              {l.label}
            </a>
          );
        })}
      </nav>

      <div className="flex items-center gap-1.5 text-sm">
        <button
          type="button"
          onClick={toggleTheme}
          data-testid="theme-toggle-button"
          className="flex size-10 items-center justify-center rounded-full text-site-muted transition hover:bg-site-ink/[0.06] hover:text-site-ink"
          title={isLight ? "Switch to Dark Mode" : "Switch to Light Mode"}
          aria-label={isLight ? "Switch to Dark Mode" : "Switch to Light Mode"}
        >
          {isLight ? (
            <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          ) : (
            <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="12" cy="12" r="4.5" />
              <path strokeLinecap="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          )}
        </button>

        {user ? (
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex size-10 items-center justify-center rounded-full transition hover:bg-site-ink/[0.06]"
                title={user.email || user.phone_number || "User profile"}
                aria-label="User profile menu"
                aria-expanded={userMenuOpen}
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-purple-400 to-cyan-400 text-xs font-bold uppercase text-slate-950">
                  {(user.name || user.email || user.phone_number || "U")[0]}
                </span>
              </button>

              {userMenuOpen && (
                <div className="site-card absolute right-0 z-50 mt-3 w-60 p-2 backdrop-blur-2xl">
                  <div className="border-b border-site-line px-3 pb-2 pt-1">
                    <p className="truncate text-sm font-semibold text-site-ink">{user.name || "Creator"}</p>
                    <p className="truncate text-xs text-site-muted">{user.email || user.phone_number || "Verified User"}</p>
                    {isAdmin && <span className="mt-1 inline-block rounded-md bg-purple-500/15 px-1.5 py-0.5 text-xs font-medium text-site-accent">Admin</span>}
                  </div>
                  <div className="mt-1 flex flex-col">
                    <Link href="/editor" onClick={() => setUserMenuOpen(false)} className={menuItem}>Open Studio</Link>
                    <Link href="/account/billing" onClick={() => setUserMenuOpen(false)} className={menuItem}>Billing & Plans</Link>
                    <Link href="/account/referrals" onClick={() => setUserMenuOpen(false)} className={menuItem}>Referral & Wallet</Link>
                    <Link href="/manage-devices" onClick={() => setUserMenuOpen(false)} className={menuItem}>Connected Devices</Link>
                    {isAdmin && <Link href="/admin" onClick={() => setUserMenuOpen(false)} className={menuItem}>Admin Panel</Link>}
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        void logout();
                      }}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-rose-400 transition hover:bg-rose-500/10"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>

            <Link href="/editor" className="site-btn-primary flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-4 font-semibold">
              <span>Go to Studio</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <Link href="/login?next=/editor" className="hidden min-h-10 items-center whitespace-nowrap rounded-full px-3.5 font-medium text-site-muted transition hover:text-site-ink sm:inline-flex">
              Sign In
            </Link>
            <Link href={SIGNUP} className="site-btn-primary flex min-h-10 items-center whitespace-nowrap rounded-full px-4 font-semibold">
              Try ViPlay Free →
            </Link>
          </div>
        )}

        {/* Phones: the section links live in a menu */}
        <button
          type="button"
          className="flex size-10 items-center justify-center rounded-full text-site-ink transition hover:bg-site-ink/[0.06] lg:hidden"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="site-menu"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 8h16M4 16h16" />}
          </svg>
        </button>
      </div>

      {menuOpen && (
        <nav id="site-menu" aria-label="Site" className="site-card absolute inset-x-0 top-full mt-2 flex flex-col gap-0.5 p-2 backdrop-blur-2xl lg:hidden">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)} className="rounded-xl px-4 py-3 text-base font-medium text-site-ink hover:bg-site-ink/[0.06]">
              {l.label}
            </a>
          ))}
          {!user && (
            <Link href="/login?next=/editor" onClick={() => setMenuOpen(false)} className="rounded-xl px-4 py-3 text-base font-medium text-site-muted hover:bg-site-ink/[0.06]">
              Sign in
            </Link>
          )}
        </nav>
      )}

    </header>

    {/* Phones: once past the hero, a "Start free" bar stays at the bottom
        (outside the header: its backdrop blur would make the header the bar's frame) */}
    {!user && pastHero && !menuOpen && (
      <div className="fixed inset-x-3 bottom-3 z-50 md:hidden">
        <Link href={SIGNUP} className="site-btn-primary flex min-h-12 items-center justify-center rounded-full text-base font-semibold">
          Start free →
        </Link>
      </div>
    )}
    </>
  );
}
