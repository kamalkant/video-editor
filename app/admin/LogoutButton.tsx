"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

export function LogoutButton() {
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch {
      window.location.href = "/login";
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      title="Sign Out"
      className="flex size-8 items-center justify-center rounded-lg border border-line bg-surface text-muted hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-500 transition-colors"
    >
      <Icon name="lock" className="size-4" />
    </button>
  );
}
