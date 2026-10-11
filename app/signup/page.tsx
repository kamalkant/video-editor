"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { cleanReferralCode, safeNextPath } from "@/lib/auth/redirect";
import { useAuth } from "@/lib/auth/AuthContext";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // where to continue after signing up, and who referred this person (from /signup?ref=CODE)
  const next = safeNextPath(searchParams.get("next"));
  const referralCode = cleanReferralCode(searchParams.get("ref"));
  const { user, loading: authLoading } = useAuth();

  // If already logged in, redirect immediately to target destination or /editor
  useEffect(() => {
    if (!authLoading && user) {
      router.replace(next || "/editor");
    }
  }, [user, authLoading, next, router]);

  // count the visit from a referral link once per browser session
  useEffect(() => {
    if (!referralCode) return;
    const key = `VDO:ref-click:${referralCode}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}
    fetch("/api/user/referrals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "record_click", code: referralCode }),
    }).catch(() => {});
  }, [referralCode]);

  // Email state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailSuccess, setEmailSuccess] = useState(false);

  // Common state
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, ...(referralCode ? { referralCode } : {}) }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to create account.");
      }

      setEmailSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create account.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    const qs = new URLSearchParams({ next });
    if (referralCode) qs.set("ref", referralCode);
    window.location.href = `/api/auth/google?${qs}`;
  };

  const loginHref = `/login?${new URLSearchParams({ next })}`;

  if (user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app p-4">
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-surface p-7 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <svg className="size-6 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          </div>
          <h2 className="text-base font-bold text-ink">Already signed in</h2>
          <p className="mt-1 text-xs text-muted">
            You are signed in as <strong className="text-ink">{user.email}</strong>. Taking you to {next ? "your destination" : "Studio"}...
          </p>
          <div className="mt-4">
            <a
              href={next || "/editor"}
              className="inline-block rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover"
            >
              Continue
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-app p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-surface p-7 shadow-2xl transition-all">
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
          <h1 className="text-2xl font-bold text-ink">Create an account</h1>
          <p className="mt-1 text-xs text-muted">
            Join ViPlay Studio with Google or your email
          </p>
        </div>

        {/* Error Callout */}
        {error && (
          <div role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
            {error}
          </div>
        )}

        {emailSuccess ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
              <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-ink">Account created!</h2>
            <p className="text-xs text-muted">
              You are signed in. We have also sent a verification email to <strong className="text-ink">{email}</strong>; verify it when you can.
            </p>
            <div className="pt-2">
              {/* the signup API already started a session, so go straight on */}
              <a
                href={next}
                className="w-full inline-block rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-hover text-center transition-all"
              >
                Start editing
              </a>
            </div>
          </div>
        ) : (
          <>
            {/* GOOGLE SIGN IN (TOP PROMINENT) */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-line bg-canvas py-2.5 px-4 text-sm font-semibold text-ink shadow-xs hover:border-primary/50 hover:bg-raised transition-all active:scale-[0.99] cursor-pointer"
            >
              <svg className="size-5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.04h3.87c2.26-2.09 3.67-5.17 3.67-9.14z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.87-3.04c-1.08.72-2.45 1.16-4.06 1.16-3.13 0-5.78-2.11-6.73-4.96H1.28v3.13C3.25 21.31 7.31 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.27 14.25c-.25-.72-.38-1.49-.38-2.25s.13-1.53.38-2.25V6.62H1.28C.46 8.24 0 10.06 0 12s.46 3.76 1.28 5.38l3.99-3.13z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.69 1.28 6.62l3.99 3.13c.95-2.85 3.6-4.96 6.73-4.96z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>

            {/* DIVIDER */}
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-line/80" />
              </div>
              <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
                <span className="bg-surface px-3 font-semibold text-muted/80">or register with email</span>
              </div>
            </div>

            {/* EMAIL & PASSWORD FORM */}
            <form onSubmit={handleEmailSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-muted mb-1" htmlFor="name-input">
                  Full name
                </label>
                <input
                  id="name-input"
                  type="text"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/50 focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-1" htmlFor="email-input">
                  Email address
                </label>
                <input
                  id="email-input"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/50 focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-1" htmlFor="password-input">
                  Password
                </label>
                <input
                  id="password-input"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/50 focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-1" htmlFor="confirm-password-input">
                  Confirm password
                </label>
                <input
                  id="confirm-password-input"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/50 focus:border-primary focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                data-preserve-white
                style={{ color: "#ffffff" }}
                className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold !text-white shadow-md hover:bg-primary-hover disabled:opacity-50 transition-all cursor-pointer"
              >
                {loading ? "Creating account…" : "Create Account with Email"}
              </button>
            </form>
          </>
        )}

        {/* Footer */}
        <div className="mt-6 border-t border-line pt-4 text-center text-xs text-muted">
          Already have an account?{" "}
          <Link href={loginHref} className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-app flex items-center justify-center text-muted">Loading…</div>}>
      <SignupForm />
    </Suspense>
  );
}
