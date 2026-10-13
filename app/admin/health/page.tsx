"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";
import { apiMessage } from "../admin-client";
import type { HealthCheck, HealthLevel } from "@/lib/admin/health";

const LEVEL: Record<HealthLevel, { label: string; icon: IconName; tone: string }> = {
  ok: { label: "OK", icon: "check", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  warn: { label: "Check", icon: "info", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  error: { label: "Fix", icon: "alert", tone: "bg-red-500/15 text-red-700 dark:text-red-300" },
};

/** Admin → System health: FFmpeg, database, disk, export queue, AI key, payments, email and security settings. */
export default function AdminHealthPage() {
  const [checks, setChecks] = useState<HealthCheck[] | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const load = async (refresh = false) => {
    setBusy(true);
    await fetchChecks(refresh);
  };

  const fetchChecks = async (refresh = false) => {
    try {
      const res = await fetch(`/api/admin/health${refresh ? "?refresh" : ""}`);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(apiMessage(data, "Couldn't run the checks"));
      setChecks(data.checks);
      setCheckedAt(data.checkedAt);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't run the checks");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void fetchChecks();
  }, []);

  const problems = checks?.filter((c) => c.level !== "ok").length ?? 0;
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">System Health</h1>
          <p className="mt-1 text-sm text-muted">
            {checks ? (problems ? `${problems} thing${problems > 1 ? "s" : ""} to look at.` : "Everything looks good.") : "Running the checks…"}
            {checkedAt && ` Checked ${new Date(checkedAt).toLocaleTimeString()}.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-raised disabled:opacity-50"
        >
          <Icon name="reset" className={`size-3.5 ${busy ? "animate-spin" : ""}`} />
          Check again
        </button>
      </div>

      {error && <p className="rounded-xl bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">{error}</p>}

      {checks && (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
          {[...checks]
            .sort((a, b) => ["error", "warn", "ok"].indexOf(a.level) - ["error", "warn", "ok"].indexOf(b.level))
            .map((c) => {
              const l = LEVEL[c.level];
              return (
                <li key={c.id} className="flex items-start gap-4 px-5 py-4">
                  <span className={`mt-0.5 inline-flex w-16 shrink-0 items-center justify-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${l.tone}`}>
                    <Icon name={l.icon} className="size-3" />
                    {l.label}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink">{c.label}</div>
                    <div className="mt-0.5 break-words text-xs text-muted">{c.detail}</div>
                  </div>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}

