"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { AI_TOOLS, AI_TOOL_LABELS, parseAiCosts } from "@/lib/ai/costs";

const EDITABLE_KEYS = [
  "razorpay_sandbox_mode",
  "default_currency",
  "default_tax_rate_percent",
  "grace_period_days",
  "default_device_limit",
  "expiry_notification_days",
  "retry_schedule_hours",
  "ai_credit_costs",
  "announcement_message",
  "announcement_tone",
];

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/admin/settings");
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error?.message || data.message || "Failed to load settings");
      setSettings(data.settings);
      setSaved(data.settings);
      setCanEdit(Boolean(data.canEdit));
      setLoadError(null);
    } catch (err: any) {
      // never render (and let anyone save) placeholder values over settings we could not read
      setLoadError(err?.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleChange = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    // only the keys this page edits and that actually changed
    const changed = Object.fromEntries(
      EDITABLE_KEYS.filter((k) => settings[k] !== undefined && settings[k] !== saved[k]).map((k) => [k, settings[k]])
    );
    if (Object.keys(changed).length === 0) {
      setMessage("No changes to save.");
      return;
    }
    if (changed.razorpay_sandbox_mode === "false" && !confirm("Turn off the sandbox? Checkouts and refunds will use real Razorpay keys.")) {
      return;
    }
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changed),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error?.message || data.message || "Failed to save settings");

      setSaved((prev) => ({ ...prev, ...changed }));
      setMessage("Configuration updated successfully!");
    } catch (err: any) {
      setMessage(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-sm text-muted">Loading settings…</div>;
  }

  if (loadError) {
    return (
      <div role="alert" className="max-w-4xl rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-500">
        Could not load settings: {loadError}
        <button onClick={() => { setLoading(true); fetchSettings(); }} className="ml-3 underline cursor-pointer">Retry</button>
      </div>
    );
  }

  const isSandbox = settings.razorpay_sandbox_mode !== "false";

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">System & Gateway Settings</h1>
        <p className="mt-1 text-xs text-muted">
          Configure payment gateway mode, tax calculations, grace periods, and automated notification schedules.
        </p>
      </div>

      {message && (
        <div role="status" className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-primary flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} className="text-muted hover:text-ink cursor-pointer">&times;</button>
        </div>
      )}

      {!canEdit && (
        <div className="rounded-xl border border-line bg-canvas p-3 text-xs text-muted">
          Read-only: only a Super Admin can change system settings.
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6 text-xs">
        <fieldset disabled={!canEdit} className="space-y-6 disabled:opacity-70">
        {/* Payment Gateway Box */}
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <h2 className="text-base font-bold text-ink">Razorpay Gateway Mode</h2>
              <p className="text-xs text-muted">Toggle between local Sandbox Simulation and official Razorpay Test/Live keys.</p>
            </div>
            <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
              isSandbox ? "bg-amber-500/10 text-amber-400" : "bg-emerald-500/10 text-emerald-400"
            }`}>
              {isSandbox ? "SANDBOX SIMULATION" : "LIVE / TEST GATEWAY"}
            </span>
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl border border-line bg-canvas">
            <div className="space-y-0.5">
              <span className="font-semibold text-ink">Enable Local Sandbox Simulator</span>
              <p className="text-[11px] text-muted">Allows zero-dependency test checkouts and automated test verification without requiring external Razorpay credentials.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isSandbox}
                onChange={(e) => handleChange("razorpay_sandbox_mode", e.target.checked ? "true" : "false")}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-raised peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </div>

        {/* Financial & Tax Settings */}
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm space-y-4">
          <div className="border-b border-line pb-3">
            <h2 className="text-base font-bold text-ink">Pricing, Tax & Grace Rules</h2>
            <p className="text-xs text-muted">Default financial parameters applied during checkout and subscription expiration.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-medium text-muted mb-1">Default Currency</label>
              <select
                value={settings.default_currency || "INR"}
                onChange={(e) => handleChange("default_currency", e.target.value)}
                className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
              >
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-muted mb-1">Default GST / Tax Rate (%)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={settings.default_tax_rate_percent || "18.0"}
                onChange={(e) => handleChange("default_tax_rate_percent", e.target.value)}
                className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="block font-medium text-muted mb-1">Grace Period (Days)</label>
              <input
                type="number"
                min="1"
                max="30"
                value={settings.grace_period_days || "5"}
                onChange={(e) => handleChange("grace_period_days", e.target.value)}
                className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none font-mono"
              />
            </div>
          </div>
        </div>

        {/* Security & Device Concurrency Limits */}
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm space-y-4">
          <div className="border-b border-line pb-3">
            <h2 className="text-base font-bold text-ink">Security & Session Concurrency Limits</h2>
            <p className="text-xs text-muted">Platform-wide session and concurrent device limits applied to all users.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-muted mb-1">Default Device Limit (All Users)</label>
              <input
                type="number"
                min="1"
                max="50"
                value={settings.default_device_limit || "1"}
                onChange={(e) => handleChange("default_device_limit", e.target.value)}
                className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none font-mono"
              />
              <span className="text-[10px] text-muted">Applied to all standard/free-tier accounts unless overridden per user or subscription plan</span>
            </div>
          </div>
        </div>


        {/* Notification Schedules */}
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm space-y-4">
          <div className="border-b border-line pb-3">
            <h2 className="text-base font-bold text-ink">Automated Notification Schedules</h2>
            <p className="text-xs text-muted">Configure payment retry cadence and renewal warning intervals.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-muted mb-1">Expiry Reminder Schedule (Days Before)</label>
              <input
                type="text"
                value={settings.expiry_notification_days || "7,3,1"}
                onChange={(e) => handleChange("expiry_notification_days", e.target.value)}
                placeholder="7,3,1"
                className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none font-mono"
              />
              <span className="text-[10px] text-muted">Comma-separated days before renewal. Supported: 7, 3, 1 (each sends only if its lifecycle rule is enabled)</span>
            </div>

            <div>
              <label className="block font-medium text-muted mb-1">Failed Payment Retries (Hours After)</label>
              <input
                type="text"
                value={settings.retry_schedule_hours || "24,48,72"}
                onChange={(e) => handleChange("retry_schedule_hours", e.target.value)}
                placeholder="24,48,72"
                className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none font-mono"
              />
              <span className="text-[10px] text-muted">Comma-separated retry intervals · not yet used: automatic payment retries are not implemented</span>
            </div>
          </div>
        </div>

          {/* Editor announcement */}
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm space-y-4">
            <div className="border-b border-line pb-3">
              <h2 className="text-base font-bold text-ink">Editor announcement</h2>
              <p className="text-xs text-muted">
                A short note shown to everyone in the editor (planned maintenance, a new feature). Each person can close it; it shows again when you change the text. Leave empty for none.
              </p>
            </div>
            <label className="flex flex-col gap-1 font-medium text-muted">
              Message
              <textarea
                rows={2}
                maxLength={300}
                value={settings.announcement_message ?? ""}
                onChange={(e) => handleChange("announcement_message", e.target.value)}
                placeholder="e.g. Exports pause for 10 minutes at 11 pm tonight for an update."
                className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
              />
              <span className="text-xs text-muted">{(settings.announcement_message ?? "").length}/300</span>
            </label>
            <label className="flex flex-col gap-1 font-medium text-muted sm:w-60">
              Style
              <select
                value={settings.announcement_tone || "info"}
                onChange={(e) => handleChange("announcement_tone", e.target.value)}
                className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
              >
                <option value="info">Info</option>
                <option value="warning">Warning (maintenance, outage)</option>
              </select>
            </label>
          </div>

          {/* AI credit prices */}
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm space-y-4">
            <div className="border-b border-line pb-3">
              <h2 className="text-base font-bold text-ink">AI credit prices</h2>
              <p className="text-xs text-muted">
                Credits taken per use when AI runs on the platform key. Users with their own key in AI settings pay nothing; super admins are never charged.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {AI_TOOLS.map((tool) => {
                const costs = parseAiCosts(settings.ai_credit_costs);
                return (
                  <label key={tool} className="flex flex-col gap-1 font-medium text-muted">
                    {AI_TOOL_LABELS[tool]}
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      step={1}
                      value={costs[tool]}
                      onChange={(e) => handleChange("ai_credit_costs", JSON.stringify({ ...costs, [tool]: Math.max(0, Math.round(Number(e.target.value) || 0)) }))}
                      className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none font-mono"
                    />
                  </label>
                );
              })}
            </div>
          </div>
        </fieldset>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || !canEdit}
            className="rounded-xl bg-primary px-6 py-2.5 font-semibold text-white shadow-md hover:bg-primary-hover disabled:opacity-50 transition-all cursor-pointer text-xs"
          >
            {saving ? "Saving…" : "Save Configuration"}
          </button>
        </div>
      </form>
    </div>
  );
}
