"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { Icon } from "@/components/ui/Icon";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export function AccountHeader() {
  const pathname = usePathname();
  const { user, isAdmin, logout } = useAuth();

  const navItems = [
    {
      href: "/account/billing",
      label: "Subscription & Billing",
      icon: "elements" as const,
    },
    {
      href: "/account/referrals",
      label: "Referrals & Wallet",
      icon: "star" as const,
    },
    {
      href: "/manage-devices",
      label: "Connected Devices",
      icon: "monitor" as const,
    },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-line bg-surface/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        {/* Left: Brand & Return to Studio */}
        <div className="flex items-center gap-3">
          <Link href="/editor" className="flex items-center gap-2 group" title="Return to ViPlay Studio">
            <img
              src="/vdo-icon.png"
              alt="ViPlay Logo"
              className="size-7 object-contain drop-shadow-[0_2px_6px_rgba(59,130,246,0.3)] transition-transform group-hover:scale-105"
            />
            <div className="flex items-center">
              <span className="font-bold text-base tracking-tight text-ink">ViPlay</span>
              <span className="ml-1 text-xs font-semibold text-muted">Account</span>
            </div>
          </Link>

          <span className="h-5 w-px bg-line max-sm:hidden" />

          {/* Quick link back to Studio */}
          <Link
            href="/editor"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-line bg-raised/40 px-2.5 py-1 text-xs font-medium text-muted hover:text-ink hover:bg-raised transition-colors"
          >
            <Icon name="film" className="size-3 text-primary" />
            <span>Studio</span>
          </Link>
        </div>

        {/* Center: Tabs between Billing, Referrals, and Devices */}
        <nav
          aria-label="Account sections"
          className="flex items-center gap-1 rounded-xl border border-line bg-surface-raised p-1 text-xs"
        >
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-all font-medium ${
                  active
                    ? "bg-primary text-white font-semibold shadow-xs"
                    : "text-muted hover:text-ink hover:bg-raised"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <Icon
                  name={item.icon}
                  className={`size-3.5 shrink-0 ${active ? "text-white" : "text-muted"}`}
                />
                <span className="hidden md:inline">{item.label}</span>
                <span className="md:hidden">
                  {item.href === "/account/billing" ? "Billing" : item.href === "/account/referrals" ? "Referrals" : "Devices"}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Right: Ecosystem Switchers & User Actions */}
        <div className="flex items-center gap-2.5">
          {/* Link to Marketing Website */}
          <Link
            href="/"
            className="hidden lg:inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-ink transition-colors px-2 py-1 rounded-md hover:bg-raised"
            title="ViPlay Marketing Website"
          >
            <span>Website</span>
          </Link>

          {/* Admin Suite link (only for authorized admin accounts) */}
          {isAdmin && (
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 transition-colors"
              title="ViPlay Admin Suite"
            >
              <Icon name="brand" className="size-3 text-purple-500" />
              <span className="hidden sm:inline">Admin</span>
            </Link>
          )}

          <div className="h-4 w-px bg-line max-sm:hidden" />

          {/* Notification Bell */}
          <NotificationBell className="relative p-1.5 rounded-lg text-muted hover:text-ink hover:bg-raised transition-colors border border-line/40" />

          {/* User Sign Out */}
          {user && (
            <div className="flex items-center gap-2">
              <div
                className="hidden xl:flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary uppercase border border-line"
                title={user.email || user.name}
              >
                {(user.name || user.email || "U")[0]}
              </div>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-muted hover:text-red-500 hover:bg-red-500/10 hover:border-red-500/30 transition-colors cursor-pointer"
                title="Sign out of account"
              >
                <span className="hidden sm:inline">Sign Out</span>
                <span className="sm:hidden">Exit</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
