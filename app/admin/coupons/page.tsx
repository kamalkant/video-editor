"use client";

import { useEffect, useState } from "react";
import { apiMessage } from "../admin-client";
import { Icon } from "@/components/ui/Icon";
import type { Coupon, CouponDiscountType, CouponScope } from "@/lib/db/schema";

/** The form takes rupees for a fixed discount; the API stores paise (like plan prices). */
const toApiValue = (type: CouponDiscountType, value: number) => (type === "fixed" ? Math.round(value * 100) : value);

const formatDiscount = (c: { discount_type: string; discount_value: number; currency?: string }) =>
  c.discount_type === "percentage"
    ? `${c.discount_value}% OFF`
    : `${c.currency === "USD" ? "$" : "₹"}${(c.discount_value / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })} OFF`;

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [singleModalOpen, setSingleModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  // Single form
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<CouponDiscountType>("percentage");
  const [discountValue, setDiscountValue] = useState(20);
  const [maxRedemptions, setMaxRedemptions] = useState<number | string>(100);
  const [scope, setScope] = useState<CouponScope>("first_payment");
  const [nCycles, setNCycles] = useState(1);
  const [validUntil, setValidUntil] = useState("");

  // Bulk form
  const [bulkCount, setBulkCount] = useState(25);
  const [bulkPrefix, setBulkPrefix] = useState("VIPLAY");
  const [bulkDiscountType, setBulkDiscountType] = useState<CouponDiscountType>("percentage");
  const [bulkDiscountValue, setBulkDiscountValue] = useState(25);
  const [bulkScope, setBulkScope] = useState<CouponScope>("first_payment");
  const [bulkMaxRedemptions, setBulkMaxRedemptions] = useState(1);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchCoupons = async () => {
    try {
      const res = await fetch("/api/admin/coupons");
      const data = await res.json();
      if (data.ok) setCoupons(data.coupons);
    } catch (err) {
      console.error("Failed to load coupons", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCoupons();
  }, []);

  const handleToggleActive = async (id: string, current: number) => {
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", id, active: current === 0 }),
      });
      const data = await res.json();
      if (data.ok) fetchCoupons();
      else setMessage(`Error: ${apiMessage(data, "Failed to update coupon")}`);
    } catch {
      setMessage("Error: network error while updating coupon");
    }
  };

  const handleCreateSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          discount_type: discountType,
          discount_value: toApiValue(discountType, Number(discountValue)),
          max_redemptions: maxRedemptions ? Number(maxRedemptions) : null,
          scope,
          n_cycles: Number(nCycles),
          valid_until: validUntil || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(apiMessage(data, "Failed to create coupon"));

      setMessage(`Coupon ${code.toUpperCase()} created successfully!`);
      setSingleModalOpen(false);
      fetchCoupons();
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/coupons/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count: Number(bulkCount),
          prefix: bulkPrefix,
          discount_type: bulkDiscountType,
          discount_value: toApiValue(bulkDiscountType, Number(bulkDiscountValue)),
          scope: bulkScope,
          max_redemptions: Number(bulkMaxRedemptions),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(apiMessage(data, "Bulk generation failed"));

      setMessage(
        data.count === data.requested
          ? `Successfully generated ${data.count} unique coupons!`
          : `Generated ${data.count} of ${data.requested} coupons (the rest collided with existing codes; run again for more).`
      );
      setBulkModalOpen(false);
      fetchCoupons();
    } catch (err: any) {
      setMessage(`Bulk error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Coupons & Discounts</h1>
          <p className="mt-1 text-xs text-muted">
            Create custom promo codes, generate bulk batches, and configure recurrence scopes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setBulkModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-ink hover:bg-raised transition-all cursor-pointer"
          >
            <Icon name="elements" className="size-3.5 text-primary" />
            <span>Bulk Generator</span>
          </button>

          <button
            onClick={() => setSingleModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-white shadow-md hover:bg-primary-hover transition-all cursor-pointer"
          >
            <Icon name="plus" className="size-3.5" />
            <span>Create Coupon</span>
          </button>
        </div>
      </div>

      {message && (
        <div role="status" className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-primary flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} className="text-muted hover:text-ink cursor-pointer">&times;</button>
        </div>
      )}

      {/* Coupons Table */}
      <div className="rounded-2xl border border-line bg-surface overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted">Loading coupons…</div>
        ) : coupons.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted">No coupons created yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line bg-raised/40 text-muted uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Coupon Code</th>
                  <th className="py-3 px-4">Discount</th>
                  <th className="py-3 px-4">Recurrence Scope</th>
                  <th className="py-3 px-4">Redemptions</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {coupons.map((c) => {
                  const maxDisplay = c.max_redemptions !== null ? c.max_redemptions : "Unlimited";
                  const percent = c.max_redemptions ? Math.round((c.redemption_count / c.max_redemptions) * 100) : 0;

                  return (
                    <tr key={c.id} className="hover:bg-raised/30 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-ink">
                        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-primary border border-primary/20">
                          {c.code}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-ink">
                        {formatDiscount(c)}
                      </td>
                      <td className="py-3.5 px-4 text-muted">
                        {c.scope === "first_payment" && <span className="rounded bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-400">First Payment</span>}
                        {c.scope === "first_n_cycles" && <span className="rounded bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-400">First {c.n_cycles} Cycles</span>}
                        {c.scope === "every_renewal" && <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">Every Renewal</span>}
                      </td>
                      <td className="py-3.5 px-4 text-muted">
                        <div>{c.redemption_count} / {maxDisplay}</div>
                        {c.max_redemptions && (
                          <div className="mt-1 h-1.5 w-24 rounded-full bg-raised overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${Math.min(percent, 100)}%` }} />
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                          c.is_active ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                        }`}>
                          {c.is_active ? "ACTIVE" : "DISABLED"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleToggleActive(c.id, c.is_active)}
                          className="rounded-lg border border-line bg-canvas px-2.5 py-1 text-[11px] font-semibold text-muted hover:text-ink transition-colors cursor-pointer"
                        >
                          {c.is_active ? "Disable" : "Enable"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Single Coupon Modal */}
      {singleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h2 className="text-base font-bold text-ink">Create Custom Coupon</h2>
              <button onClick={() => setSingleModalOpen(false)} className="text-muted hover:text-ink cursor-pointer">&times;</button>
            </div>

            <form onSubmit={handleCreateSingle} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-muted mb-1">Coupon Code</label>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. FLASH50"
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink uppercase font-mono focus:border-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-muted mb-1">Discount Type</label>
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as CouponDiscountType)}
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (₹)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-muted mb-1">Discount Value {discountType === "fixed" ? "(₹)" : "(%)"}</label>
                  <input
                    type="number"
                    min={discountType === "fixed" ? "0.01" : "1"}
                    max={discountType === "percentage" ? "100" : undefined}
                    step={discountType === "fixed" ? "0.01" : "1"}
                    required
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Number(e.target.value))}
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-muted mb-1">Recurrence Scope</label>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as CouponScope)}
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
                >
                  <option value="first_payment">First Payment Only (One-time trial)</option>
                  <option value="first_n_cycles">First N Billing Cycles</option>
                  <option value="every_renewal">Every Renewal (Lifetime recurring)</option>
                </select>
              </div>

              {scope === "first_n_cycles" && (
                <div>
                  <label className="block font-medium text-muted mb-1">Number of Cycles (N)</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={nCycles}
                    onChange={(e) => setNCycles(Number(e.target.value))}
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-muted mb-1">Max Redemptions</label>
                  <input
                    type="number"
                    min="1"
                    value={maxRedemptions}
                    onChange={(e) => setMaxRedemptions(e.target.value)}
                    placeholder="Unlimited"
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-muted mb-1">Valid Until</label>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
                <button
                  type="button"
                  onClick={() => setSingleModalOpen(false)}
                  className="rounded-xl border border-line px-4 py-2 font-semibold text-muted hover:bg-raised transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-primary px-5 py-2 font-semibold text-white shadow-md hover:bg-primary-hover disabled:opacity-50 transition-all cursor-pointer"
                >
                  {saving ? "Saving…" : "Save Coupon"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Generator Modal */}
      {bulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h2 className="text-base font-bold text-ink">Bulk Generate Unique Coupons</h2>
              <button onClick={() => setBulkModalOpen(false)} className="text-muted hover:text-ink cursor-pointer">&times;</button>
            </div>

            <form onSubmit={handleCreateBulk} className="mt-4 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-muted mb-1">Number of Codes</label>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    required
                    value={bulkCount}
                    onChange={(e) => setBulkCount(Number(e.target.value))}
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-muted mb-1">Code Prefix</label>
                  <input
                    type="text"
                    required
                    value={bulkPrefix}
                    onChange={(e) => setBulkPrefix(e.target.value)}
                    placeholder="VIPLAY"
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink uppercase font-mono focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-muted mb-1">Discount Type</label>
                  <select
                    value={bulkDiscountType}
                    onChange={(e) => setBulkDiscountType(e.target.value as CouponDiscountType)}
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed (₹)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-muted mb-1">Discount Value {bulkDiscountType === "fixed" ? "(₹)" : "(%)"}</label>
                  <input
                    type="number"
                    min={bulkDiscountType === "fixed" ? "0.01" : "1"}
                    max={bulkDiscountType === "percentage" ? "100" : undefined}
                    step={bulkDiscountType === "fixed" ? "0.01" : "1"}
                    required
                    value={bulkDiscountValue}
                    onChange={(e) => setBulkDiscountValue(Number(e.target.value))}
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-muted mb-1">Uses Per Code</label>
                <input
                  type="number"
                  min="1"
                  value={bulkMaxRedemptions}
                  onChange={(e) => setBulkMaxRedemptions(Number(e.target.value))}
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
                <button
                  type="button"
                  onClick={() => setBulkModalOpen(false)}
                  className="rounded-xl border border-line px-4 py-2 font-semibold text-muted hover:bg-raised transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-primary px-5 py-2 font-semibold text-white shadow-md hover:bg-primary-hover disabled:opacity-50 transition-all cursor-pointer"
                >
                  {saving ? "Generating…" : `Generate ${bulkCount} Codes`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
