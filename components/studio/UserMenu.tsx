"use client";

import Link from "next/link";
import { ACCOUNTS_URL } from "@/lib/apps";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { Icon } from "@/components/ui/Icon";

export function UserMenu(p?: { onOpenStorage?: () => void }) {
  const { user, accountCode, isAdmin, logout, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [open]);

  if (loading) {
    return (
      <div className="flex size-7 items-center justify-center rounded-full bg-raised/70 animate-pulse border border-line" />
    );
  }

  if (!user) {
    return (
      <div className="flex items-center gap-1.5">
        <Link
          href="/login"
          className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink shadow-xs hover:bg-raised transition-colors"
        >
          Sign In
        </Link>
        <Link
          href="/signup"
          className="hidden sm:inline-flex rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-primary-hover transition-colors"
        >
          Sign Up
        </Link>
      </div>
    );
  }

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const roleLabel =
    user.role === "super_admin" ? "SUPER ADMIN" : user.role === "admin" ? "ADMIN" : "USER";

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full border border-line bg-surface p-0.5 hover:border-primary/50 transition-all focus:outline-none"
      >
        <div className="relative flex size-7 items-center justify-center rounded-full bg-primary/10 text-[15px] font-bold text-primary">
          {initials}
          {isAdmin && (
            <span
              className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-surface bg-purple-500"
              title="Administrator"
            />
          )}
        </div>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 z-50 rounded-xl border border-line bg-surface p-2 shadow-xl animate-in fade-in zoom-in-95">
          {/* User Profile Header */}
          <div className="border-b border-line/70 px-2.5 py-2">
            <div className="font-bold text-xs text-ink truncate">{user.name}</div>
            <div className="text-2xs text-muted truncate">{user.email || user.phone_number || "Verified Account"}</div>
            <div className="mt-1.5 flex items-center justify-between gap-1">
              <span
                className={`inline-block rounded px-1.5 py-0.2 font-mono text-2xs font-bold ${
                  user.role === "super_admin"
                    ? "bg-purple-500/15 text-purple-600 dark:text-purple-400"
                    : user.role === "admin"
                    ? "bg-primary/15 text-link dark:text-link"
                    : "bg-neutral-500/15 text-neutral-600 dark:text-neutral-400"
                }`}
              >
                {roleLabel}
              </span>
              {accountCode && (
                <span className="font-mono text-2xs font-semibold text-primary truncate" title={`Local Workspace: ${accountCode}`}>
                  {accountCode}
                </span>
              )}
            </div>
          </div>

          {/* Navigation Links */}
          <div className="py-1">
            {p?.onOpenStorage && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  p.onOpenStorage?.();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-raised transition-colors"
              >
                <Icon name="storage" className="size-3.5 text-primary" />
                <span>Storage Manager</span>
              </button>
            )}

            <a
              href={`${ACCOUNTS_URL}/account/referrals`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-raised transition-colors"
            >
              <Icon name="star" className="size-3.5 text-amber-500" />
              <span>Referral & Wallet</span>
            </a>

            <a
              href={`${ACCOUNTS_URL}/account/billing`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-raised transition-colors"
            >
              <Icon name="elements" className="size-3.5 text-purple-400" />
              <span>Billing & Plans</span>
            </a>

            <a
              href={`${ACCOUNTS_URL}/manage-devices`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-raised transition-colors"
            >
              <Icon name="monitor" className="size-3.5 text-cyan-500" />
              <span>Connected Devices</span>
            </a>

            {isAdmin && (
              <a
                href={`${ACCOUNTS_URL}/admin`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-raised transition-colors"
              >
                <Icon name="brand" className="size-3.5 text-purple-500" />
                <span>Admin Panel</span>
              </a>
            )}

            {isAdmin && (
              <a
                href={`${ACCOUNTS_URL}/admin/features`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted hover:bg-raised hover:text-ink transition-colors"
              >
                <Icon name="elements" className="size-3.5 text-emerald-500" />
                <span>Tools Customization</span>
              </a>
            )}
          </div>

          {/* Sign Out */}
          <div className="border-t border-line/70 pt-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void logout();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Icon name="lock" className="size-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
