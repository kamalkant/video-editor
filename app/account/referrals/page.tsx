"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { Icon } from "@/components/ui/Icon";
import { AccountHeader } from "@/components/layout/AccountHeader";

export default function UserReferralsPage() {
  const [refData, setRefData] = useState<any>(null);
  const [walletData, setWalletData] = useState<any>(null);
  const [payoutsData, setPayoutsData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"referrals" | "ledger" | "payouts">("referrals");

  // Share & Copy states
  const [copied, setCopied] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  // Withdrawal Modal State
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState<string>("");
  const [selectedBeneficiaryId, setSelectedBeneficiaryId] = useState<string>("");
  const [submittingWithdrawal, setSubmittingWithdrawal] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  // Beneficiary Modal State
  const [addBeneModalOpen, setAddBeneModalOpen] = useState(false);
  const [beneType, setBeneType] = useState<"upi" | "bank_account">("upi");
  const [holderName, setHolderName] = useState("");
  const [upiId, setUpiId] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [bankName, setBankName] = useState("");
  const [submittingBene, setSubmittingBene] = useState(false);
  const [beneError, setBeneError] = useState<string | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchData = async () => {
    try {
      const [refRes, walRes, poutRes] = await Promise.all([
        fetch("/api/user/referrals"),
        fetch("/api/user/wallet"),
        fetch("/api/user/payouts"),
      ]);

      const [ref, wal, pout] = await Promise.all([refRes.json(), walRes.json(), poutRes.json()]);

      if (ref.ok) setRefData(ref);
      if (wal.ok) setWalletData(wal);
      if (pout.ok) setPayoutsData(pout);
    } catch (err) {
      console.error("Referral fetch error", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (refData?.referralLink) {
      QRCode.toDataURL(refData.referralLink, { width: 240, margin: 2 })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error("QR Code generation error", err));
    }
  }, [refData?.referralLink]);

  const handleCopyLink = () => {
    if (!refData?.referralLink) return;
    navigator.clipboard.writeText(refData.referralLink);
    setCopied(true);
    showToast("Referral link copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyCode = () => {
    if (!refData?.code) return;
    navigator.clipboard.writeText(refData.code);
    showToast(`Referral code ${refData.code} copied!`);
  };

  const handleAddBeneficiary = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingBene(true);
    setBeneError(null);

    try {
      const res = await fetch("/api/user/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_beneficiary",
          payoutMethod: beneType,
          accountHolderName: holderName,
          upiId: beneType === "upi" ? upiId : null,
          bankAccountNumber: beneType === "bank_account" ? accountNumber : null,
          bankIfsc: beneType === "bank_account" ? ifscCode : null,
          bankName: beneType === "bank_account" ? bankName : null,
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        setBeneError(data.message || "Failed to add beneficiary");
      } else {
        showToast("Beneficiary added successfully!");
        setAddBeneModalOpen(false);
        setHolderName("");
        setUpiId("");
        setAccountNumber("");
        setIfscCode("");
        setBankName("");
        fetchData();
      }
    } catch (err: any) {
      setBeneError(err?.message || "Failed to add beneficiary");
    } finally {
      setSubmittingBene(false);
    }
  };

  const handleDeleteBeneficiary = async (beneId: string) => {
    if (!confirm("Are you sure you want to remove this beneficiary?")) return;
    try {
      const res = await fetch(`/api/user/payouts?id=${beneId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        showToast("Beneficiary removed");
        fetchData();
      } else {
        alert(data.message || "Cannot delete beneficiary");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRequestWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingWithdrawal(true);
    setWithdrawError(null);

    const amountInPaise = Math.round(parseFloat(withdrawAmount) * 100);

    try {
      const res = await fetch("/api/user/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request_withdrawal",
          amount: amountInPaise,
          beneficiaryId: selectedBeneficiaryId,
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        setWithdrawError(data.message || "Failed to submit withdrawal request");
      } else {
        showToast("Withdrawal request submitted successfully!");
        setWithdrawModalOpen(false);
        setWithdrawAmount("");
        fetchData();
      }
    } catch (err: any) {
      setWithdrawError(err?.message || "Failed to submit request");
    } finally {
      setSubmittingWithdrawal(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-xs font-medium text-muted">Loading Referral & Wallet Suite...</p>
        </div>
      </div>
    );
  }

  const wallet = walletData?.wallet || { availableBalance: 0, pendingBalance: 0, totalEarned: 0, totalWithdrawn: 0 };
  const threshold = walletData?.threshold || {
    minWithdrawalThreshold: 1000000,
    progressPercent: 0,
    amountNeeded: 1000000,
    isEligible: false,
    emailVerified: false,
  };
  const beneficiaries = payoutsData?.beneficiaries || [];
  const payouts = payoutsData?.payouts || [];
  const referrals = refData?.referrals || [];
  const transactions = walletData?.transactions || [];

  const availableInRupees = (wallet.availableBalance / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 });
  const pendingInRupees = (wallet.pendingBalance / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 });
  const earnedInRupees = (wallet.totalEarned / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 });
  const withdrawnInRupees = (wallet.totalWithdrawn / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 });
  const thresholdInRupees = (threshold.minWithdrawalThreshold / 100).toLocaleString("en-IN");
  const neededInRupees = (threshold.amountNeeded / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 });

  return (
    <div className="min-h-screen bg-canvas text-ink pb-20">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-ink px-4 py-2.5 text-xs font-semibold text-canvas shadow-2xl animate-in slide-in-from-bottom-3">
          {toastMessage}
        </div>
      )}

      {/* Top Unified Account Header */}
      <AccountHeader />

      <main className="mx-auto max-w-6xl px-4 sm:px-6 pt-8 space-y-8">
        {/* Referral Program Status Banner if Disabled */}
        {!refData?.programEnabled && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-3">
            <Icon name="info" className="size-5 shrink-0 text-amber-500" />
            <span>The Referral Program is currently paused by administrators. Existing balances can still be withdrawn once threshold is reached.</span>
          </div>
        )}

        {/* Hero Referral Card */}
        <div className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-surface via-surface to-primary/5 p-6 sm:p-8 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-0.5 text-[11px] font-bold text-primary">
                <Icon name="star" className="size-3" />
                <span>Earn {refData?.config?.rewardType === "percentage" ? `${refData?.config?.rewardValue}% Commission` : `₹${(refData?.config?.rewardValue / 100).toFixed(0)} Fixed Reward`}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">
                Invite Creators, Earn Together
              </h1>
              <p className="text-xs sm:text-sm text-muted leading-relaxed">
                Share your referral link with creators, agencies, and video editors. When they purchase any qualifying ViPlay plan, you earn commission credited straight to your withdrawable wallet.
              </p>
            </div>

            {/* Referral Link & Actions Box */}
            <div className="w-full lg:w-auto min-w-[320px] rounded-2xl border border-line bg-canvas/70 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-muted">Your Referral Code</span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="font-mono font-bold text-primary hover:underline cursor-pointer"
                >
                  {refData?.code}
                </button>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-line bg-surface p-1.5">
                <input
                  type="text"
                  readOnly
                  value={refData?.referralLink || ""}
                  className="flex-1 bg-transparent px-2 text-xs font-mono text-ink outline-none select-all truncate"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-primary-hover transition-colors cursor-pointer"
                >
                  <Icon name="copy" className="size-3" />
                  <span>{copied ? "Copied!" : "Copy"}</span>
                </button>
              </div>

              {/* Social Share Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <a
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Create stunning videos with ViPlay Studio! Use my referral link for instant access: ${refData?.referralLink}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-line bg-surface py-1.5 text-xs font-semibold text-muted hover:text-ink hover:bg-raised transition-colors"
                >
                  <span>WhatsApp</span>
                </a>
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Editing videos seamlessly in the browser with @VDOStudio. Join with my link: ${refData?.referralLink}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-line bg-surface py-1.5 text-xs font-semibold text-muted hover:text-ink hover:bg-raised transition-colors"
                >
                  <span>X / Twitter</span>
                </a>
                <button
                  type="button"
                  onClick={() => setQrModalOpen(true)}
                  className="flex items-center justify-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-muted hover:text-ink hover:bg-raised transition-colors cursor-pointer"
                  title="Show QR Code"
                >
                  <Icon name="grid" className="size-3.5" />
                  <span>QR</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-line bg-surface p-4">
            <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">Total Referrals</div>
            <div className="mt-1 text-2xl font-black text-ink">{refData?.signups || 0}</div>
            <div className="mt-1 text-[11px] text-muted">{refData?.clicks || 0} link clicks</div>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-4">
            <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">Conversions</div>
            <div className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {refData?.conversions || 0}
            </div>
            <div className="mt-1 text-[11px] text-muted">{refData?.conversionRate} conversion rate</div>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-4">
            <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">Pending Rewards</div>
            <div className="mt-1 text-2xl font-black text-amber-500">₹{pendingInRupees}</div>
            <div className="mt-1 text-[11px] text-muted">{refData?.config?.holdingPeriodDays}d cooling-off holding</div>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-4">
            <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">Available Balance</div>
            <div className="mt-1 text-2xl font-black text-primary">₹{availableInRupees}</div>
            <div className="mt-1 text-[11px] text-muted">₹{earnedInRupees} lifetime earned</div>
          </div>
        </div>

        {/* Withdrawal Threshold & Payout Request Banner */}
        <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-ink">Payout & Withdrawal Eligibility</h2>
                <span className="rounded-full bg-raised px-2 py-0.5 text-[10px] font-mono font-bold text-muted">
                  Minimum Threshold: ₹{thresholdInRupees}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                {threshold.isEligible
                  ? "🎉 You have reached the minimum withdrawal threshold! You can submit a payout request anytime."
                  : `Earn ₹${neededInRupees} more in unlocked rewards to reach the ₹${thresholdInRupees} withdrawal limit.`}
              </p>
            </div>

            <button
              type="button"
              disabled={!threshold.isEligible}
              onClick={() => {
                if (beneficiaries.length === 0) {
                  setAddBeneModalOpen(true);
                  showToast("Please add your UPI ID or Bank details first.");
                } else {
                  setSelectedBeneficiaryId(beneficiaries[0].id);
                  setWithdrawAmount((wallet.availableBalance / 100).toFixed(0));
                  setWithdrawModalOpen(true);
                }
              }}
              className={`flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold shadow-xs transition-all ${
                threshold.isEligible
                  ? "bg-primary text-white hover:bg-primary-hover cursor-pointer"
                  : "bg-raised text-muted/60 border border-line cursor-not-allowed"
              }`}
            >
              <Icon name="wand" className="size-3.5" />
              <span>Request Withdrawal</span>
            </button>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-muted">
              <span>Current Progress: ₹{availableInRupees}</span>
              <span>{threshold.progressPercent}% of ₹{thresholdInRupees}</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-raised overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500 transition-all duration-500"
                style={{ width: `${threshold.progressPercent}%` }}
              />
            </div>
          </div>

          {!threshold.emailVerified && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] text-amber-700 dark:text-amber-400 flex items-center justify-between">
              <span>⚠️ Email verification is required before initiating any withdrawal request.</span>
              <Link href="/verify-email" className="font-bold underline">
                Verify Email Now
              </Link>
            </div>
          )}
        </div>

        {/* Beneficiaries Card */}
        <div className="rounded-2xl border border-line bg-surface p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-ink">Saved Payout Beneficiaries</h3>
              <p className="text-xs text-muted">Add your verified Bank Account or UPI ID to receive payouts</p>
            </div>
            <button
              type="button"
              onClick={() => setAddBeneModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-raised px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface transition-colors cursor-pointer"
            >
              <Icon name="plus" className="size-3 text-primary" />
              <span>Add Beneficiary</span>
            </button>
          </div>

          {beneficiaries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line p-6 text-center text-xs text-muted">
              No payout beneficiary added yet. Add a UPI ID or Bank Account to prepare for withdrawals.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {beneficiaries.map((b: any) => (
                <div key={b.id} className="relative rounded-xl border border-line bg-canvas/60 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-block rounded bg-primary/10 px-2 py-0.5 text-[10px] font-mono font-bold text-primary uppercase">
                      {b.payout_method === "upi" ? "UPI VPA" : "Bank Transfer"}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteBeneficiary(b.id)}
                      className="text-muted hover:text-red-500 transition-colors cursor-pointer"
                      title="Remove Beneficiary"
                    >
                      <Icon name="close" className="size-3.5" />
                    </button>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-ink truncate">{b.account_holder_name}</div>
                    <div className="text-xs font-mono text-muted truncate">
                      {b.payout_method === "upi" ? b.upi_id : `${b.bank_name || "Bank"}: •••• ${b.bank_account_number?.slice(-4)} (${b.bank_ifsc})`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tabbed History Section */}
        <div className="rounded-2xl border border-line bg-surface overflow-hidden shadow-xs">
          <div className="flex items-center border-b border-line px-4 bg-canvas/30 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("referrals")}
              className={`px-4 py-3 font-semibold border-b-2 transition-all cursor-pointer ${
                activeTab === "referrals"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              Referral Conversions ({referrals.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("ledger")}
              className={`px-4 py-3 font-semibold border-b-2 transition-all cursor-pointer ${
                activeTab === "ledger"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              Wallet Ledger ({transactions.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("payouts")}
              className={`px-4 py-3 font-semibold border-b-2 transition-all cursor-pointer ${
                activeTab === "payouts"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              Payout Requests ({payouts.length})
            </button>
          </div>

          <div className="p-4 sm:p-5">
            {/* Tab 1: Referral Conversions */}
            {activeTab === "referrals" && (
              <div className="overflow-x-auto">
                {referrals.length === 0 ? (
                  <div className="py-12 text-center text-xs text-muted">
                    No referred users yet. Share your referral link to begin earning!
                  </div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-line/60 text-muted font-mono uppercase text-[10px]">
                        <th className="pb-2.5">User</th>
                        <th className="pb-2.5">Attributed</th>
                        <th className="pb-2.5">Status</th>
                        <th className="pb-2.5">Conversion Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/40">
                      {referrals.map((r: any) => (
                        <tr key={r.id} className="hover:bg-raised/40 transition-colors">
                          <td className="py-3 font-semibold text-ink">
                            {r.user_name || "Creator"}
                            {r.user_email && (
                              <span className="block text-[10px] font-normal text-muted truncate max-w-[200px]">
                                {r.user_email}
                              </span>
                            )}
                          </td>
                          <td className="py-3 text-muted">
                            {new Date(r.attributed_at).toLocaleDateString()}
                          </td>
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
                              {r.status === "signed_up" ? "Signed Up" : r.status}
                            </span>
                          </td>
                          <td className="py-3 text-muted">
                            {r.converted_at ? new Date(r.converted_at).toLocaleDateString() : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Tab 2: Wallet Transaction Ledger */}
            {activeTab === "ledger" && (
              <div className="overflow-x-auto">
                {transactions.length === 0 ? (
                  <div className="py-12 text-center text-xs text-muted">No wallet transactions recorded yet.</div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-line/60 text-muted font-mono uppercase text-[10px]">
                        <th className="pb-2.5">Date</th>
                        <th className="pb-2.5">Description</th>
                        <th className="pb-2.5">Type</th>
                        <th className="pb-2.5">Amount</th>
                        <th className="pb-2.5">Balance After</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/40">
                      {transactions.map((tx: any) => {
                        const isCredit = tx.amount > 0;
                        const isZero = tx.amount === 0;
                        return (
                          <tr key={tx.id} className="hover:bg-raised/40 transition-colors">
                            <td className="py-3 text-muted">
                              {new Date(tx.created_at).toLocaleString()}
                            </td>
                            <td className="py-3 font-medium text-ink max-w-xs truncate">{tx.description}</td>
                            <td className="py-3 font-mono text-[10px] uppercase text-muted">{tx.type}</td>
                            <td className="py-3 font-mono font-bold">
                              {isZero ? (
                                <span className="text-muted">₹0.00</span>
                              ) : isCredit ? (
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  +₹{(tx.amount / 100).toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-red-500">-₹{Math.abs(tx.amount / 100).toFixed(2)}</span>
                              )}
                            </td>
                            <td className="py-3 font-mono font-medium text-muted">
                              ₹{(tx.balance_after / 100).toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Tab 3: Payout Requests */}
            {activeTab === "payouts" && (
              <div className="overflow-x-auto">
                {payouts.length === 0 ? (
                  <div className="py-12 text-center text-xs text-muted">No withdrawal requests submitted yet.</div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-line/60 text-muted font-mono uppercase text-[10px]">
                        <th className="pb-2.5">Request ID</th>
                        <th className="pb-2.5">Date</th>
                        <th className="pb-2.5">Destination</th>
                        <th className="pb-2.5">Amount</th>
                        <th className="pb-2.5">Status</th>
                        <th className="pb-2.5">Reference / Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/40">
                      {payouts.map((p: any) => (
                        <tr key={p.id} className="hover:bg-raised/40 transition-colors">
                          <td className="py-3 font-mono text-muted text-[11px]">{p.id}</td>
                          <td className="py-3 text-muted">
                            {new Date(p.requested_at).toLocaleDateString()}
                          </td>
                          <td className="py-3 font-medium text-ink">
                            {p.beneficiary?.payout_method === "upi"
                              ? `UPI: ${p.beneficiary?.upi_id}`
                              : `Bank: •••• ${p.beneficiary?.bank_account_number?.slice(-4)}`}
                          </td>
                          <td className="py-3 font-mono font-bold text-ink">
                            ₹{(p.amount / 100).toFixed(2)}
                          </td>
                          <td className="py-3">
                            <span
                              className={`inline-block rounded px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                                p.status === "paid"
                                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                  : p.status === "rejected"
                                  ? "bg-red-500/15 text-red-600 dark:text-red-400"
                                  : p.status === "processing" || p.status === "approved"
                                  ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                              }`}
                            >
                              {p.status}
                            </span>
                          </td>
                          <td className="py-3 text-[11px]">
                            {p.payout_reference && (
                              <span className="font-mono text-emerald-600 dark:text-emerald-400">
                                Ref: {p.payout_reference}
                              </span>
                            )}
                            {p.rejection_reason && (
                              <span className="text-red-500">Reason: {p.rejection_reason}</span>
                            )}
                            {!p.payout_reference && !p.rejection_reason && <span className="text-muted">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* QR Code Modal */}
      {qrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 text-center space-y-4 shadow-2xl animate-in zoom-in-95">
            <h3 className="text-base font-bold text-ink">Scan to Join via Referral</h3>
            {qrDataUrl && (
              <div className="flex justify-center p-3 bg-white rounded-xl border border-line">
                <img src={qrDataUrl} alt="Referral QR Code" className="size-48 object-contain" />
              </div>
            )}
            <p className="text-xs text-muted font-mono">{refData?.referralLink}</p>
            <button
              type="button"
              onClick={() => setQrModalOpen(false)}
              className="w-full rounded-xl bg-raised py-2 text-xs font-semibold text-ink hover:bg-line transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Add Beneficiary Modal */}
      {addBeneModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-ink">Add Payout Beneficiary</h3>
              <button
                type="button"
                onClick={() => setAddBeneModalOpen(false)}
                className="text-muted hover:text-ink cursor-pointer"
              >
                <Icon name="close" className="size-4" />
              </button>
            </div>

            {beneError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-500">
                {beneError}
              </div>
            )}

            <form onSubmit={handleAddBeneficiary} className="space-y-4">
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-raised border border-line">
                <button
                  type="button"
                  onClick={() => setBeneType("upi")}
                  className={`py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    beneType === "upi" ? "bg-surface text-primary shadow-xs" : "text-muted hover:text-ink"
                  }`}
                >
                  UPI (Instant)
                </button>
                <button
                  type="button"
                  onClick={() => setBeneType("bank_account")}
                  className={`py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    beneType === "bank_account" ? "bg-surface text-primary shadow-xs" : "text-muted hover:text-ink"
                  }`}
                >
                  Bank Transfer (IMPS)
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Account Holder Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={holderName}
                  onChange={(e) => setHolderName(e.target.value)}
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs text-ink outline-none focus:border-primary"
                />
              </div>

              {beneType === "upi" ? (
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">UPI ID (VPA)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. rahul@okhdfcbank or 9876543210@paytm"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-mono text-ink outline-none focus:border-primary"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-muted mb-1">Bank Account Number</label>
                    <input
                      type="text"
                      required
                      placeholder="9 to 18 digits"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-mono text-ink outline-none focus:border-primary"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-muted mb-1">IFSC Code</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. HDFC0001234"
                        value={ifscCode}
                        onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                        className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-mono text-ink uppercase outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted mb-1">Bank Name</label>
                      <input
                        type="text"
                        placeholder="e.g. HDFC Bank"
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs text-ink outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={submittingBene}
                className="w-full rounded-xl bg-primary py-2.5 text-xs font-bold text-white shadow-xs hover:bg-primary-hover transition-colors cursor-pointer"
              >
                {submittingBene ? "Saving..." : "Save Beneficiary"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Withdrawal Request Modal */}
      {withdrawModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-ink">Submit Withdrawal Request</h3>
              <button
                type="button"
                onClick={() => setWithdrawModalOpen(false)}
                className="text-muted hover:text-ink cursor-pointer"
              >
                <Icon name="close" className="size-4" />
              </button>
            </div>

            {withdrawError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-500">
                {withdrawError}
              </div>
            )}

            <form onSubmit={handleRequestWithdrawal} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">
                  Withdrawal Amount (₹) — Max: ₹{availableInRupees}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-muted">₹</span>
                  <input
                    type="number"
                    required
                    min={threshold.minWithdrawalThreshold / 100}
                    max={wallet.availableBalance / 100}
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="w-full rounded-xl border border-line bg-canvas pl-7 pr-3 py-2 text-sm font-bold text-ink outline-none focus:border-primary"
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-muted">
                  <span>Minimum: ₹{thresholdInRupees}</span>
                  <button
                    type="button"
                    onClick={() => setWithdrawAmount((wallet.availableBalance / 100).toFixed(0))}
                    className="text-primary font-bold hover:underline cursor-pointer"
                  >
                    Withdraw All
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Select Beneficiary Account</label>
                <select
                  required
                  value={selectedBeneficiaryId}
                  onChange={(e) => setSelectedBeneficiaryId(e.target.value)}
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs text-ink outline-none focus:border-primary"
                >
                  {beneficiaries.map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.account_holder_name} — {b.payout_method === "upi" ? `UPI: ${b.upi_id}` : `Bank: •••• ${b.bank_account_number?.slice(-4)} (${b.bank_ifsc})`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl border border-line bg-canvas/60 p-3 text-[11px] text-muted space-y-1">
                <div className="font-semibold text-ink">Important Note:</div>
                <p>
                  Requested funds will be locked immediately and removed from your available balance. Payouts are reviewed and dispatched within 24-48 hours. If rejected for any reason, funds are automatically refunded.
                </p>
              </div>

              <button
                type="submit"
                disabled={submittingWithdrawal}
                className="w-full rounded-xl bg-primary py-2.5 text-xs font-bold text-white shadow-xs hover:bg-primary-hover transition-colors cursor-pointer"
              >
                {submittingWithdrawal ? "Submitting Request..." : "Confirm & Request Payout"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
