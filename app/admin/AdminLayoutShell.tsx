"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";
import { LogoutButton } from "./LogoutButton";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { AdminViewerContext } from "./admin-client";

type NavGroup = {
  title: string;
  items: {
    href: string;
    label: string;
    icon: IconName;
  }[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: "OVERVIEW & BILLING",
    items: [
      { href: "/admin", label: "Dashboard", icon: "grid" },
      { href: "/admin/plans", label: "Plans & Pricing", icon: "layers" },
      { href: "/admin/subscriptions", label: "Subscriptions & Payments", icon: "elements" },
      { href: "/admin/coupons", label: "Coupons & Discounts", icon: "star" },
    ],
  },
  {
    title: "OPERATIONS",
    items: [
      { href: "/admin/users", label: "Users & Devices", icon: "person" },
      { href: "/admin/bulk-jobs", label: "Bulk Operations", icon: "wand" },
      { href: "/admin/notifications", label: "Email & Broadcasts", icon: "broadcast" },
      { href: "/admin/features", label: "Tools & Features", icon: "effects" },
    ],
  },
  {
    title: "GROWTH & REWARDS",
    items: [
      { href: "/admin/referrals", label: "Referral Program", icon: "share" },
      { href: "/admin/payouts", label: "Wallet & Payouts", icon: "star" },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      { href: "/admin/audit", label: "Audit & History", icon: "history" },
      { href: "/admin/health", label: "System Health", icon: "activity" },
      { href: "/admin/settings", label: "Settings", icon: "settings" },
    ],
  },
];

export function AdminLayoutShell({
  user,
  children,
}: {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isItemActive = (href: string) => {
    if (href === "/admin") {
      return pathname === "/admin";
    }
    return pathname === href || pathname.startsWith(href + "/");
  };

  const navList = (
    <nav className="p-3 space-y-5 text-xs">
      {NAV_GROUPS.map((group) => (
        <div key={group.title} className="space-y-1">
          <div className="px-3 py-1 font-mono text-[9px] font-bold text-muted/80 tracking-wider uppercase">
            {group.title}
          </div>
          {group.items.map((item) => {
            const active = isItemActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`group flex items-center gap-2.5 rounded-xl px-3 py-2 transition-all duration-150 cursor-pointer ${
                  active
                    ? "bg-primary text-white font-semibold shadow-xs ring-1 ring-primary/40"
                    : "text-muted hover:bg-raised hover:text-ink font-medium"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <Icon
                  name={item.icon}
                  className={`size-4 shrink-0 transition-transform group-hover:scale-105 ${
                    active ? "text-white" : "text-muted group-hover:text-ink"
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-app text-ink flex flex-col">
      {/* 1. TOP HEADER (Full Width, Sticky) */}
      <header className="sticky top-0 z-40 h-14 border-b border-line bg-surface/95 backdrop-blur-md w-full">
        <div className="flex h-full items-center justify-between px-4 sm:px-6">
          {/* Left Brand & Mobile Menu Toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen((prev) => !prev)}
              className="lg:hidden p-1.5 rounded-lg border border-line bg-surface text-muted hover:text-ink hover:bg-raised transition-colors cursor-pointer"
              aria-label="Toggle navigation menu"
            >
              <Icon name="list" className="size-4" />
            </button>

            <Link href="/admin" className="flex items-center gap-2.5 font-bold tracking-tight text-ink">
              <img src="/vdo-icon.png" alt="ViPlay Studio" className="size-7 rounded-lg shadow-sm object-contain" />
              <div className="flex items-center">
                <span className="text-base font-black tracking-tight">ViPlay</span>
                <span className="text-xs text-primary font-bold uppercase ml-1.5 px-1.5 py-0.5 rounded bg-primary/10">
                  Admin Suite
                </span>
              </div>
            </Link>
          </div>

          {/* Right Shortcuts & User Profile */}
          <div className="flex items-center gap-3">
            <Link
              href="/account/billing"
              className="hidden md:flex items-center gap-1.5 rounded-lg border border-line bg-raised/40 px-2.5 py-1 text-xs font-medium text-muted hover:text-ink hover:bg-raised transition-colors"
              title="User Billing & Plan Portal"
            >
              <Icon name="elements" className="size-3 text-purple-400" />
              <span>Billing Portal</span>
            </Link>

            <Link
              href="/"
              className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-ink transition-colors px-2 py-1 rounded-md hover:bg-raised"
              title="ViPlay Marketing Website"
            >
              <span>Website</span>
            </Link>

            <Link
              href="/editor"
              className="flex items-center gap-1.5 rounded-lg border border-line bg-raised/60 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-raised transition-colors shadow-xs"
              title="Open ViPlay Video Workstation"
            >
              <Icon name="film" className="size-3.5 text-primary" />
              <span>Studio</span>
            </Link>

            <div className="h-4 w-px bg-line" />

            {/* Admin User Info */}
            <div className="flex items-center gap-2.5">
              <div className="text-right">
                <div className="text-xs font-bold leading-none text-ink">{user.name}</div>
                <div className="mt-0.5 flex items-center justify-end">
                  <span className={`inline-block rounded px-1.5 py-0.2 font-mono text-[9px] font-extrabold uppercase ${
                    user.role === "super_admin"
                      ? "bg-purple-500/15 text-purple-500"
                      : "bg-blue-500/15 text-blue-500"
                  }`}>
                    {user.role}
                  </span>
                </div>
              </div>
              <NotificationBell className="relative p-1.5 rounded-lg hover:bg-raised text-muted hover:text-ink transition-colors border border-line/40" />
              <LogoutButton />
            </div>
          </div>
        </div>
      </header>

      {/* 2. BODY (Left Sidebar + Right Main Content) */}
      <div className="flex flex-1 min-h-[calc(100vh-3.5rem)]">
        {/* Desktop Left Sidebar Navigation */}
        <aside className="hidden lg:block w-64 shrink-0 border-r border-line bg-surface/75 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto scrollbar-thin backdrop-blur-xs">
          {navList}
        </aside>

        {/* Mobile Slide-Out Drawer Navigation */}
        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
              onClick={() => setMobileOpen(false)}
            />
            <div className="relative w-72 max-w-[85vw] bg-surface h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200 border-r border-line">
              <div className="flex items-center justify-between p-4 border-b border-line">
                <span className="font-bold text-xs uppercase tracking-wider text-muted">Navigation Menu</span>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="p-1 rounded-lg text-muted hover:text-ink hover:bg-raised transition-colors cursor-pointer"
                  aria-label="Close menu"
                >
                  <Icon name="close" className="size-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-thin">
                {navList}
              </div>
            </div>
          </div>
        )}

        {/* Right Main Content Area */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <AdminViewerContext.Provider value={user}>{children}</AdminViewerContext.Provider>
        </main>
      </div>
    </div>
  );
}
