"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { ParsedPlan, PlanInterval } from "@/lib/db/schema";
import { apiMessage, useAdminViewer } from "../admin-client";

export default function AdminPlansPage() {
  // creating, repricing and archiving plans is a Super Admin action (the server enforces it too)
  const { isSuperAdmin: canEdit } = useAdminViewer();
  const [plans, setPlans] = useState<ParsedPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<ParsedPlan | null>(null);

  // Form fields
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [interval, setInterval] = useState<PlanInterval>("monthly");
  const [currency, setCurrency] = useState("INR");
  const [price, setPrice] = useState(999);
  const [taxRate, setTaxRate] = useState(18);
  const [trialDays, setTrialDays] = useState(0);
  const [aiCredits, setAiCredits] = useState(100);
  const [deviceLimit, setDeviceLimit] = useState(2);
  const [featuresText, setFeaturesText] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  // what the plan allows in exports
  const [maxExport, setMaxExport] = useState<720 | 1080 | 1440 | 2160>(2160);
  const [watermark, setWatermark] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [bumpVersion, setBumpVersion] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPlans = async () => {
    try {
      const res = await fetch("/api/admin/plans");
      const data = await res.json();
      if (data.ok) setPlans(data.plans);
    } catch (err) {
      console.error("Failed to load plans", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const openCreateModal = () => {
    setEditingPlan(null);
    setName("");
    setSlug("");
    setDescription("");
    setInterval("monthly");
    setCurrency("INR");
    setPrice(999);
    setTaxRate(18);
    setTrialDays(0);
    setAiCredits(100);
    setDeviceLimit(2);
    setFeaturesText("4K 60fps Export\nFast 720p Proxy Editing\nFull AI Studio Suite\nPriority support");
    setIsPublic(true);
    setMaxExport(2160);
    setWatermark(false);
    setIsActive(true);
    setBumpVersion(false);
    setError(null);
    setModalOpen(true);
  };

  const openEditModal = (p: ParsedPlan) => {
    setEditingPlan(p);
    setName(p.name);
    setSlug(p.slug);
    setDescription(p.description || "");
    setInterval(p.interval);
    setCurrency(p.currency);
    setPrice(p.price_amount / 100);
    setTaxRate(p.tax_rate_percent);
    setTrialDays(p.trial_days);
    setAiCredits(p.ai_credits_monthly);
    setDeviceLimit(p.device_limit);
    setFeaturesText(p.features.join("\n"));
    setIsPublic(p.is_public);
    setMaxExport(([720, 1080, 1440, 2160] as const).find((h) => h === p.max_export_height) ?? 2160);
    setWatermark(!!p.watermark);
    setIsActive(p.is_active);
    setBumpVersion(false);
    setError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const features = featuresText
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean);

    try {
      const payload = {
        name,
        slug,
        description,
        interval,
        currency,
        price_amount: Math.round(price * 100),
        tax_rate_percent: Number(taxRate),
        trial_days: Number(trialDays),
        ai_credits_monthly: Number(aiCredits),
        device_limit: Number(deviceLimit),
        features,
        is_public: isPublic,
        max_export_height: maxExport,
        watermark,
        is_active: isActive,
        bumpVersion,
      };

      const url = "/api/admin/plans";
      const method = editingPlan ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingPlan ? { id: editingPlan.id, ...payload } : payload),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(apiMessage(data, "Failed to save plan"));

      setModalOpen(false);
      fetchPlans();
    } catch (err: any) {
      setError(err?.message || "Failed to save plan");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (id: string) => {
    if (!confirm("Are you sure you want to archive this plan? Existing subscribers will keep their plan, but it will be hidden from new checkouts.")) return;

    try {
      const res = await fetch(`/api/admin/plans?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) fetchPlans();
      else alert(apiMessage(data, "Failed to archive plan"));
    } catch {
      alert("Network error while archiving plan");
    }
  };

  // an archived plan back on sale: active again, and shown on the pricing page
  const handleRestore = async (p: { id: string; name: string }) => {
    if (!confirm(`Restore "${p.name}"? It becomes available for new checkouts and shows on the website's pricing again.`)) return;
    try {
      const res = await fetch("/api/admin/plans", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, is_active: true, is_public: true }),
      });
      const data = await res.json();
      if (data.ok) fetchPlans();
      else alert(apiMessage(data, "Failed to restore plan"));
    } catch {
      alert("Network error while restoring plan");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Plans & Pricing</h1>
          <p className="mt-1 text-xs text-muted">
            Configure subscription tiers, device limits, AI credits, safe price versioning, and feature matrix.
          </p>
        </div>

        {canEdit && <button
          onClick={openCreateModal}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-white shadow-md hover:bg-primary-hover transition-all cursor-pointer"
        >
          <Icon name="plus" className="size-4" />
          <span>Create Plan</span>
        </button>}
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-muted">Loading plans…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {plans.map((p) => {
            const curSymbol = p.currency === "INR" ? "₹" : "$";
            const formattedPrice = (p.price_amount / 100).toFixed(p.price_amount % 100 === 0 ? 0 : 2);

            return (
              <div
                key={p.id}
                className={`flex flex-col justify-between rounded-2xl border bg-surface p-5 shadow-sm transition-all ${
                  p.is_active ? "border-line" : "border-red-500/20 opacity-70 bg-surface/50"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold text-muted uppercase">v{p.version}</span>
                    <div className="flex items-center gap-1.5">
                      {!p.is_active && (
                        <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold text-red-400">ARCHIVED</span>
                      )}
                      {p.is_public ? (
                        <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400">PUBLIC</span>
                      ) : (
                        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">PRIVATE</span>
                      )}
                    </div>
                  </div>

                  <h3 className="mt-2 text-lg font-bold text-ink">{p.name}</h3>
                  <p className="mt-1 text-xs text-muted min-h-[32px] line-clamp-2">{p.description || "No description."}</p>

                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-2xl font-black text-ink">{curSymbol}{formattedPrice}</span>
                    <span className="text-xs text-muted">/{p.interval}</span>
                  </div>

                  <div className="mt-3 space-y-1.5 border-t border-line/60 pt-3 text-xs text-muted">
                    <div className="flex items-center justify-between">
                      <span>Device Limit:</span>
                      <strong className="text-ink">{p.device_limit} device(s)</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Exports:</span>
                      <strong className="text-ink">
                        up to {p.max_export_height >= 2160 ? "4K" : `${p.max_export_height}p`}
                        {p.watermark ? " · ViPlay logo" : ""}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Monthly AI Credits:</span>
                      <strong className="text-ink">{p.ai_credits_monthly} credits</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Trial Period:</span>
                      <strong className="text-ink">{p.trial_days > 0 ? `${p.trial_days} days` : "None"}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Tax (GST):</span>
                      <strong className="text-ink">{p.tax_rate_percent}%</strong>
                    </div>
                  </div>

                  <div className="mt-4 space-y-1.5 border-t border-line/60 pt-3">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Features:</div>
                    <ul className="space-y-1 text-xs text-ink/90">
                      {p.features.slice(0, 4).map((f, i) => (
                        <li key={i} className="flex items-center gap-1.5">
                          <Icon name="check" className="size-3 text-primary shrink-0" />
                          <span className="line-clamp-1">{f}</span>
                        </li>
                      ))}
                      {p.features.length > 4 && (
                        <li className="text-[11px] text-muted italic">+ {p.features.length - 4} more features</li>
                      )}
                    </ul>
                  </div>
                </div>

                {canEdit && <div className="mt-6 flex items-center gap-2 border-t border-line pt-3">
                  <button
                    onClick={() => openEditModal(p)}
                    className="flex-1 rounded-xl border border-line bg-raised/50 py-1.5 text-xs font-semibold text-ink hover:bg-raised transition-colors cursor-pointer"
                  >
                    Edit
                  </button>
                  {p.is_active ? (
                    <button
                      onClick={() => handleArchive(p.id)}
                      className="rounded-xl border border-line p-1.5 text-muted hover:border-red-500/50 hover:text-red-400 transition-colors cursor-pointer"
                      title="Archive Plan"
                      aria-label={`Archive ${p.name}`}
                    >
                      <Icon name="trash" className="size-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleRestore(p)}
                      className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                      title="Restore Plan"
                    >
                      <Icon name="reset" className="size-3.5" />
                      Restore
                    </button>
                  )}
                </div>}
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h2 className="text-base font-bold text-ink">
                {editingPlan ? `Edit Plan: ${editingPlan.name}` : "Create New Subscription Plan"}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-muted hover:text-ink cursor-pointer">&times;</button>
            </div>

            {error && (
              <div role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                {error}
              </div>
            )}

            <form onSubmit={handleSave} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-muted mb-1">Plan Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Creator Pro"
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-muted mb-1">Slug (Identifier)</label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingPlan)}
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="creator-pro"
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink disabled:opacity-50 focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-muted mb-1">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short summary of this plan"
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-muted mb-1">Billing Interval</label>
                  <select
                    value={interval}
                    onChange={(e) => setInterval(e.target.value as PlanInterval)}
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-muted mb-1">Currency</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-muted mb-1">Price</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-muted mb-1">Device Limit</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={deviceLimit}
                    onChange={(e) => setDeviceLimit(Number(e.target.value))}
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-muted mb-1">Monthly AI Credits</label>
                  <input
                    type="number"
                    min="0"
                    value={aiCredits}
                    onChange={(e) => setAiCredits(Number(e.target.value))}
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-muted mb-1">Trial Days</label>
                  <input
                    type="number"
                    min="0"
                    value={trialDays}
                    onChange={(e) => setTrialDays(Number(e.target.value))}
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-muted mb-1">Biggest export</label>
                  <select
                    value={maxExport}
                    onChange={(e) => setMaxExport(Number(e.target.value) as 720 | 1080 | 1440 | 2160)}
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
                  >
                    <option value={720}>720p</option>
                    <option value={1080}>1080p (Full HD)</option>
                    <option value={1440}>1440p</option>
                    <option value={2160}>4K</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-muted hover:text-ink pt-6">
                  <input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} className="rounded border-line" />
                  <span>Small ViPlay logo on exports</span>
                </label>
              </div>

              <div>
                <label className="block font-medium text-muted mb-1">Features (One per line)</label>
                <textarea
                  rows={4}
                  value={featuresText}
                  onChange={(e) => setFeaturesText(e.target.value)}
                  placeholder="4K 60fps Export&#10;720p Fast Proxy Editing&#10;Full AI Suite"
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none font-sans"
                />
              </div>

              {editingPlan && !isActive && (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  This plan is archived: nobody can buy it and it isn&apos;t on the website. Tick &quot;Active&quot; (and &quot;Publicly visible&quot;) to put it back on sale.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-muted hover:text-ink">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded border-line"
                  />
                  <span>Active (can be bought)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-muted hover:text-ink">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    className="rounded border-line"
                  />
                  <span>Publicly visible on pricing table</span>
                </label>

                {editingPlan && (
                  <label className="flex items-center gap-2 cursor-pointer text-amber-500 font-medium">
                    <input
                      type="checkbox"
                      checked={bumpVersion}
                      onChange={(e) => setBumpVersion(e.target.checked)}
                      className="rounded border-line"
                    />
                    <span>Bump Version (v{editingPlan.version + 1})</span>
                  </label>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-line px-4 py-2 font-semibold text-muted hover:bg-raised transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-primary px-5 py-2 font-semibold text-white shadow-md hover:bg-primary-hover disabled:opacity-50 transition-all cursor-pointer"
                >
                  {saving ? "Saving…" : editingPlan ? "Update Plan" : "Create Plan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
