"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { AccountHeader } from "@/components/layout/AccountHeader";

type RazorpayCheckout = new (options: Record<string, unknown>) => { open: () => void; on: (event: string, cb: (resp: { error?: { description?: string } }) => void) => void };

/** Razorpay's checkout script, loaded once when someone actually checks out. */
function loadRazorpayCheckout(): Promise<RazorpayCheckout> {
  const w = window as unknown as { Razorpay?: RazorpayCheckout };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error("Razorpay checkout didn't load")));
    script.onerror = () => reject(new Error("Couldn't reach Razorpay. Check your connection (or an ad blocker) and try again."));
    document.body.appendChild(script);
  });
}

export default function UserBillingPage() {
  const [subData, setSubData] = useState<any>(null);
  const [devicesData, setDevicesData] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [availablePlans, setAvailablePlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Upgrade Modal State
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponValidating, setCouponValidating] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fetchBillingData = async () => {
    try {
      const [subRes, devRes, invRes, plansRes] = await Promise.all([
        fetch("/api/user/subscription"),
        fetch("/api/user/devices"),
        fetch("/api/user/invoices"),
        fetch("/api/plans"), // (the public list: /api/admin/plans is admins-only)
      ]);

      const sub = await subRes.json();
      const dev = await devRes.json();
      const inv = await invRes.json();
      const plans = await plansRes.json();

      if (sub.ok) setSubData(sub);
      if (dev.ok) setDevicesData(dev.devices || []);
      if (inv.ok) setInvoices(inv.payments || []);
      if (plans.ok) {
        // only paid plans can be bought (the free plan needs no checkout)
        const paid = (plans.plans || []).filter((p: any) => p.is_active && p.is_public && p.price_amount > 0);
        setAvailablePlans(paid);
        // arriving from the website's pricing ("?plan=<id>"): open checkout on that plan
        const wanted = new URLSearchParams(window.location.search).get("plan");
        if (wanted && paid.some((p: any) => p.id === wanted)) {
          setSelectedPlanId(wanted);
          setUpgradeModalOpen(true);
          window.history.replaceState(null, "", "/account/billing");
        }
      }
    } catch (err) {
      console.error("Billing fetch error", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBillingData();
  }, []);

  const handleRevokeDevice = async (deviceId: string) => {
    try {
      const res = await fetch("/api/user/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke", deviceId }),
      });
      const data = await res.json();
      if (data.ok) fetchBillingData();
    } catch (err) {
      console.error("Revoke error", err);
    }
  };

  const handleRevokeOtherDevices = async () => {
    try {
      const res = await fetch("/api/user/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke_other" }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatusMessage(data.message);
        fetchBillingData();
      }
    } catch (err) {
      console.error("Revoke others error", err);
    }
  };

  const handleValidateCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponValidating(true);
    setCouponError(null);

    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponCode.trim(), planId: selectedPlanId }),
      });
      const data = await res.json();
      if (data.ok && data.coupon) {
        setAppliedCoupon(data);
      } else {
        setCouponError(data.error || "Invalid coupon code");
        setAppliedCoupon(null);
      }
    } catch (err: any) {
      setCouponError(err.message);
    } finally {
      setCouponValidating(false);
    }
  };

  const handleCheckout = async () => {
    if (!selectedPlanId) return;
    setCheckoutLoading(true);
    setStatusMessage(null);

    try {
      // 1. Create Order
      const orderRes = await fetch("/api/payments/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: selectedPlanId,
          couponCode: appliedCoupon?.coupon?.code || null,
        }),
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderData.message || "Failed to initiate checkout");

      // 2. If Sandbox mode or zero-cost, verify instantly
      if (orderData.isSandbox || orderData.isZeroCost) {
        const verifyRes = await fetch("/api/payments/razorpay/verify-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            razorpay_order_id: orderData.orderId,
            razorpay_payment_id: "pay_sb_" + Date.now(),
            razorpay_signature: "sandbox_verified_signature",
            planId: selectedPlanId,
            couponCode: appliedCoupon?.coupon?.code || null,
          }),
        });

        const verifyData = await verifyRes.json();
        if (!verifyRes.ok) throw new Error(verifyData.message || "Verification failed");

        setStatusMessage("Subscription activated successfully!");
        setUpgradeModalOpen(false);
        fetchBillingData();
        return;
      }

      // 3. The Razorpay checkout popup (live or test keys). The plan is activated only by a
      //    payment Razorpay signed; closing the popup changes nothing.
      const Razorpay = await loadRazorpayCheckout();
      const planName = availablePlans.find((p) => p.id === selectedPlanId)?.name;
      await new Promise<void>((resolve) => {
        const rzp = new Razorpay({
          key: orderData.keyId,
          amount: orderData.amount,
          currency: orderData.currency,
          name: "ViPlay Studio",
          description: `Upgrade to ${planName}`,
          order_id: orderData.orderId,
          theme: { color: "#2563eb" },
          handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
            try {
              const verifyRes = await fetch("/api/payments/razorpay/verify-payment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(response),
              });
              const verifyData = await verifyRes.json();
              if (!verifyRes.ok) throw new Error(verifyData.message || "Verification failed");
              setStatusMessage("Payment confirmed! Your plan is now active.");
              setUpgradeModalOpen(false);
              fetchBillingData();
            } catch (err) {
              setStatusMessage(`Payment received, but activating the plan failed: ${err instanceof Error ? err.message : "unknown error"}. Contact support with your payment ID ${response.razorpay_payment_id}.`);
            } finally {
              resolve();
            }
          },
          modal: {
            ondismiss: () => {
              setStatusMessage("Checkout closed. You haven't been charged.");
              resolve();
            },
          },
        });
        rzp.on("payment.failed", (resp: { error?: { description?: string } }) => {
          setStatusMessage(`Payment failed: ${resp.error?.description || "please try again"}.`);
        });
        rzp.open();
      });
    } catch (err: any) {
      setStatusMessage(`Checkout error: ${err.message}`);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm("Are you sure you want to cancel auto-renewal? You will keep full access until your current period ends.")) return;
    try {
      const res = await fetch("/api/user/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ immediate: false }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatusMessage(data.message);
        fetchBillingData();
      }
    } catch (err) {
      console.error("Cancel error", err);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-app flex items-center justify-center text-sm text-muted">Loading billing profile…</div>;
  }

  const plan = subData?.plan;
  const subscription = subData?.subscription;
  const aiCredits = subData?.aiCredits;

  return (
    <div className="min-h-screen bg-app text-ink">
      <AccountHeader />
      <main className="p-4 sm:p-8 max-w-5xl mx-auto space-y-8">
        <div>
        <h1 className="text-3xl font-black tracking-tight text-ink">My Subscription & Billing</h1>
        <p className="mt-1 text-sm text-muted">
          Manage your membership tier, active devices, receipts, and AI Studio credit balance.
        </p>
      </div>

      {statusMessage && (
        <div role="status" className="rounded-xl border border-primary/30 bg-primary/10 p-3.5 text-xs text-primary flex items-center justify-between">
          <span>{statusMessage}</span>
          <button onClick={() => setStatusMessage(null)} className="text-muted hover:text-ink cursor-pointer">&times;</button>
        </div>
      )}

      {/* Grid: Plan Card & AI Credits */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Active Plan Card */}
        <div className="md:col-span-2 rounded-2xl border border-line bg-surface p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">Current Plan</span>
              <span className={`rounded-md px-2.5 py-0.5 text-[11px] font-bold ${
                subscription?.status === "active" ? "bg-emerald-500/10 text-emerald-400" :
                subscription?.status === "grace_period" ? "bg-amber-500/15 text-amber-400" :
                "bg-primary/10 text-primary"
              }`}>
                {(subscription?.status || "Free").toUpperCase()}
              </span>
            </div>

            <h2 className="mt-3 text-2xl font-black text-ink">{plan?.name || "Free Tier"}</h2>
            <p className="mt-1 text-xs text-muted">{plan?.description}</p>

            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-black text-ink">
                {plan?.currency === "INR" ? "₹" : "$"}{(plan?.price_amount / 100).toFixed(0)}
              </span>
              <span className="text-xs text-muted">/{plan?.interval}</span>
            </div>

            {subscription && (
              <div className="mt-4 space-y-1.5 border-t border-line/60 pt-3 text-xs text-muted">
                <div className="flex items-center justify-between">
                  <span>Current Period Ends:</span>
                  <strong className="text-ink">{new Date(subscription.current_period_end).toLocaleDateString()}</strong>
                </div>
                {subscription.grace_period_end && (
                  <div className="flex items-center justify-between text-amber-500 font-semibold">
                    <span>Grace Period Ends:</span>
                    <span>{new Date(subscription.grace_period_end).toLocaleDateString()}</span>
                  </div>
                )}
                {subscription.cancel_at_period_end === 1 && (
                  <div className="text-[11px] text-amber-500 font-medium">
                    &bull; Scheduled to cancel on {new Date(subscription.current_period_end).toLocaleDateString()}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-6 flex items-center gap-3 border-t border-line pt-4">
            <button
              onClick={() => { setSelectedPlanId(availablePlans[0]?.id || ""); setUpgradeModalOpen(true); }}
              className="flex-1 rounded-xl bg-primary py-2.5 text-xs font-semibold text-white shadow-md hover:bg-primary-hover transition-all cursor-pointer"
            >
              {subscription ? "Change Plan" : "Upgrade to Pro"}
            </button>
            {subscription && subscription.cancel_at_period_end === 0 && (
              <button
                onClick={handleCancelSubscription}
                className="rounded-xl border border-line px-3.5 py-2.5 text-xs font-semibold text-muted hover:text-red-400 hover:border-red-500/30 transition-colors cursor-pointer"
              >
                Cancel Renewal
              </button>
            )}
          </div>
        </div>

        {/* AI Studio Credits Card */}
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-muted">
              <span className="text-xs font-bold uppercase tracking-wider">AI Studio Credits</span>
              <Icon name="ai" className="size-4 text-purple-500" />
            </div>

            <div className="mt-4 text-4xl font-black text-ink">{aiCredits?.balance ?? 10}</div>
            <p className="mt-1 text-xs text-muted">Credits available for AI Voiceovers, script generation, and subtitles.</p>

            <div className="mt-4 space-y-1.5 border-t border-line/60 pt-3 text-xs text-muted">
              <div className="flex items-center justify-between">
                <span>Lifetime Granted:</span>
                <strong className="text-ink">{aiCredits?.lifetime_granted ?? 10}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span>Lifetime Used:</span>
                <strong className="text-ink">{aiCredits?.lifetime_used ?? 0}</strong>
              </div>
            </div>
          </div>

          <div className="mt-6 border-t border-line pt-4">
            <span className="text-[11px] text-muted">Credits renew automatically each billing cycle.</span>
          </div>
        </div>
      </div>

      {/* Active Device Sessions Card */}
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-line pb-3">
          <div>
            <h2 className="text-base font-bold text-ink">Active Devices & Concurrent Sessions</h2>
            <p className="text-xs text-muted">
              Your plan allows up to <strong className="text-ink">{plan?.device_limit ?? 1} concurrent device(s)</strong>.
            </p>
          </div>

          {devicesData.length > 1 && (
            <button
              onClick={handleRevokeOtherDevices}
              className="rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs font-semibold text-muted hover:text-red-400 hover:border-red-500/30 transition-colors cursor-pointer"
            >
              Log Out All Other Devices
            </button>
          )}
        </div>

        <div className="divide-y divide-line/60">
          {devicesData.map((d: any) => (
            <div key={d.id} className="flex items-center justify-between py-3 text-xs">
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-lg bg-raised flex items-center justify-center text-muted">
                  <Icon name={d.device_type === "mobile" ? "phone" : "laptop"} className="size-4 text-primary" />
                </div>
                <div>
                  <div className="font-semibold text-ink flex items-center gap-2">
                    <span>{d.device_name}</span>
                    {d.session_token === subData?.currentToken && (
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.2 text-[9px] font-bold text-emerald-400">THIS DEVICE</span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted">
                    {d.os} &bull; {d.browser} &bull; Active: {new Date(d.last_active_at).toLocaleString()}
                  </div>
                </div>
              </div>

              {d.session_token !== subData?.currentToken && (
                <button
                  onClick={() => handleRevokeDevice(d.id)}
                  className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Receipts & Payment History Table */}
      <div className="rounded-2xl border border-line bg-surface overflow-hidden shadow-sm">
        <div className="border-b border-line px-6 py-4">
          <h2 className="text-base font-bold text-ink">Payment History & Receipts</h2>
          <p className="text-xs text-muted">Download itemized tax invoices for your records.</p>
        </div>

        {invoices.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted">No past payments recorded.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line bg-raised/40 text-muted uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Invoice</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {invoices.map((inv: any) => (
                  <tr key={inv.id} className="hover:bg-raised/30 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-ink">
                      {inv.invoice_number || `INV-${inv.id.slice(0, 8)}`}
                    </td>
                    <td className="py-3.5 px-4 text-muted">
                      {new Date(inv.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-ink">
                      {inv.currency === "INR" ? "₹" : "$"}{(inv.amount / 100).toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                        inv.status === "captured" ? "bg-emerald-500/10 text-emerald-400" : "bg-purple-500/10 text-purple-400"
                      }`}>
                        {inv.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <a
                        href={`/api/user/invoices?id=${inv.id}&download=true`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-line bg-canvas px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-raised transition-colors"
                      >
                        <Icon name="download" className="size-3" />
                        <span>Receipt</span>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upgrade / Checkout Modal */}
      {upgradeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h2 className="text-base font-bold text-ink">Select a Plan</h2>
              <button onClick={() => setUpgradeModalOpen(false)} className="text-muted hover:text-ink cursor-pointer">&times;</button>
            </div>

            <div className="space-y-3">
              {availablePlans.length === 0 && (
                <p className="rounded-xl border border-line bg-canvas p-3.5 text-xs text-muted">
                  No plans can be bought right now. Please try again later or contact support.
                </p>
              )}
              {availablePlans.map((p) => {
                const isSelected = selectedPlanId === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPlanId(p.id)}
                    className={`flex items-center justify-between rounded-xl border p-3.5 cursor-pointer transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 ring-1 ring-primary"
                        : "border-line bg-canvas hover:border-primary/40 hover:bg-raised/40"
                    }`}
                  >
                    <div>
                      <div className="font-bold text-ink text-sm">{p.name}</div>
                      <div className="text-xs text-muted">{p.device_limit} Devices &bull; {p.ai_credits_monthly} AI Credits</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-ink text-base">
                        {p.currency === "INR" ? "₹" : "$"}{(p.price_amount / 100).toFixed(0)}
                      </div>
                      <span className="text-[11px] text-muted">/{p.interval}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Coupon Code Input */}
            <div className="border-t border-line pt-3">
              <label className="block text-xs font-medium text-muted mb-1">Have a coupon code?</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. WELCOME50"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  className="flex-1 rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs text-ink uppercase font-mono focus:border-primary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleValidateCoupon}
                  disabled={couponValidating}
                  className="rounded-xl border border-line bg-raised px-3 py-1.5 text-xs font-semibold text-ink hover:bg-raised/80 transition-colors cursor-pointer"
                >
                  {couponValidating ? "Checking…" : "Apply"}
                </button>
              </div>

              {appliedCoupon && (
                <div className="mt-1.5 text-xs text-emerald-400 font-medium">
                  &check; Coupon applied! Discount: ₹{((appliedCoupon.discountAmount || 0) / 100).toFixed(2)} off.
                </div>
              )}
              {couponError && (
                <div className="mt-1.5 text-xs text-red-400">{couponError}</div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
              <button
                type="button"
                onClick={() => setUpgradeModalOpen(false)}
                className="rounded-xl border border-line px-4 py-2 text-xs font-semibold text-muted hover:bg-raised transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCheckout}
                disabled={checkoutLoading || !selectedPlanId}
                className="rounded-xl bg-primary px-6 py-2 text-xs font-semibold text-white shadow-md hover:bg-primary-hover disabled:opacity-50 transition-all cursor-pointer"
              >
                {checkoutLoading ? "Processing…" : "Continue to Checkout"}
              </button>
            </div>
          </div>
        </div>
      )}
      </main>
    </div>
  );
}
