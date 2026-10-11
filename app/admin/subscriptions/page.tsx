"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { apiMessage, useAdminViewer } from "../admin-client";
import { ExportCsv } from "../ExportCsv";
import { Pager } from "../Pager";

const PAGE_SIZE = 50;

export default function AdminSubscriptionsPage() {
  const { isSuperAdmin } = useAdminViewer();
  const [activeTab, setActiveTab] = useState<"subscriptions" | "payments">("subscriptions");
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  // pages of PAGE_SIZE; back to page 1 whenever the filter changes
  const [paging, setPaging] = useState({ key: "", page: 1 });
  const [total, setTotal] = useState(0);
  const page = paging.key === `${activeTab}:${statusFilter}` ? paging.page : 1;
  const goTo = (p: number) => setPaging({ key: `${activeTab}:${statusFilter}`, page: p });

  // Refund Modal state
  const [refundTarget, setRefundTarget] = useState<any | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [refundAmount, setRefundAmount] = useState<number>(0);
  const [refundLoading, setRefundLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchSubscriptions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/subscriptions?status=${statusFilter}&limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`);
      const data = await res.json();
      if (data.ok) {
        setSubscriptions(data.subscriptions);
        setTotal(data.total ?? 0);
      }
    } catch (err) {
      console.error("Failed to load subscriptions", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/payments?status=${statusFilter}&limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`);
      const data = await res.json();
      if (data.ok) {
        setPayments(data.payments);
        setTotal(data.total ?? 0);
      }
    } catch (err) {
      console.error("Failed to load payments", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "subscriptions") fetchSubscriptions();
    else fetchPayments();
  }, [activeTab, statusFilter, page]);

  const handleCancelSub = async (subscriptionId: string) => {
    if (!confirm("Are you sure you want to cancel this subscription immediately?")) return;
    try {
      const res = await fetch("/api/admin/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", subscriptionId }),
      });
      const data = await res.json();
      setActionMessage(data.ok ? data.message : `Cancellation failed: ${apiMessage(data, "unknown error")}`);
      if (data.ok) fetchSubscriptions();
    } catch {
      setActionMessage("Cancellation failed: network error");
    }
  };

  const handleRenewSub = async (subscriptionId: string) => {
    if (!confirm("Extend this subscription by one billing period free of charge? The plan's AI credits are granted too.")) return;
    try {
      const res = await fetch("/api/admin/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "renew", subscriptionId }),
      });
      const data = await res.json();
      setActionMessage(data.ok ? "Subscription extended by one period (complimentary)" : `Extension failed: ${apiMessage(data, "unknown error")}`);
      if (data.ok) fetchSubscriptions();
    } catch {
      setActionMessage("Extension failed: network error");
    }
  };

  const refundableOf = (p: any) => Math.max(0, (p.amount || 0) - (p.refunded_amount || 0));

  const openRefundModal = (p: any) => {
    setRefundTarget(p);
    setRefundAmount(refundableOf(p) / 100);
    setRefundReason("Customer requested cancellation");
    setActionMessage(null);
  };

  const handleProcessRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundTarget) return;

    setRefundLoading(true);
    try {
      const res = await fetch("/api/admin/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId: refundTarget.id,
          amount: Math.round(refundAmount * 100),
          reason: refundReason,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(apiMessage(data, "Refund failed"));

      setActionMessage("Refund processed successfully!");
      setRefundTarget(null);
      fetchPayments();
    } catch (err: any) {
      setActionMessage(`Refund error: ${err.message}`);
    } finally {
      setRefundLoading(false);
    }
  };

  const formatMoney = (val: number, cur = "INR") => {
    return `${cur === "INR" ? "₹" : "$"}${((val || 0) / 100).toLocaleString()}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Subscriptions & Payments</h1>
          <p className="mt-1 text-xs text-muted">
            Manage active memberships, monitor grace periods, inspect invoices, and process refunds.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <ExportCsv kind="payments" label="Payments CSV" />
            <ExportCsv kind="refunds" label="Refunds CSV" />
          </div>
        </div>

        {/* Tab switchers */}
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface p-1">
          <button
            onClick={() => { setActiveTab("subscriptions"); setStatusFilter("all"); }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "subscriptions" ? "bg-primary text-white shadow-xs" : "text-muted hover:text-ink"
            }`}
          >
            Subscriptions
          </button>
          <button
            onClick={() => { setActiveTab("payments"); setStatusFilter("all"); }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "payments" ? "bg-primary text-white shadow-xs" : "text-muted hover:text-ink"
            }`}
          >
            Payments & Receipts
          </button>
        </div>
      </div>

      {actionMessage && (
        <div role="status" className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-primary flex items-center justify-between">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-muted hover:text-ink cursor-pointer">&times;</button>
        </div>
      )}

      {/* Filters Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted">Filter status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-line bg-surface px-2.5 py-1 text-xs text-ink focus:border-primary focus:outline-none"
          >
            <option value="all">All</option>
            {activeTab === "subscriptions" ? (
              <>
                <option value="active">Active</option>
                <option value="grace_period">In Grace Period</option>
                <option value="cancelled">Cancelled</option>
                <option value="expired">Expired</option>
              </>
            ) : (
              <>
                <option value="captured">Captured</option>
                <option value="partially_refunded">Partially refunded</option>
                <option value="refunded">Refunded</option>
                <option value="failed">Failed</option>
              </>
            )}
          </select>
        </div>
      </div>

      {/* Subscriptions Table */}
      {activeTab === "subscriptions" && (
        <div className="rounded-2xl border border-line bg-surface overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted">Loading subscriptions…</div>
          ) : subscriptions.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted">No subscriptions found for this filter.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line bg-raised/40 text-muted uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Plan</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Period End</th>
                    <th className="py-3 px-4">Renewals</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {subscriptions.map((s) => (
                    <tr key={s.id} className="hover:bg-raised/30 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-ink">
                        <div>{s.user_name}</div>
                        <div className="text-[11px] font-normal text-muted">{s.user_email}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-ink">{s.plan_name}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                          s.status === "active" ? "bg-emerald-500/10 text-emerald-400" :
                          s.status === "grace_period" ? "bg-amber-500/15 text-amber-400" :
                          s.status === "cancelled" ? "bg-red-500/10 text-red-400" :
                          "bg-zinc-500/15 text-muted"
                        }`}>
                          {s.status.toUpperCase().replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-muted">
                        <div>{new Date(s.current_period_end).toLocaleDateString()}</div>
                        {s.cancel_at_period_end === 1 && (
                          <span className="text-[10px] text-amber-500 font-medium">Cancels on expiry</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-muted">
                        {s.renewal_count} cycle(s)
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {["active", "grace_period", "past_due"].includes(s.status) && (
                            <button
                              onClick={() => handleRenewSub(s.id)}
                              title="Extend by one billing period at no charge"
                              className="rounded-lg border border-line bg-canvas px-2.5 py-1 text-[11px] font-semibold text-ink hover:bg-raised transition-colors cursor-pointer"
                            >
                              + Extend (free)
                            </button>
                          )}
                          {["active", "trialing", "grace_period", "past_due"].includes(s.status) && (
                            <button
                              onClick={() => handleCancelSub(s.id)}
                              className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={page} total={total} pageSize={PAGE_SIZE} onPage={goTo} />
        </div>
      )}

      {/* Payments Table */}
      {activeTab === "payments" && (
        <div className="rounded-2xl border border-line bg-surface overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted">Loading payments…</div>
          ) : payments.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted">No payments found for this filter.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line bg-raised/40 text-muted uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Invoice</th>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Gateway Order / Payment</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-right">Refund</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-raised/30 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-ink">
                        <a href={`/api/admin/payments/${p.id}/invoice`} download title="Download the GST invoice" className="hover:text-primary hover:underline">
                          {p.invoice_number || `INV-${p.id.slice(0, 8)}`}
                        </a>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-ink">{p.user_name}</div>
                        <div className="text-[11px] text-muted">{p.user_email}</div>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-ink">
                        {formatMoney(p.amount, p.currency)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                          p.status === "captured" ? "bg-emerald-500/10 text-emerald-400" :
                          p.status === "refunded" || p.status === "partially_refunded" ? "bg-purple-500/10 text-purple-400" :
                          "bg-red-500/10 text-red-400"
                        }`}>
                          {p.status.toUpperCase().replace("_", " ")}
                        </span>
                        {p.refunded_amount > 0 && (
                          <div className="mt-0.5 text-[10px] text-muted">Refunded {formatMoney(p.refunded_amount, p.currency)}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-muted">
                        <div>{p.razorpay_order_id}</div>
                        {p.razorpay_payment_id && <div className="text-zinc-500">{p.razorpay_payment_id}</div>}
                      </td>
                      <td className="py-3.5 px-4 text-muted">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {isSuperAdmin && (p.status === "captured" || p.status === "partially_refunded") && refundableOf(p) > 0 && (
                          <button
                            onClick={() => openRefundModal(p)}
                            className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-[11px] font-semibold text-purple-400 hover:bg-purple-500/20 transition-colors cursor-pointer"
                          >
                            Refund
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={page} total={total} pageSize={PAGE_SIZE} onPage={goTo} />
        </div>
      )}

      {/* Refund Modal */}
      {refundTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h2 className="text-base font-bold text-ink">Process Payment Refund</h2>
              <button onClick={() => setRefundTarget(null)} className="text-muted hover:text-ink cursor-pointer">&times;</button>
            </div>

            <form onSubmit={handleProcessRefund} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-muted mb-1">Invoice / User</label>
                <div className="font-semibold text-ink">{refundTarget.invoice_number} &bull; {refundTarget.user_name}</div>
              </div>

              <div>
                <label className="block font-medium text-muted mb-1">
                  Refund Amount ({refundTarget.currency}) · up to {formatMoney(refundableOf(refundTarget), refundTarget.currency)}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={refundableOf(refundTarget) / 100}
                  required
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(Number(e.target.value))}
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-muted mb-1">Reason for Refund</label>
                <textarea
                  rows={3}
                  required
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="e.g. Dissatisfied with service / duplicate charge"
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
                <button
                  type="button"
                  onClick={() => setRefundTarget(null)}
                  className="rounded-xl border border-line px-4 py-2 font-semibold text-muted hover:bg-raised transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={refundLoading}
                  className="rounded-xl bg-purple-600 px-5 py-2 font-semibold text-white shadow-md hover:bg-purple-700 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {refundLoading ? "Processing…" : "Confirm Refund"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
