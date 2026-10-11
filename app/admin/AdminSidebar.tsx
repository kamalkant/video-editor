"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";
import { LogoutButton } from "./LogoutButton";

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
    title: "GROWTH & PAYOUTS",
    items: [
      { href: "/admin/referrals", label: "Referral Program", icon: "star" },
      { href: "/admin/payouts", label: "Payouts & Withdrawals", icon: "wand" },
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
    title: "SYSTEM",
    items: [
      { href: "/admin/audit", label: "Audit & History", icon: "history" },
      { href: "/admin/settings", label: "Settings", icon: "settings" },
    ],
  },
];

export function AdminSidebar({
  user,
}: {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isItemActive = (href: string) => {
    if (href === "/admin") {
      return pathname === "/admin";
    }
    return pathname === href || pathname.startsWith(href + "/");
  };

  const navContent = (
    <div className="flex flex-col h-full justify-between">
      {/* Top Header / Logo */}
      <div>
        <div className="flex items-center justify-between px-5 h-16 border-b border-line">
          <Link
            href="/admin"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-3 font-bold tracking-tight text-ink"
          >
            <img src="/vdo-icon.png" alt="ViPlay Studio" className="size-8 rounded-xl shadow-sm object-contain" />
            <div className="flex flex-col">
              <span className="text-sm font-black leading-tight">ViPlay Studio</span>
              <span className="text-[10px] text-primary font-bold uppercase tracking-wider">Admin Suite</span>
            </div>
          </Link>

          {/* Mobile close button */}
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-muted hover:text-ink hover:bg-raised transition-colors cursor-pointer"
            aria-label="Close menu"
          >
            <Icon name="close" className="size-4" />
          </button>
        </div>

        {/* Navigation Groups */}
        <nav className="p-3 space-y-5 overflow-y-auto max-h-[calc(100vh-14rem)] scrollbar-thin text-xs">
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
      </div>

      {/* Bottom User & Shortcuts Panel */}
      <div className="p-3 border-t border-line/80 space-y-2.5 bg-canvas/30">
        <div className="flex items-center gap-1.5 px-1">
          <a
            href="/"
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-line bg-raised/50 py-1.5 text-[11px] font-semibold text-ink hover:bg-raised transition-colors shadow-2xs"
          >
            <Icon name="film" className="size-3 text-primary" />
            <span>Studio</span>
          </a>
          <Link
            href="/account/billing"
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-line bg-raised/50 py-1.5 text-[11px] font-semibold text-muted hover:text-ink hover:bg-raised transition-colors shadow-2xs"
          >
            <Icon name="elements" className="size-3 text-purple-400" />
            <span>Billing</span>
          </Link>
        </div>

        {/* User Card */}
        <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface p-2.5 shadow-2xs">
          <div className="flex items-center gap-2 min-w-0">
            <div className="size-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-xs text-primary uppercase shrink-0">
              {user.name ? user.name[0] : "A"}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-ink truncate leading-tight">{user.name}</div>
              <div className="flex items-center gap-1 mt-0.5">
                <span className={`inline-block rounded px-1 py-0.2 font-mono text-[8px] font-extrabold uppercase ${
                  user.role === "super_admin"
                    ? "bg-purple-500/15 text-purple-500"
                    : "bg-blue-500/15 text-blue-500"
                }`}>
                  {user.role}
                </span>
              </div>
            </div>
          </div>
          <LogoutButton />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Left Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-line bg-surface/95 h-screen sticky top-0 backdrop-blur-md z-30">
        {navContent}
      </aside>

      {/* Mobile Top Navbar with Hamburger */}
      <div className="lg:hidden sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-lg border border-line bg-surface text-muted hover:text-ink hover:bg-raised transition-colors cursor-pointer"
            aria-label="Open navigation menu"
          >
            <Icon name="list" className="size-5" />
          </button>

          <Link href="/admin" className="flex items-center gap-2 font-bold tracking-tight text-ink">
            <img src="/vdo-icon.png" alt="ViPlay Studio" className="size-6 rounded-lg object-contain" />
            <span className="text-sm font-black">ViPlay Admin</span>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/"
            className="flex items-center gap-1 rounded-lg border border-line bg-raised/60 px-2.5 py-1 text-xs font-semibold text-ink"
          >
            <Icon name="film" className="size-3 text-primary" />
            <span>Studio</span>
          </a>
          <LogoutButton />
        </div>
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] bg-surface h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200">
            {navContent}
          </div>
        </div>
      )}
    </>
  );
}
