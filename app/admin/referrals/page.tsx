"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Pager } from "../Pager";

const PAGE_SIZE = 50;

export default function AdminReferralsPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  // pages of PAGE_SIZE; back to page 1 whenever the filter changes
  const [paging, setPaging] = useState({ key: "", page: 1 });
  const [total, setTotal] = useState(0);
  const page = paging.key === statusFilter ? paging.page : 1;
  const goTo = (p: number) => setPaging({ key: statusFilter, page: p });
  const [config, setConfig] = useState<any>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchReferrals = async () => {
    try {
      const [refRes, confRes] = await Promise.all([
        fetch(`/api/admin/referrals?status=${statusFilter}&limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`),
        fetch("/api/admin/referrals/settings"),
      ]);
      const [refData, confData] = await Promise.all([refRes.json(), confRes.json()]);

      if (refData.ok) {
        setStats(refData.stats);
        setReferrals(refData.referrals || []);
        setTotal(refData.total ?? 0);
      }
      if (confData.ok) {
        setConfig(confData.config);
      }
    } catch (err) {
      console.error("Admin referrals fetch error", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReferrals();
  }, [statusFilter, page]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setSavingConfig(true);

    try {
      const res = await fetch("/api/admin/referrals/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      const data = await res.json();
      if (!data.ok) {
        alert(data.message || "Failed to update configuration");
      } else {
        showToast("Referral & Payout configuration updated successfully!");
        setConfig(data.config);
      }
    } catch (err: any) {
      alert(err?.message || "Failed to save configuration");
    } finally {
      setSavingConfig(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="size-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-xs text-muted">Loading Referral Suite...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-ink px-4 py-2.5 text-xs font-semibold text-canvas shadow-2xl animate-in slide-in-from-bottom-3">
          {toastMessage}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">Referral Program & Campaigns</h1>
          <p className="text-xs text-muted">
            Configure rewards, holding cooling-off periods, minimum withdrawal thresholds, and track attributions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
              config?.enabled
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
            }`}
          >
            <span
              className={`size-2 rounded-full ${config?.enabled ? "bg-emerald-500" : "bg-amber-500"}`}
            />
            <span>{config?.enabled ? "Program Active" : "Program Paused"}</span>
          </span>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="text-[11px] font-semibold text-muted uppercase">Total Referrals</div>
          <div className="mt-1 text-2xl font-black text-ink">{stats?.totalReferrals || 0}</div>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="text-[11px] font-semibold text-muted uppercase">Total Conversions</div>
          <div className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">
            {stats?.totalConversions || 0}
          </div>
          <div className="mt-0.5 text-[10px] text-muted">{stats?.conversionRate}% conversion rate</div>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="text-[11px] font-semibold text-muted uppercase">Pending Liability</div>
          <div className="mt-1 text-2xl font-black text-amber-500">
            ₹{((stats?.totalPendingLiability || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-0.5 text-[10px] text-muted">Holding in pending</div>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="text-[11px] font-semibold text-muted uppercase">Total Paid Payouts</div>
          <div className="mt-1 text-2xl font-black text-primary">
            ₹{((stats?.totalPaidPayouts || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-0.5 text-[10px] text-muted">Dispatched to creators</div>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="text-[11px] font-semibold text-muted uppercase">Min Withdrawal Limit</div>
          <div className="mt-1 text-2xl font-black text-ink">
            ₹{((config?.minWithdrawalThreshold || 1000000) / 100).toLocaleString("en-IN")}
          </div>
          <div className="mt-0.5 text-[10px] text-muted">Configured threshold</div>
        </div>
      </div>

      {/* Program Configuration Card */}
      {config && (
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-line pb-4">
            <div>
              <h2 className="text-sm font-bold text-ink">Reward & Withdrawal Rules Configuration</h2>
              <p className="text-xs text-muted">Super Admin controls for rewards, holding periods, and limits</p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs font-semibold text-ink">Enable Referral Program</span>
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                className="size-4 accent-primary rounded cursor-pointer"
              />
            </label>
          </div>

          <form onSubmit={handleSaveConfig} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Reward Type */}
              <div>
                <label className="block text-xs font-semibold text-muted mb-1.5">Reward Calculation Type</label>
                <select
                  value={config.rewardType}
                  onChange={(e) => setConfig({ ...config, rewardType: e.target.value })}
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs text-ink outline-none focus:border-primary"
                >
                  <option value="percentage">Percentage of First Payment (%)</option>
                  <option value="fixed">Fixed Reward Amount (₹)</option>
                </select>
                <span className="mt-1 block text-[10px] text-muted">
                  {config.rewardType === "percentage"
                    ? "Calculated dynamically on customer's first qualifying subscription"
                    : "Fixed rupee amount credited per qualifying referral"}
                </span>
              </div>

              {/* Reward Value */}
              <div>
                <label className="block text-xs font-semibold text-muted mb-1.5">
                  {config.rewardType === "percentage" ? "Commission Percentage (%)" : "Reward Amount (Paise: e.g. 50000 = ₹500)"}
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={config.rewardValue}
                  onChange={(e) => setConfig({ ...config, rewardValue: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-mono text-ink outline-none focus:border-primary"
                />
                <span className="mt-1 block text-[10px] text-muted">
                  {config.rewardType === "percentage" ? `${config.rewardValue}% of payment` : `₹${(config.rewardValue / 100).toFixed(2)}`}
                </span>
              </div>

              {/* Holding Period */}
              <div>
                <label className="block text-xs font-semibold text-muted mb-1.5">Cooling-Off Holding Period (Days)</label>
                <input
                  type="number"
                  required
                  min="0"
                  max="90"
                  value={config.holdingPeriodDays}
                  onChange={(e) => setConfig({ ...config, holdingPeriodDays: parseInt(e.target.value, 10) || 0 })}
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-mono text-ink outline-none focus:border-primary"
                />
                <span className="mt-1 block text-[10px] text-muted">
                  Protects against refunds. Reward transitions to Available after {config.holdingPeriodDays} days.
                </span>
              </div>

              {/* Minimum Withdrawal Threshold */}
              <div>
                <label className="block text-xs font-semibold text-muted mb-1.5">
                  Min Withdrawal Threshold (Paise: 1000000 = ₹10,000)
                </label>
                <input
                  type="number"
                  required
                  min="10000"
                  value={config.minWithdrawalThreshold}
                  onChange={(e) => setConfig({ ...config, minWithdrawalThreshold: parseInt(e.target.value, 10) || 0 })}
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-mono text-ink outline-none focus:border-primary"
                />
                <span className="mt-1 block text-[10px] font-bold text-primary">
                  Currently: ₹{((config.minWithdrawalThreshold || 0) / 100).toLocaleString("en-IN")}
                </span>
              </div>

              {/* Maximum Withdrawal per Request */}
              <div>
                <label className="block text-xs font-semibold text-muted mb-1.5">
                  Max Withdrawal Per Request (Paise: 5000000 = ₹50,000)
                </label>
                <input
                  type="number"
                  required
                  min="100000"
                  value={config.maxWithdrawalPerRequest}
                  onChange={(e) => setConfig({ ...config, maxWithdrawalPerRequest: parseInt(e.target.value, 10) || 0 })}
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-mono text-ink outline-none focus:border-primary"
                />
                <span className="mt-1 block text-[10px] text-muted">
                  ₹{((config.maxWithdrawalPerRequest || 0) / 100).toLocaleString("en-IN")} per transaction
                </span>
              </div>

              {/* Attribution Window */}
              <div>
                <label className="block text-xs font-semibold text-muted mb-1.5">Attribution Window (Days)</label>
                <input
                  type="number"
                  required
                  min="1"
                  max="180"
                  value={config.attributionWindowDays}
                  onChange={(e) => setConfig({ ...config, attributionWindowDays: parseInt(e.target.value, 10) || 0 })}
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-mono text-ink outline-none focus:border-primary"
                />
                <span className="mt-1 block text-[10px] text-muted">
                  Referred user must make their purchase within {config.attributionWindowDays} days of signup.
                </span>
              </div>
            </div>

            {/* Payout Provider & Credentials */}
            <div className="border-t border-line pt-4 space-y-4">
              <div>
                <h3 className="text-xs font-bold text-ink uppercase tracking-wider">Payout Provider & Gateway Configuration</h3>
                <p className="text-[11px] text-muted">Configure RazorpayX Payouts or utilize Admin Manual Bank/UPI Reference entry</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">RazorpayX Key ID</label>
                  <input
                    type="text"
                    placeholder="rzp_live_... or test key"
                    value={config.razorpayxKeyId || ""}
                    onChange={(e) => setConfig({ ...config, razorpayxKeyId: e.target.value })}
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-mono text-ink outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">RazorpayX Key Secret</label>
                  <input
                    type="password"
                    placeholder="••••••••••••"
                    value={config.razorpayxKeySecret || ""}
                    onChange={(e) => setConfig({ ...config, razorpayxKeySecret: e.target.value })}
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-mono text-ink outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">RazorpayX Current Account Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 7878780080312345"
                    value={config.razorpayxAccountNumber || ""}
                    onChange={(e) => setConfig({ ...config, razorpayxAccountNumber: e.target.value })}
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-mono text-ink outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingConfig}
                className="rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-primary-hover transition-colors cursor-pointer"
              >
                {savingConfig ? "Saving Configuration..." : "Save Program Configuration"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Referrals Attribution Table */}
      <div className="rounded-2xl border border-line bg-surface overflow-hidden shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-line bg-canvas/30">
          <div>
            <h3 className="text-sm font-bold text-ink">Referral Attributions & Conversions</h3>
            <p className="text-xs text-muted">Real-time log of users signed up and converted through referrals</p>
          </div>

          <div className="flex items-center gap-1.5">
            {["all", "converted", "signed_up", "expired"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold capitalize transition-all cursor-pointer ${
                  statusFilter === s ? "bg-primary text-white" : "text-muted hover:text-ink hover:bg-raised"
                }`}
              >
                {s === "all" ? "All Statuses" : s === "signed_up" ? "Signed Up" : s}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 sm:p-5 overflow-x-auto">
          {referrals.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted">No referrals matching filter found.</div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line/60 text-muted font-mono uppercase text-[10px]">
                  <th className="pb-2.5">Referrer</th>
                  <th className="pb-2.5">Referred Creator</th>
                  <th className="pb-2.5">Code</th>
                  <th className="pb-2.5">Attributed Date</th>
                  <th className="pb-2.5">Status</th>
                  <th className="pb-2.5">Reward Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/40">
                {referrals.map((r) => (
                  <tr key={r.id} className="hover:bg-raised/40 transition-colors">
                    <td className="py-3">
                      <div className="font-semibold text-ink">{r.referrer_name}</div>
                      <div className="text-[10px] text-muted truncate max-w-[180px]">{r.referrer_email}</div>
                    </td>
                    <td className="py-3">
                      <div className="font-semibold text-ink">{r.referred_name}</div>
                      <div className="text-[10px] text-muted truncate max-w-[180px]">{r.referred_email}</div>
                    </td>
                    <td className="py-3 font-mono text-primary font-bold">{r.referral_code}</td>
                    <td className="py-3 text-muted">{new Date(r.attributed_at).toLocaleDateString()}</td>
                    <td className="py-3">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                          r.status === "converted"
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : r.status === "signed_up"
                            ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                            : "bg-neutral-500/15 text-neutral-500"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 font-mono font-bold">
                      {r.reward_amount ? (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          ₹{(r.reward_amount / 100).toFixed(2)} ({r.reward_status})
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <Pager page={page} total={total} pageSize={PAGE_SIZE} onPage={goTo} />
      </div>
    </div>
  );
}
