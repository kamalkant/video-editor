"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { apiMessage } from "./admin-client";

const MIN = 8;

/** Shown instead of the admin panel while the account still uses the seeded (publicly known) password. */
export function ChangePasswordGate({ email }: { email: string }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < MIN) return setError(`The new password needs at least ${MIN} characters.`);
    if (next !== again) return setError("The two new passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(apiMessage(data, "Couldn't change the password."));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change the password.");
      setBusy(false);
    }
  };

  const field = "w-full rounded-lg border border-line bg-app px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none";
  return (
    <div className="flex min-h-screen items-center justify-center bg-app p-4">
      <form method="post" onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-lg">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <Icon name="lock" className="size-6" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-ink">Set a new password first</h1>
          <p className="mt-1 text-sm text-muted">
            {email} still uses the password it was created with, which anyone can look up. Choose your own to open the admin panel.
          </p>
        </div>
        <label className="block space-y-1 text-xs font-semibold text-muted">
          Current password
          <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={field} />
        </label>
        <label className="block space-y-1 text-xs font-semibold text-muted">
          New password (at least {MIN} characters)
          <input type="password" autoComplete="new-password" required minLength={MIN} value={next} onChange={(e) => setNext(e.target.value)} className={field} />
        </label>
        <label className="block space-y-1 text-xs font-semibold text-muted">
          New password again
          <input type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} className={field} />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50">
          {busy ? "Saving…" : "Save and continue"}
        </button>
      </form>
    </div>
  );
}
