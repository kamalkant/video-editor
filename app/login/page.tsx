"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { DeviceLimitModal } from "@/components/auth/DeviceLimitModal";
import { isAppUrl, safeNextTarget } from "@/lib/auth/redirect";
import { useAuth } from "@/lib/auth/AuthContext";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // a path on this site or another ViPlay app (*.viplay.in): a crafted ?next=https://… link must not redirect elsewhere
  const next = safeNextTarget(searchParams.get("next"), "/");
  const urlError = searchParams.get("error");
  const { user, loading: authLoading, isAdmin } = useAuth();

  // If already logged in, redirect immediately
  useEffect(() => {
    if (!authLoading && user) {
      let target = next || "/";
      if (isAdmin && !searchParams.get("next")) {
        target = "/admin";
      }
      if (isAppUrl(target)) window.location.replace(target);
      else router.replace(target);
    }
  }, [user, authLoading, isAdmin, next, searchParams, router]);

  // Email state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Common state
  const [error, setError] = useState<string | null>(null);
  const [deviceLimitExceeded, setDeviceLimitExceeded] = useState(false);
  const [limitDevices, setLimitDevices] = useState<any[]>([]);
  const [limitAmount, setLimitAmount] = useState<number>(1);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Handle URL errors (e.g. from OAuth callbacks)
  useEffect(() => {
    if (urlError) {
      if (urlError === "invalid_oauth_state") {
        setError("Sign-in session expired. Please try signing in again.");
      } else if (urlError === "linking_requires_verification") {
        const emailParam = searchParams.get("email") || "";
        setEmail(emailParam);
        setError("An unverified account with this email exists. Please sign in with password first to confirm account ownership.");
      } else if (urlError === "account_suspended") {
        setError("Your account has been suspended. Please contact support.");
      } else {
        setError(`Sign-in error: ${urlError}`);
      }
    }
  }, [urlError, searchParams]);

  const handleRevokeDeviceAndLogin = async (deviceId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, revokeDeviceId: deviceId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to revoke device session.");
      }

      setShowLimitModal(false);
      let target = next || "/";
      if ((data.user?.role === "admin" || data.user?.role === "super_admin") && !searchParams.get("next")) {
        target = "/admin";
      }
      window.location.href = target;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to sign in.");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setDeviceLimitExceeded(false);
    setInfoMessage(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data?.code === "DEVICE_LIMIT_EXCEEDED") {
          setDeviceLimitExceeded(true);
          setLimitDevices(data.devices || []);
          setLimitAmount(data.limit || 1);
          setShowLimitModal(true);
        }
        throw new Error(data?.message || "Invalid credentials.");
      }


      let target = next || "/";
      if ((data.user?.role === "admin" || data.user?.role === "super_admin") && !searchParams.get("next")) {
        target = "/admin";
      }

      window.location.href = target;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to sign in.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    window.location.href = `/api/auth/google?next=${encodeURIComponent(next)}`;
  };

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
            Signed in as <strong className="text-ink">{user.email}</strong>. Taking you to your destination...
          </p>
          <div className="mt-4">
            <a
              href={next || "/"}
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
          <h1 className="text-2xl font-bold text-ink">Welcome back</h1>
          <p className="mt-1 text-xs text-muted">
            Sign in with Google or your email credentials
          </p>
        </div>

        {/* Error Callout */}
        {error && (
          <div role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
            <div>{error}</div>
            {deviceLimitExceeded && (
              <div className="mt-2.5 pt-2 border-t border-red-500/20 flex items-center justify-between">
                <span>Revoke an existing session:</span>
                <button
                  type="button"
                  onClick={() => setShowLimitModal(true)}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-red-500/40 hover:bg-red-500/60 text-white font-bold text-xs transition cursor-pointer"
                >
                  Manage Sessions →
                </button>
              </div>
            )}
          </div>
        )}


        {/* Info Callout */}
        {infoMessage && (
          <div role="status" className="mb-4 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-400">
            {infoMessage}
          </div>
        )}

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
            <span className="bg-surface px-3 font-semibold text-muted/80">or sign in with email</span>
          </div>
        </div>

        {/* EMAIL & PASSWORD FORM */}
        <form onSubmit={handleEmailSubmit} className="space-y-3.5">
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
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-muted" htmlFor="password-input">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-xs text-primary hover:underline font-medium"
              >
                Forgot password?
              </Link>
            </div>
            <input
              id="password-input"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
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
            {loading ? "Signing in…" : "Sign in with Email"}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-6 border-t border-line pt-4 text-center text-xs text-muted">
          Don&apos;t have an account?{" "}
          <Link href={`/signup?${new URLSearchParams({ next })}`} className="font-semibold text-primary hover:underline">
            Create account
          </Link>
        </div>
      </div>

      {/* Device Limit Modal */}
      <DeviceLimitModal
        isOpen={showLimitModal}
        onClose={() => setShowLimitModal(false)}
        devices={limitDevices}
        deviceLimit={limitAmount}
        onRevoke={handleRevokeDeviceAndLogin}
      />
    </div>
  );
}


export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-app flex items-center justify-center text-muted">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
