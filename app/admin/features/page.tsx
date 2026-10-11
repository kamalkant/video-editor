"use client";

import { useEffect, useState, useCallback } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { ParsedFeatureFlag, UserRole } from "@/lib/db/schema";

const TOOL_ICONS: Record<string, IconName> = {
  library: "library",
  elements: "elements",
  effects: "effects",
  ai: "ai",
  text: "text",
  transitions: "transitions",
  audio: "audio",
  subtitles: "subtitles",
  templates: "templates",
  brand: "brand",
  background: "background",
  export: "settings",
};

export default function AdminFeaturesPage() {
  const [features, setFeatures] = useState<ParsedFeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingToolId, setSavingToolId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const fetchFeatures = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/features");
      if (res.ok) {
        const data = await res.json();
        setFeatures(data.features || []);
      }
    } catch (err) {
      console.error("Failed to load feature flags:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchFeatures();
  }, [fetchFeatures]);

  const handleToggleGlobal = async (flag: ParsedFeatureFlag) => {
    const nextGlobal = !flag.enabled_global;
    setSavingToolId(flag.tool_id);

    // Optimistic update
    setFeatures((prev) =>
      prev.map((f) => (f.tool_id === flag.tool_id ? { ...f, enabled_global: nextGlobal } : f))
    );

    try {
      const res = await fetch("/api/admin/features", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolId: flag.tool_id,
          enabled_global: nextGlobal,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update feature");
      }

      showToast(`${flag.title} is now ${nextGlobal ? "Enabled" : "Disabled"} globally.`);
    } catch {
      // Revert on error
      setFeatures((prev) =>
        prev.map((f) => (f.tool_id === flag.tool_id ? { ...f, enabled_global: flag.enabled_global } : f))
      );
      alert("Failed to update feature setting.");
    } finally {
      setSavingToolId(null);
    }
  };

  const handleRoleToggle = async (flag: ParsedFeatureFlag, role: UserRole) => {
    if (role === "super_admin") return; // Super admin always has access

    const hasRole = flag.allowed_roles.includes(role);
    const nextRoles: UserRole[] = hasRole
      ? flag.allowed_roles.filter((r) => r !== role)
      : [...flag.allowed_roles, role];

    setSavingToolId(flag.tool_id);

    // Optimistic update
    setFeatures((prev) =>
      prev.map((f) => (f.tool_id === flag.tool_id ? { ...f, allowed_roles: nextRoles } : f))
    );

    try {
      const res = await fetch("/api/admin/features", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolId: flag.tool_id,
          allowed_roles: nextRoles,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update roles");
      }

      showToast(`Updated role permissions for ${flag.title}.`);
    } catch {
      // Revert
      setFeatures((prev) =>
        prev.map((f) => (f.tool_id === flag.tool_id ? { ...f, allowed_roles: flag.allowed_roles } : f))
      );
      alert("Failed to update role permissions.");
    } finally {
      setSavingToolId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-xs font-semibold text-ink shadow-xl animate-in fade-in slide-in-from-bottom-3">
          <Icon name="check" className="size-4 text-emerald-500" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Tools & Features Customization</h1>
          <p className="mt-1 text-sm text-muted">
            Customize which video editing tools are available globally and configure role-based access for each feature.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchFeatures}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-muted hover:bg-raised hover:text-ink transition-colors"
          >
            <Icon name="history" className="size-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Feature Customization Grid */}
      {loading ? (
        <div className="p-12 text-center text-muted">Loading feature configurations...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {features.map((flag) => {
            const isSaving = savingToolId === flag.tool_id;
            const iconName = TOOL_ICONS[flag.tool_id] || "elements";

            return (
              <div
                key={flag.tool_id}
                className={`relative flex flex-col justify-between rounded-xl border p-5 transition-all shadow-sm ${
                  flag.enabled_global
                    ? "border-line bg-surface"
                    : "border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/5"
                }`}
              >
                <div>
                  {/* Top Bar: Icon, Title, and Global Switch */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl shadow-xs ${
                        flag.enabled_global ? "bg-primary/10 text-primary" : "bg-muted/15 text-muted"
                      }`}>
                        <Icon name={iconName} className="size-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-ink text-sm">{flag.title}</h3>
                          <span className="font-mono text-[9px] text-muted">({flag.tool_id})</span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted leading-relaxed">{flag.description}</p>
                      </div>
                    </div>

                    {/* Global Master Switch */}
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleToggleGlobal(flag)}
                      aria-label={`Toggle ${flag.title}`}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        flag.enabled_global ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-700"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block size-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          flag.enabled_global ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Status Banner */}
                  <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-3 text-xs">
                    <span className="text-[11px] font-medium text-muted">Global Status:</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold ${
                        flag.enabled_global
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      <span className={`size-1.5 rounded-full ${flag.enabled_global ? "bg-emerald-500" : "bg-amber-500"}`} />
                      {flag.enabled_global ? "Active Everywhere" : "Disabled Globally"}
                    </span>
                  </div>
                </div>

                {/* Role Permissions Checkboxes */}
                <div className="mt-4 rounded-lg border border-line/50 bg-raised/40 p-3">
                  <span className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-2">
                    Allowed User Roles
                  </span>

                  <div className="grid grid-cols-3 gap-2">
                    {/* Super Admin */}
                    <label className="flex items-center gap-2 text-xs font-semibold text-ink cursor-default opacity-85">
                      <input
                        type="checkbox"
                        checked={true}
                        disabled={true}
                        className="rounded border-line text-primary focus:ring-primary size-3.5"
                      />
                      <span>Super Admin</span>
                    </label>

                    {/* Admin */}
                    <label className="flex items-center gap-2 text-xs font-medium text-ink cursor-pointer hover:text-primary transition-colors">
                      <input
                        type="checkbox"
                        checked={flag.allowed_roles.includes("admin")}
                        onChange={() => handleRoleToggle(flag, "admin")}
                        disabled={isSaving}
                        className="rounded border-line text-primary focus:ring-primary size-3.5"
                      />
                      <span>Admin</span>
                    </label>

                    {/* User / Guest */}
                    <label className="flex items-center gap-2 text-xs font-medium text-ink cursor-pointer hover:text-primary transition-colors">
                      <input
                        type="checkbox"
                        checked={flag.allowed_roles.includes("user")}
                        onChange={() => handleRoleToggle(flag, "user")}
                        disabled={isSaving}
                        className="rounded border-line text-primary focus:ring-primary size-3.5"
                      />
                      <span>User</span>
                    </label>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
