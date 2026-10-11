"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";

type NavItem = {
  href: string;
  label: string;
  icon: IconName;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "grid" },
  { href: "/admin/plans", label: "Plans & Pricing", icon: "layers" },
  { href: "/admin/subscriptions", label: "Subscriptions & Payments", icon: "elements" },
  { href: "/admin/coupons", label: "Coupons & Discounts", icon: "star" },
  { href: "/admin/users", label: "Users & Devices", icon: "person" },
  { href: "/admin/bulk-jobs", label: "Bulk Operations", icon: "wand" },
  { href: "/admin/notifications", label: "Email & Broadcasts", icon: "broadcast" },
  { href: "/admin/features", label: "Tools & Features", icon: "effects" },
  { href: "/admin/audit", label: "Audit & History", icon: "history" },
  { href: "/admin/settings", label: "Settings", icon: "settings" },
];

export function AdminNav() {
  const pathname = usePathname();

  const isItemActive = (href: string) => {
    if (href === "/admin") {
      return pathname === "/admin";
    }
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <nav className="flex items-center gap-1.5 overflow-x-auto px-4 sm:px-6 py-2 border-t border-line/60 scrollbar-none text-xs">
      {NAV_ITEMS.map((item) => {
        const active = isItemActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 whitespace-nowrap transition-all duration-150 cursor-pointer ${
              active
                ? "bg-primary text-white font-semibold shadow-xs ring-1 ring-primary/30"
                : "text-muted hover:bg-raised hover:text-ink font-medium"
            }`}
            aria-current={active ? "page" : undefined}
          >
            <Icon
              name={item.icon}
              className={`size-3.5 shrink-0 ${active ? "text-white" : "text-muted"}`}
            />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
