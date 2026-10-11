"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Reset token is missing from the link. Please check your email link or request a new reset.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to reset password.");
      }

      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-app p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-surface p-7 shadow-2xl">
        {/* Brand Header */}
        <div className="mb-6 text-center">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-2.5">
            <img
              src="/vdo-icon.png"
              alt="ViPlay Studio"
              className="size-10 object-contain drop-shadow-[0_2px_8px_rgba(59,130,246,0.3)]"
            />
            <span className="text-xl font-bold tracking-tight text-ink">
              ViPlay <span className="font-semibold text-muted text-sm">Studio</span>
            </span>
          </Link>
          <h1 className="text-2xl font-bold text-ink">Set new password</h1>
          <p className="mt-1 text-xs text-muted">Create a secure password for your account</p>
        </div>

        {error && (
          <div role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
            {error}
          </div>
        )}

        {success ? (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
              <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-base font-bold text-ink">Password Updated</h2>
            <p className="text-xs text-muted leading-relaxed">
              Your password has been changed successfully. You can now access ViPlay Studio with your new credentials.
            </p>
            <div className="pt-2">
              <Link
                href="/"
                className="w-full inline-block rounded-xl bg-primary py-2.5 text-sm font-semibold !text-white shadow-md hover:bg-primary-hover transition-all text-center cursor-pointer"
              >
                Go to ViPlay Studio
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1" htmlFor="new-password">
                New password (min. 8 characters)
              </label>
              <input
                id="new-password"
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/50 focus:border-primary focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-1" htmlFor="confirm-new-password">
                Confirm new password
              </label>
              <input
                id="confirm-new-password"
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/50 focus:border-primary focus:outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              data-preserve-white style={{ color: "#ffffff" }} className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold !text-white shadow-md hover:bg-primary-hover disabled:opacity-50 transition-all cursor-pointer"
            >
              {loading ? "Updating password…" : "Update Password"}
            </button>
          </form>
        )}

        {/* Footer */}
        <div className="mt-6 border-t border-line pt-4 text-center text-xs text-muted">
          Need help?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Back to Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-app flex items-center justify-center text-muted">Loading…</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
