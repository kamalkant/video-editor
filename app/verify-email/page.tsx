"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const status = searchParams.get("status") || "pending";

  const isSuccess = status === "success";

  return (
    <div className="flex min-h-screen items-center justify-center bg-app p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-surface p-7 shadow-2xl text-center">
        {/* Brand Header */}
        <div className="mb-6">
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
        </div>

        {isSuccess ? (
          <div className="space-y-4 py-3">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
              <svg className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-ink">Email Verified!</h1>
            <p className="text-xs text-muted leading-relaxed">
              Your email address has been verified. Your account is fully active and your local OPFS workspace is ready.
            </p>
            <div className="pt-3">
              <Link
                href="/"
                className="w-full inline-block rounded-xl bg-primary py-3 text-sm font-semibold text-white shadow-md hover:bg-primary-hover transition-all text-center cursor-pointer"
              >
                Launch ViPlay Studio
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-3">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
              <svg className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-ink">Verification Failed</h1>
            <p className="text-xs text-muted leading-relaxed">
              This verification link has expired or has already been used. Please sign in or request a new verification link.
            </p>
            <div className="pt-3 flex flex-col gap-2">
              <Link
                href="/login"
                className="w-full inline-block rounded-xl bg-primary py-2.5 text-sm font-semibold !text-white shadow-md hover:bg-primary-hover transition-all text-center cursor-pointer"
              >
                Go to Sign In
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-app flex items-center justify-center text-muted">Loading…</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
