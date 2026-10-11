"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { apiMessage, useAdminViewer } from "../admin-client";
import { ExportCsv } from "../ExportCsv";
import { Pager } from "../Pager";

// statuses a bulk approve/reject can act on (paid/processing/rejected rows are never selectable)
const PAGE_SIZE = 50;
const BULK_ELIGIBLE = ["requested", "under_review", "approved"];

export default function AdminPayoutsPage() {
  const { isSuperAdmin } = useAdminViewer();
  const [loading, setLoading] = useState(true);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // pages of PAGE_SIZE; back to page 1 whenever the filter changes
  const [paging, setPaging] = useState({ key: "", page: 1 });
  const [total, setTotal] = useState(0);
  const page = paging.key === statusFilter ? paging.page : 1;
  const goTo = (p: number) => setPaging({ key: statusFilter, page: p });

  // Action Modals
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isBulkReject, setIsBulkReject] = useState(false);

  const [markPaidModalOpen, setMarkPaidModalOpen] = useState(false);
  const [paymentReference, setPaymentReference] = useState("");

  const [actionLoading, setActionLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchPayouts = async () => {
    try {
      const res = await fetch(`/api/admin/payouts?status=${statusFilter}&limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`);
      const data = await res.json();
      if (data.ok) {
        setPayouts(data.payouts || []);
        setTotal(data.total ?? 0);
      }
    } catch (err) {
      console.error("Failed to load payouts", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayouts();
    setSelectedIds([]);
  }, [statusFilter, page]);

  const handleApprove = async (id: string) => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/payouts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", requestId: id }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast("Payout request approved");
        fetchPayouts();
      } else {
        alert(apiMessage(data, "Failed to approve payout"));
      }
    } catch (err: any) {
      alert(err?.message || "Error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectReason.trim()) return;
    setActionLoading(true);

    try {
      if (isBulkReject) {
        const res = await fetch("/api/admin/payouts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "bulk_reject",
            requestIds: selectedIds,
            reason: rejectReason.trim(),
          }),
        });
        const data = await res.json();
        if (data.ok) {
          showToast(data.message);
          setRejectModalOpen(false);
          setRejectReason("");
          fetchPayouts();
        } else {
          alert(apiMessage(data, "Bulk reject failed"));
        }
      } else if (activeRequestId) {
        const res = await fetch("/api/admin/payouts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "reject",
            requestId: activeRequestId,
            reason: rejectReason.trim(),
          }),
        });
        const data = await res.json();
        if (data.ok) {
          showToast("Payout rejected and funds returned to user wallet");
          setRejectModalOpen(false);
          setRejectReason("");
          fetchPayouts();
        } else {
          alert(apiMessage(data, "Reject failed"));
        }
      }
    } catch (err: any) {
      alert(err?.message || "Error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmMarkPaid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentReference.trim() || !activeRequestId) return;
    setActionLoading(true);

    try {
      const res = await fetch("/api/admin/payouts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mark_paid",
          requestId: activeRequestId,
          reference: paymentReference.trim(),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast("Payout marked as paid successfully!");
        setMarkPaidModalOpen(false);
        setPaymentReference("");
        fetchPayouts();
      } else {
        alert(apiMessage(data, "Failed to mark as paid"));
      }
    } catch (err: any) {
      alert(err?.message || "Error");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePayViaGateway = async (id: string) => {
    if (!confirm("Dispatch this payout via payment gateway adapter?")) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/payouts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "process_gateway", requestId: id }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast(data.message || "Payout processed via gateway");
        fetchPayouts();
      } else {
        alert(apiMessage(data, "Gateway dispatch failed"));
        fetchPayouts();
      }
    } catch (err: any) {
      alert(err?.message || "Error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Approve ${selectedIds.length} selected payout requests?`)) return;
    setActionLoading(true);

    try {
      const res = await fetch("/api/admin/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk_approve",
          requestIds: selectedIds,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast(data.message);
        fetchPayouts();
      } else {
        alert(apiMessage(data, "Bulk approve failed"));
      }
    } catch (err: any) {
      alert(err?.message || "Error");
    } finally {
      setActionLoading(false);
    }
  };

  const eligibleIds = payouts.filter((p) => BULK_ELIGIBLE.includes(p.status)).map((p) => p.id);

  const toggleSelectAll = () => {
    if (eligibleIds.length > 0 && selectedIds.length === eligibleIds.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(eligibleIds);
    }
  };

  const toggleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((x) => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="size-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-xs text-muted">Loading Payout Requests...</span>
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
          <h1 className="text-xl font-bold tracking-tight text-ink">Payouts & Withdrawals Queue</h1>
          <p className="text-xs text-muted">
            Review creator withdrawal requests, record bank/UPI transfer references (UTR), or dispatch via gateway.
          </p>
        </div>
        <ExportCsv kind="payouts" label="Payouts CSV" />
      </div>

      {/* Filter and Bulk Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border border-line bg-surface shadow-xs">
        {/* Status Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {["all", "requested", "approved", "processing", "paid", "rejected"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-all cursor-pointer ${
                statusFilter === s ? "bg-primary text-white" : "text-muted hover:text-ink hover:bg-raised"
              }`}
            >
              {s === "all" ? "All Requests" : s}
            </button>
          ))}
        </div>

        {/* Bulk Action Controls */}
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-ink">{selectedIds.length} selected</span>
            <button
              type="button"
              disabled={actionLoading}
              onClick={handleBulkApprove}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors cursor-pointer"
            >
              Bulk Approve
            </button>
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => {
                setIsBulkReject(true);
                setRejectReason("");
                setRejectModalOpen(true);
              }}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-red-700 transition-colors cursor-pointer"
            >
              Bulk Reject
            </button>
          </div>
        )}
      </div>

      {/* Payouts Table */}
      <div className="rounded-2xl border border-line bg-surface overflow-hidden shadow-xs">
        <div className="p-4 sm:p-5 overflow-x-auto">
          {payouts.length === 0 ? (
            <div className="py-16 text-center text-xs text-muted">
              No payout requests found for the selected filter.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line/60 text-muted font-mono uppercase text-[10px]">
                  <th className="pb-3 w-8">
                    <input
                      type="checkbox"
                      checked={eligibleIds.length > 0 && selectedIds.length === eligibleIds.length}
                      onChange={toggleSelectAll}
                      className="size-3.5 rounded accent-primary cursor-pointer"
                    />
                  </th>
                  <th className="pb-3">Request ID</th>
                  <th className="pb-3">Creator / User</th>
                  <th className="pb-3">Amount</th>
                  <th className="pb-3">Beneficiary Details</th>
                  <th className="pb-3">Requested</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Reference / Reason</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/40">
                {payouts.map((p) => {
                  const isSelected = selectedIds.includes(p.id);
                  const isPendingReview = p.status === "requested" || p.status === "under_review";
                  const isApproved = p.status === "approved" || p.status === "processing";
                  const isProcessing = p.status === "processing";

                  return (
                    <tr key={p.id} className="hover:bg-raised/40 transition-colors">
                      <td className="py-3.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!BULK_ELIGIBLE.includes(p.status)}
                          onChange={() => toggleSelectOne(p.id)}
                          className="size-3.5 rounded accent-primary cursor-pointer"
                        />
                      </td>
                      <td className="py-3.5 font-mono text-[11px] text-muted">{p.id}</td>
                      <td className="py-3.5">
                        <div className="font-semibold text-ink">{p.user_name}</div>
                        <div className="text-[10px] text-muted truncate max-w-[160px]">{p.user_email}</div>
                      </td>
                      <td className="py-3.5 font-mono font-bold text-ink">
                        ₹{(p.amount / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5">
                        <div className="font-bold text-ink truncate max-w-[180px]">
                          {p.beneficiary?.account_holder_name}
                        </div>
                        <div className="text-[11px] font-mono text-muted truncate max-w-[180px]">
                          {p.beneficiary?.payout_method === "upi"
                            ? `UPI: ${p.beneficiary?.upi_id}`
                            : `${p.beneficiary?.bank_account_number} (${p.beneficiary?.bank_ifsc})`}
                        </div>
                      </td>
                      <td className="py-3.5 text-muted">{new Date(p.requested_at).toLocaleDateString()}</td>
                      <td className="py-3.5">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                            p.status === "paid"
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                              : p.status === "rejected"
                              ? "bg-red-500/15 text-red-600 dark:text-red-400"
                              : p.status === "approved" || p.status === "processing"
                              ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                              : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3.5 text-[11px] max-w-[180px]">
                        {p.payout_reference && (
                          <div className="font-mono text-emerald-600 dark:text-emerald-400 truncate">
                            UTR: {p.payout_reference}
                          </div>
                        )}
                        {p.rejection_reason && (
                          <div className="text-red-500 truncate" title={p.rejection_reason}>
                            {p.rejection_reason}
                          </div>
                        )}
                        {p.failure_reason && p.status !== "paid" && (
                          <div className="text-amber-500 truncate" title={p.failure_reason}>
                            Gateway failed: {p.failure_reason}
                          </div>
                        )}
                        {!p.payout_reference && !p.rejection_reason && !p.failure_reason && <span className="text-muted">—</span>}
                      </td>
                      <td className="py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isPendingReview && (
                            <>
                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() => handleApprove(p.id)}
                                className="rounded-lg bg-primary px-2.5 py-1 text-[11px] font-bold text-white hover:bg-primary-hover transition-colors cursor-pointer"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() => {
                                  setIsBulkReject(false);
                                  setActiveRequestId(p.id);
                                  setRejectReason("");
                                  setRejectModalOpen(true);
                                }}
                                className="rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 px-2 py-1 text-[11px] font-bold transition-colors cursor-pointer"
                              >
                                Reject
                              </button>
                            </>
                          )}

                          {isApproved && (
                            <>
                              {isSuperAdmin && (
                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() => {
                                  setActiveRequestId(p.id);
                                  setPaymentReference("");
                                  setMarkPaidModalOpen(true);
                                }}
                                className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 transition-colors cursor-pointer"
                              >
                                Mark Paid
                              </button>
                              )}
                              {isSuperAdmin && !isProcessing && (
                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() => handlePayViaGateway(p.id)}
                                className="rounded-lg border border-line bg-raised hover:bg-surface px-2 py-1 text-[11px] font-semibold text-muted hover:text-ink transition-colors cursor-pointer"
                                title="Execute via payment provider adapter"
                              >
                                Gateway
                              </button>
                              )}
                              {isProcessing && (
                                <span className="font-mono text-[10px] text-muted" title="Sent to the gateway; record the UTR with Mark Paid once settled">Processing</span>
                              )}
                              {!isProcessing && (
                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() => {
                                  setIsBulkReject(false);
                                  setActiveRequestId(p.id);
                                  setRejectReason("");
                                  setRejectModalOpen(true);
                                }}
                                className="rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 px-2 py-1 text-[11px] font-bold transition-colors cursor-pointer"
                              >
                                Reject
                              </button>
                              )}
                            </>
                          )}

                          {p.status === "paid" && (
                            <span className="font-mono text-[10px] text-muted">Completed</span>
                          )}

                          {p.status === "rejected" && (
                            <span className="font-mono text-[10px] text-muted">Refunded</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <Pager page={page} total={total} pageSize={PAGE_SIZE} onPage={goTo} />
      </div>

      {/* Reject Modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-ink">Reject Withdrawal Request</h3>
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="text-muted hover:text-ink cursor-pointer"
              >
                <Icon name="close" className="size-4" />
              </button>
            </div>

            <p className="text-xs text-muted">
              Rejecting this request will immediately release all locked funds back to the user&apos;s available wallet balance.
              A rejection reason is mandatory and will be displayed to the creator.
            </p>

            <form onSubmit={handleConfirmReject} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Rejection Reason</label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Invalid bank account details, beneficiary name mismatch, or verification required."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full rounded-xl border border-line bg-canvas p-3 text-xs text-ink outline-none focus:border-red-500"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectModalOpen(false)}
                  className="rounded-xl border border-line bg-surface px-4 py-2 text-xs font-semibold text-muted hover:text-ink cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 transition-colors cursor-pointer"
                >
                  {actionLoading ? "Processing..." : "Confirm Rejection & Refund Funds"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mark as Paid Modal */}
      {markPaidModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-ink">Mark Payout as Paid</h3>
              <button
                type="button"
                onClick={() => setMarkPaidModalOpen(false)}
                className="text-muted hover:text-ink cursor-pointer"
              >
                <Icon name="close" className="size-4" />
              </button>
            </div>

            <p className="text-xs text-muted">
              Record the bank transfer UTR or UPI transaction reference after executing the offline transfer.
              The creator will be notified immediately.
            </p>

            <form onSubmit={handleConfirmMarkPaid} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Transaction Reference ID (UTR)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. UTR123456789012 or UPI Ref 410023456789"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-mono text-ink outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setMarkPaidModalOpen(false)}
                  className="rounded-xl border border-line bg-surface px-4 py-2 text-xs font-semibold text-muted hover:text-ink cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-colors cursor-pointer"
                >
                  {actionLoading ? "Recording..." : "Confirm & Mark as Paid"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
