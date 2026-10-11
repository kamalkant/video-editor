"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to send reset instructions.");
      }

      if (data?.devResetUrl) setDevResetUrl(data.devResetUrl);
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send reset instructions.");
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
          <h1 className="text-2xl font-bold text-ink">Reset password</h1>
          <p className="mt-1 text-xs text-muted">
            Enter your email and we&apos;ll send you instructions to reset your password.
          </p>
        </div>

        {error && (
          <div role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
            {error}
          </div>
        )}

        {submitted ? (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/20 text-primary">
              <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-base font-bold text-ink">Instructions Sent</h2>
            <p className="text-xs text-muted leading-relaxed">
              If an account exists for <span className="font-semibold text-ink">{email}</span>, you will receive an email with a link to reset your password.
            </p>
            {devResetUrl && (
              <div className="mt-4 p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-left text-xs space-y-2">
                <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                  <span>⚡ Local Development Mode</span>
                </div>
                <p className="text-muted text-[11px] leading-relaxed">
                  No email service (Resend / SMTP) is configured in <code className="text-amber-200">.env.local</code>, so the email was printed to your server terminal. You can click below to test the reset link directly:
                </p>
                <a
                  href={devResetUrl}
                  className="inline-block w-full text-center py-2 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 font-medium text-xs transition-colors"
                >
                  Open Password Reset Page →
                </a>
              </div>
            )}
            <div className="pt-2">
              <Link
                href="/login"
                className="w-full inline-block rounded-xl bg-primary py-2.5 text-sm font-semibold !text-white shadow-md hover:bg-primary-hover transition-all text-center cursor-pointer"
              >
                Return to Sign In
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1" htmlFor="reset-email">
                Account email address
              </label>
              <input
                id="reset-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/50 focus:border-primary focus:outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              data-preserve-white style={{ color: "#ffffff" }} className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold !text-white shadow-md hover:bg-primary-hover disabled:opacity-50 transition-all cursor-pointer"
            >
              {loading ? "Sending link…" : "Send Reset Instructions"}
            </button>
          </form>
        )}

        {/* Footer */}
        <div className="mt-6 border-t border-line pt-4 text-center text-xs text-muted">
          Remembered your password?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
