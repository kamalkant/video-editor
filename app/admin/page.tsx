"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { apiMessage } from "./admin-client";
import { GrowthSection } from "./GrowthSection";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [graceLoading, setGraceLoading] = useState(false);
  const [graceMessage, setGraceMessage] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/admin/dashboard/stats");
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(apiMessage(data, "Failed to load dashboard stats"));
      setStats(data.stats);
      setLoadError(null);
    } catch (err: any) {
      // show the failure instead of a dashboard full of zeros that look like real numbers
      setLoadError(err?.message || "Failed to load dashboard stats");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleEvaluateGrace = async () => {
    if (!confirm("Run the grace check now? Overdue subscriptions move to grace, and ones past grace are downgraded.")) return;
    setGraceLoading(true);
    setGraceMessage(null);
    try {
      const res = await fetch("/api/admin/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "evaluate_grace" }),
      });
      const data = await res.json();
      if (data.ok) {
        setGraceMessage(data.message);
        fetchStats();
      } else {
        setGraceMessage(`Grace check failed: ${apiMessage(data, "unknown error")}`);
      }
    } catch (err: any) {
      setGraceMessage("Failed to evaluate grace periods");
    } finally {
      setGraceLoading(false);
    }
  };

  const formatCurrency = (amountInSmallestUnit: number, currency = "INR") => {
    const symbol = currency === "INR" ? "₹" : currency === "USD" ? "$" : `${currency} `;
    return `${symbol}${((amountInSmallestUnit || 0) / 100).toLocaleString(currency === "INR" ? "en-IN" : "en-US", { minimumFractionDigits: 2 })}`;
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted">
        Loading admin telemetry…
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">
        Could not load dashboard: {loadError}
        <button onClick={() => { setLoading(true); fetchStats(); }} className="ml-3 underline cursor-pointer">Retry</button>
      </div>
    );
  }

  const revenue: Array<{ currency: string; gross: number; refunded: number; net: number; payments: number }> = stats?.revenueByCurrency ?? [];
  const primaryRevenue = revenue[0] ?? { currency: "INR", gross: 0, refunded: 0, net: 0, payments: 0 };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Admin Overview</h1>
          <p className="mt-1 text-sm text-muted">
            Real-time revenue, active subscriptions, device metrics, and AI credit telemetry.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleEvaluateGrace}
            disabled={graceLoading}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-raised transition-all cursor-pointer disabled:opacity-50"
            title="Scan for past-due subscriptions and transition to grace period or downgrade"
          >
            <Icon name="clock" className="size-3.5 text-amber-500" />
            <span>{graceLoading ? "Evaluating…" : "Run Grace Check"}</span>
          </button>

          <Link
            href="/admin/plans"
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover shadow-xs transition-all"
          >
            <Icon name="plus" className="size-3.5" />
            <span>New Plan</span>
          </Link>
        </div>
      </div>

      {graceMessage && (
        <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400 flex items-center justify-between">
          <span>{graceMessage}</span>
          <button onClick={() => setGraceMessage(null)} className="text-muted hover:text-ink cursor-pointer">&times;</button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Captured Revenue */}
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Revenue</span>
            <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-500">NET OF REFUNDS</span>
          </div>
          <div className="mt-2 text-3xl font-black tracking-tight text-ink">
            {formatCurrency(primaryRevenue.net, primaryRevenue.currency)}
          </div>
          {revenue.slice(1).map((r) => (
            <div key={r.currency} className="text-sm font-bold text-ink">+ {formatCurrency(r.net, r.currency)}</div>
          ))}
          <p className="mt-2 text-xs text-muted">
            Across {stats?.totalPayments || 0} successful transaction(s)
            {revenue.some((r) => r.refunded > 0) &&
              ` · ${revenue.filter((r) => r.refunded > 0).map((r) => formatCurrency(r.refunded, r.currency)).join(" + ")} refunded`}
          </p>
        </div>

        {/* Active Subscriptions */}
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Subscriptions</span>
            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">LIVE</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight text-ink">
              {stats?.activeSubscriptions || 0}
            </span>
            {stats?.gracePeriodSubscriptions > 0 && (
              <span className="text-xs font-medium text-amber-500">
                (incl. {stats.gracePeriodSubscriptions} in grace)
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">
            {stats?.expiredSubscriptions || 0} expired / cancelled
          </p>
        </div>

        {/* AI Credit Usage */}
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">AI Studio Credits</span>
            <Icon name="ai" className="size-4 text-purple-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight text-ink">
              {stats?.aiCredits?.total_used?.toLocaleString() || 0}
            </span>
            <span className="text-xs text-muted">used</span>
          </div>
          <p className="mt-2 text-xs text-muted">
            {stats?.aiCredits?.total_balance?.toLocaleString() || 0} credits currently held by users
          </p>
        </div>

        {/* Coupon Performance */}
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">Coupon Redemptions</span>
            <Icon name="star" className="size-4 text-blue-500" />
          </div>
          <div className="mt-2 text-3xl font-black tracking-tight text-ink">
            {stats?.couponRedemptions || 0}
          </div>
          <p className="mt-2 text-xs text-muted">
            Total discounts claimed across checkout orders
          </p>
        </div>
      </div>

      {/* Grid: Plan Distribution & Quick Shortcuts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Subscriptions by Plan */}
        <div className="lg:col-span-2 rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-ink">Subscriptions by Plan</h2>
            <Link href="/admin/plans" className="text-xs font-semibold text-primary hover:underline">
              Manage Plans &rarr;
            </Link>
          </div>

          <div className="space-y-3.5">
            {stats?.subsByPlan?.map((p: any) => {
              const count = p.count || 0;
              // same live-subscription definition as the numerator, so shares never exceed 100%
              const totalActive = Math.max(stats?.activeSubscriptions || 1, 1);
              const percent = Math.round((count / totalActive) * 100);

              return (
                <div key={p.plan_name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-ink">{p.plan_name}</span>
                    <span className="text-muted">{count} subscribers ({percent}%)</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-raised overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${Math.max(percent, count > 0 ? 5 : 0)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Management Shortcuts */}
        <div className="space-y-3">
          <Link
            href="/admin/coupons"
            className="group block rounded-2xl border border-line bg-surface p-5 shadow-sm transition-all hover:border-primary/50 hover:bg-raised/40"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted group-hover:text-primary">Coupons</span>
              <Icon name="chevronRight" className="size-4 text-muted group-hover:translate-x-1 transition-transform" />
            </div>
            <p className="mt-1 text-sm font-semibold text-ink">Generate Discount Codes</p>
            <p className="text-xs text-muted mt-0.5">Create single codes or bulk-generate hundreds of unique promo codes.</p>
          </Link>

          <Link
            href="/admin/bulk-jobs"
            className="group block rounded-2xl border border-line bg-surface p-5 shadow-sm transition-all hover:border-primary/50 hover:bg-raised/40"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted group-hover:text-primary">Bulk Runner</span>
              <Icon name="chevronRight" className="size-4 text-muted group-hover:translate-x-1 transition-transform" />
            </div>
            <p className="mt-1 text-sm font-semibold text-ink">Run Async Operations</p>
            <p className="text-xs text-muted mt-0.5">Bulk grant AI credits, mass-logout devices, or send announcements.</p>
          </Link>

          <Link
            href="/admin/settings"
            className="group block rounded-2xl border border-line bg-surface p-5 shadow-sm transition-all hover:border-primary/50 hover:bg-raised/40"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted group-hover:text-primary">Configuration</span>
              <Icon name="chevronRight" className="size-4 text-muted group-hover:translate-x-1 transition-transform" />
            </div>
            <p className="mt-1 text-sm font-semibold text-ink">Gateway & Tax Settings</p>
            <p className="text-xs text-muted mt-0.5">Switch Razorpay Sandbox mode, configure taxes, and adjust grace periods.</p>
          </Link>
        </div>
      </div>

      {stats.growth && <GrowthSection growth={stats.growth} />}

      {/* Recent Payments Stream */}
      <div className="rounded-2xl border border-line bg-surface overflow-hidden shadow-sm">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-base font-bold text-ink">Recent Transactions</h2>
          <Link href="/admin/subscriptions" className="text-xs font-semibold text-primary hover:underline">
            View All Payments &rarr;
          </Link>
        </div>

        {stats?.recentPayments?.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted">No transactions recorded yet.</div>
        ) : (
          <div className="divide-y divide-line/60">
            {stats?.recentPayments?.map((pay: any) => (
              <div key={pay.id} className="flex items-center justify-between px-6 py-3.5 text-xs">
                <div className="space-y-0.5">
                  <div className="font-semibold text-ink flex items-center gap-2">
                    <span>{pay.user_name}</span>
                    <span className="text-muted font-normal">({pay.user_email})</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      pay.status === "captured" ? "bg-emerald-500/10 text-emerald-400" :
                      pay.status === "refunded" ? "bg-purple-500/10 text-purple-400" :
                      "bg-amber-500/10 text-amber-400"
                    }`}>
                      {pay.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted">
                    Invoice: <span className="font-mono">{pay.invoice_number}</span> &bull; Order: {pay.razorpay_order_id}
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-bold text-ink">{formatCurrency(pay.amount, pay.currency)}</div>
                  <div className="text-[11px] text-muted">{new Date(pay.created_at).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
