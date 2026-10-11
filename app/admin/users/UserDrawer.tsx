"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { apiMessage } from "../admin-client";
import type { UserOverview } from "@/lib/db/user-overview";

const money = (v: number, currency = "INR") =>
  `${currency === "INR" ? "₹" : currency === "USD" ? "$" : `${currency} `}${(v / 100).toLocaleString(currency === "INR" ? "en-IN" : "en-US", { minimumFractionDigits: 2 })}`;
const when = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");
const day = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—");

function Section({ title, children, count }: { title: string; children: React.ReactNode; count?: number }) {
  return (
    <section className="space-y-2 border-t border-line pt-4">
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted">
        {title}
        {count !== undefined && <span className="rounded-full bg-raised px-1.5 text-[0.6875rem] font-semibold text-ink">{count}</span>}
      </h3>
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-xs text-muted">{children}</p>;

/** A side panel with everything about one user (GET /api/admin/users/[id]). */
export function UserDrawer({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [data, setData] = useState<UserOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/users/${userId}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok || !body.ok) throw new Error(apiMessage(body, "Could not load this user."));
        if (live) setData(body.overview);
      })
      .catch((err) => live && setError(err.message));
    return () => {
      live = false;
    };
  }, [userId]);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      before?.focus(); // back to the row that opened it
    };
  }, []);

  const u = data?.user;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-labelledby="user-drawer-title" className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-line bg-surface p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="user-drawer-title" className="truncate text-lg font-bold text-ink">
              {u?.name ?? "User"}
            </h2>
            {u && (
              <p className="truncate text-xs text-muted">
                {u.email ?? u.phone_number ?? "—"} · {u.role.replace("_", " ")} · {u.status} · joined {day(u.created_at)}
              </p>
            )}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-muted hover:bg-raised hover:text-ink">
            <Icon name="close" className="size-4" />
          </button>
        </div>

        {error && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        {!data && !error && <p className="text-sm text-muted">Loading…</p>}

        {data && (
          <div className="space-y-5 text-sm">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-line p-3">
                <div className="text-[0.6875rem] font-semibold uppercase text-muted">Plan</div>
                <div className="mt-1 font-bold text-ink">{data.plan.name}</div>
              </div>
              <div className="rounded-xl border border-line p-3">
                <div className="text-[0.6875rem] font-semibold uppercase text-muted">AI credits</div>
                <div className="mt-1 font-bold text-ink">{data.credits.ledger.balance}</div>
              </div>
              <div className="rounded-xl border border-line p-3">
                <div className="text-[0.6875rem] font-semibold uppercase text-muted">Paid in total</div>
                <div className="mt-1 font-bold text-ink">
                  {money(
                    data.payments.filter((p) => ["captured", "partially_refunded", "refunded"].includes(p.status)).reduce((n, p) => n + p.amount, 0) -
                      data.refunds.filter((r) => r.status !== "failed").reduce((n, r) => n + r.amount, 0),
                  )}
                </div>
              </div>
            </div>

            <Section title="Subscription">
              {data.subscription ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <dt className="text-muted">Status</dt>
                  <dd className="font-semibold text-ink">
                    {data.subscription.status}
                    {data.subscription.cancel_at_period_end ? " (cancels at period end)" : ""}
                  </dd>
                  <dt className="text-muted">Current period</dt>
                  <dd className="text-ink">
                    {day(data.subscription.current_period_start)} → {day(data.subscription.current_period_end)}
                  </dd>
                  {data.subscription.grace_period_end && (
                    <>
                      <dt className="text-muted">Grace ends</dt>
                      <dd className="text-ink">{day(data.subscription.grace_period_end)}</dd>
                    </>
                  )}
                  <dt className="text-muted">Renewals</dt>
                  <dd className="text-ink">{data.subscription.renewal_count}</dd>
                </dl>
              ) : (
                <Empty>Never subscribed (on the free plan).</Empty>
              )}
            </Section>

            <Section title="Payments" count={data.payments.length}>
              {data.payments.length === 0 ? (
                <Empty>No payments.</Empty>
              ) : (
                <ul className="divide-y divide-line/60 text-xs">
                  {data.payments.slice(0, 10).map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="text-muted">{when(p.created_at)}</span>
                      <span className="truncate text-muted">{p.invoice_number ?? p.razorpay_order_id}</span>
                      <span className="font-semibold text-ink">{money(p.amount, p.currency)}</span>
                      <span className="w-24 text-right text-ink">{p.status.replace("_", " ")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {data.refunds.length > 0 && (
              <Section title="Refunds" count={data.refunds.length}>
                <ul className="divide-y divide-line/60 text-xs">
                  {data.refunds.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="text-muted">{when(r.created_at)}</span>
                      <span className="min-w-0 flex-1 truncate text-muted">{r.reason}</span>
                      <span className="font-semibold text-ink">{money(r.amount, r.currency)}</span>
                      <span className="w-20 text-right text-ink">{r.status}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section title="AI credits">
              <p className="text-xs text-muted">
                {data.credits.ledger.lifetime_granted} granted · {data.credits.ledger.lifetime_used} used
              </p>
              {data.credits.recent.length > 0 && (
                <ul className="divide-y divide-line/60 text-xs">
                  {data.credits.recent.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-1">
                      <span className="text-muted">{when(t.created_at)}</span>
                      <span className="min-w-0 flex-1 truncate text-ink">{t.reason}</span>
                      <span className={`tabular-nums font-semibold ${t.amount < 0 ? "text-ink" : "text-emerald-600 dark:text-emerald-400"}`}>
                        {t.amount > 0 ? `+${t.amount}` : t.amount}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Devices" count={data.devices.list.filter((d) => !d.is_revoked).length}>
              <p className="text-xs text-muted">Limit: {data.devices.limit} at a time</p>
              {data.devices.list.length === 0 ? (
                <Empty>No devices signed in.</Empty>
              ) : (
                <ul className="divide-y divide-line/60 text-xs">
                  {data.devices.list.slice(0, 10).map((d) => (
                    <li key={d.id} className={`flex items-center justify-between gap-3 py-1.5 ${d.is_revoked ? "opacity-50" : ""}`}>
                      <span className="min-w-0 flex-1 truncate text-ink">
                        {d.device_name} · {d.browser} on {d.os}
                      </span>
                      <span className="text-muted">{d.is_revoked ? "signed out" : `last seen ${when(d.last_active_at)}`}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Referrals">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <dt className="text-muted">Referred by</dt>
                <dd className="text-ink">
                  {data.referrals.referredBy
                    ? `${data.referrals.referredBy.referrer_name ?? "—"} (${data.referrals.referredBy.referral_code}, ${data.referrals.referredBy.status})`
                    : "—"}
                </dd>
                <dt className="text-muted">People they referred</dt>
                <dd className="text-ink">{data.referrals.total}</dd>
                <dt className="text-muted">Wallet</dt>
                <dd className="text-ink">
                  {money(data.referrals.wallet.available_balance)} available · {money(data.referrals.wallet.pending_balance)} pending ·{" "}
                  {money(data.referrals.wallet.total_withdrawn)} withdrawn
                </dd>
              </dl>
              {data.referrals.recent.length > 0 && (
                <ul className="divide-y divide-line/60 text-xs">
                  {data.referrals.recent.map((r) => (
                    <li key={r.id} className="flex justify-between gap-3 py-1">
                      <span className="truncate text-ink">{r.user_name}</span>
                      <span className="text-muted">
                        {r.status} · {day(r.attributed_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Activity">
              {data.audit.length === 0 ? (
                <Empty>Nothing recorded.</Empty>
              ) : (
                <ul className="divide-y divide-line/60 text-xs">
                  {data.audit.map((a) => (
                    <li key={a.id} className="flex items-baseline justify-between gap-3 py-1">
                      <span className="font-mono text-ink">{a.action}</span>
                      <span className="min-w-0 flex-1 truncate text-right text-muted">
                        {a.actor_id === data.user.id ? "by them" : `by ${a.actor_name ?? a.actor_email ?? "system"}`} · {when(a.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href={`/admin/audit?user=${encodeURIComponent(data.user.id)}`} className="inline-block text-xs font-semibold text-primary hover:underline">
                Full audit log &rarr;
              </Link>
            </Section>
          </div>
        )}
      </aside>
    </div>
  );
}
