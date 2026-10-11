"use client";

import { AI_TOOL_LABELS, type AiTool } from "@/lib/ai/costs";

export type Growth = {
  mrr: Array<{ currency: string; mrr: number; payingSubscriptions: number }>;
  daily: Array<{ day: string; signups: number; paid: number }>;
  churn: { ended: number; base: number; rate: number };
  aiUsage: Array<{ tool: string; uses: number; credits: number }>;
};

const money = (v: number, currency: string) =>
  `${currency === "INR" ? "₹" : currency === "USD" ? "$" : `${currency} `}${(v / 100).toLocaleString(currency === "INR" ? "en-IN" : "en-US", { maximumFractionDigits: 0 })}`;
const shortDay = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/** One single-series bar chart of daily counts: thin bars from the baseline, a tooltip on hover/focus. */
function DailyBars({ title, data, value }: { title: string; data: Growth["daily"]; value: (d: Growth["daily"][number]) => number }) {
  const max = Math.max(1, ...data.map(value));
  const total = data.reduce((n, d) => n + value(d), 0);
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex items-baseline justify-between text-xs">
        <span className="font-semibold text-ink">{title}</span>
        <span className="text-muted">{total} in 30 days</span>
      </figcaption>
      <div className="relative flex h-32 items-end gap-[2px] border-b border-line pt-4" role="list" aria-label={`${title}, last 30 days`}>
        {/* recessive gridline at the top value, labelled above it */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-4 border-t border-dashed border-line/60" />
        <span aria-hidden="true" className="absolute left-0 top-0 text-[0.6875rem] leading-4 text-muted">{max}</span>
        {data.map((d) => {
          const v = value(d);
          return (
            <div key={d.day} role="listitem" tabIndex={0} aria-label={`${shortDay(d.day)}: ${v}`} className="group relative flex h-full flex-1 items-end outline-none">
              <div className="w-full rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80 group-focus:opacity-80" style={{ height: v ? `${Math.max(4, (v / max) * 100)}%` : "0" }} />
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1 text-[0.6875rem] text-ink shadow-md group-hover:block group-focus:block">
                {shortDay(d.day)} · <strong>{v}</strong>
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[0.6875rem] text-muted">
        <span>{data[0] ? shortDay(data[0].day) : ""}</span>
        <span>{data.length ? shortDay(data[data.length - 1].day) : ""}</span>
      </div>
    </figure>
  );
}

/** Dashboard "Growth": recurring revenue, the last 30 days of signups and payments, churn, AI tool use. */
export function GrowthSection({ growth }: { growth: Growth }) {
  const primary = growth.mrr[0];
  const paying = growth.mrr.reduce((n, m) => n + m.payingSubscriptions, 0);
  const tile = "rounded-2xl border border-line bg-surface p-5 shadow-sm";
  return (
    <section aria-labelledby="growth-title" className="space-y-4">
      <h2 id="growth-title" className="text-lg font-bold text-ink">
        Growth
      </h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className={tile}>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">MRR</div>
          <div className="mt-2 text-3xl font-black text-ink">{primary ? money(primary.mrr, primary.currency) : "₹0"}</div>
          {growth.mrr.slice(1).map((m) => (
            <div key={m.currency} className="text-sm font-bold text-ink">
              + {money(m.mrr, m.currency)}
            </div>
          ))}
          <p className="mt-1 text-xs text-muted">Paying plans, priced per month (trials not counted)</p>
        </div>
        <div className={tile}>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">ARR</div>
          <div className="mt-2 text-3xl font-black text-ink">{primary ? money(primary.mrr * 12, primary.currency) : "₹0"}</div>
          <p className="mt-1 text-xs text-muted">MRR × 12</p>
        </div>
        <div className={tile}>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">Paying subscribers</div>
          <div className="mt-2 text-3xl font-black text-ink">{paying}</div>
          <p className="mt-1 text-xs text-muted">Active or in grace, on a paid plan</p>
        </div>
        <div className={tile}>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">Churn (30 days)</div>
          <div className="mt-2 text-3xl font-black text-ink">{growth.churn.rate}%</div>
          <p className="mt-1 text-xs text-muted">
            {growth.churn.ended} ended of {growth.churn.base}
          </p>
        </div>
      </div>

      <div className="grid gap-6 rounded-2xl border border-line bg-surface p-5 shadow-sm md:grid-cols-2">
        <DailyBars title="New signups" data={growth.daily} value={(d) => d.signups} />
        <DailyBars title="Paid payments" data={growth.daily} value={(d) => d.paid} />
        <details className="text-xs text-muted md:col-span-2">
          <summary className="cursor-pointer">Show as table</summary>
          <table className="mt-2 w-full text-left">
            <thead>
              <tr className="text-muted">
                <th className="py-1 font-semibold">Day</th>
                <th className="py-1 font-semibold">Signups</th>
                <th className="py-1 font-semibold">Paid payments</th>
              </tr>
            </thead>
            <tbody className="text-ink">
              {growth.daily.map((d) => (
                <tr key={d.day}>
                  <td className="py-0.5">{shortDay(d.day)}</td>
                  <td className="py-0.5 tabular-nums">{d.signups}</td>
                  <td className="py-0.5 tabular-nums">{d.paid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-ink">AI tools used (30 days)</h3>
        {growth.aiUsage.length === 0 ? (
          <p className="mt-2 text-xs text-muted">No platform AI use yet. (Users on their own key aren&apos;t counted.)</p>
        ) : (
          <table className="mt-2 w-full text-left text-xs">
            <thead>
              <tr className="text-muted">
                <th className="py-1 font-semibold">Tool</th>
                <th className="py-1 font-semibold">Uses</th>
                <th className="py-1 font-semibold">Credits</th>
              </tr>
            </thead>
            <tbody className="text-ink">
              {growth.aiUsage.map((u) => (
                <tr key={u.tool} className="border-t border-line/50">
                  <td className="py-1">{AI_TOOL_LABELS[u.tool as AiTool] ?? u.tool}</td>
                  <td className="py-1 tabular-nums">{u.uses}</td>
                  <td className="py-1 tabular-nums">{u.credits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
