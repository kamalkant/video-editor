import "server-only";
import { statSync, statfsSync } from "node:fs";
import { getCapabilities } from "../ffmpeg/capabilities";
import { getDb, DB_FILE } from "../db/index";
import { STORAGE_ROOT } from "../storage";
import { queueStats } from "../jobs/queue";
import { aiStatus } from "../ai/keys";
import { isSandboxMode, razorpayKeyProblem } from "../payments/razorpay";
import { verifyPassword } from "../auth/passwords";

export type HealthLevel = "ok" | "warn" | "error";
export type HealthCheck = { id: string; label: string; level: HealthLevel; detail: string };

const SEED_PASSWORD = "Admin@12345";
const gb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;
const mb = (bytes: number) => `${(bytes / 1024 ** 2).toFixed(1)} MB`;
const sizeOf = (path: string) => {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
};

/** Super admins still signing in with the password the database was seeded with. */
export function adminsOnSeedPassword(): Array<{ id: string; email: string | null }> {
  const rows = getDb()
    .prepare("SELECT id, email, password_hash, password_salt FROM users WHERE role = 'super_admin' AND status = 'active' AND password_hash IS NOT NULL")
    .all() as Array<{ id: string; email: string | null; password_hash: string; password_salt: string }>;
  return rows.filter((r) => verifyPassword(SEED_PASSWORD, r.password_hash, r.password_salt)).map(({ id, email }) => ({ id, email }));
}

/** Everything the admin "System health" page shows. No secret values: only whether each one is set. */
export async function systemHealth(refresh = false): Promise<{ checks: HealthCheck[]; checkedAt: number }> {
  const checks: HealthCheck[] = [];
  const env = (k: string) => !!process.env[k]?.trim();

  // FFmpeg (exports)
  const caps = await getCapabilities(refresh);
  const missing = caps.checks.filter((c) => !c.ok);
  checks.push({
    id: "ffmpeg",
    label: "FFmpeg",
    level: !caps.ffmpegVersion ? "error" : missing.length ? "warn" : "ok",
    detail: !caps.ffmpegVersion
      ? "Not found: exports won't work. Install FFmpeg or set FFMPEG_PATH."
      : `Version ${caps.ffmpegVersion}` + (missing.length ? `; missing: ${missing.map((c) => `${c.name} (${c.why})`).join("; ")}` : "; every encoder and filter needed is there"),
  });

  // database
  const db = getDb();
  const users = (db.prepare("SELECT COUNT(*) as n FROM users").get() as { n: number }).n;
  const dbBytes = sizeOf(DB_FILE) + sizeOf(`${DB_FILE}-wal`);
  checks.push({ id: "database", label: "Database", level: "ok", detail: `SQLite, ${mb(dbBytes)}, ${users} account${users === 1 ? "" : "s"}` });

  // disk where uploads and exports live
  try {
    const fs = statfsSync(STORAGE_ROOT);
    const free = fs.bavail * fs.bsize;
    const total = fs.blocks * fs.bsize;
    const share = total ? free / total : 1;
    checks.push({
      id: "storage",
      label: "Storage disk",
      level: free < 2 * 1024 ** 3 || share < 0.05 ? "error" : free < 10 * 1024 ** 3 || share < 0.15 ? "warn" : "ok",
      detail: `${gb(free)} free of ${gb(total)}`,
    });
  } catch {
    checks.push({ id: "storage", label: "Storage disk", level: "warn", detail: "Couldn't read the disk's free space." });
  }

  // export queue
  const q = queueStats();
  checks.push({
    id: "queue",
    label: "Export queue",
    level: q.waiting > 20 ? "warn" : "ok",
    detail: `${q.running ? "1 export running" : "Idle"}, ${q.waiting} waiting`,
  });

  // AI
  const gemini = aiStatus().find((p) => p.id === "gemini");
  checks.push({
    id: "gemini",
    label: "Gemini (AI)",
    level: gemini?.hasKey && gemini.enabled ? "ok" : "warn",
    detail: !gemini?.hasKey
      ? "No platform key: AI only works for users who add their own."
      : !gemini.enabled
        ? "Switched off in AI settings."
        : `Key …${gemini.last4} (from ${gemini.source === "env" ? ".env.local" : "AI settings"})`,
  });

  // payments
  const sandbox = isSandboxMode();
  const keyProblem = razorpayKeyProblem();
  const testKey = process.env.RAZORPAY_KEY_ID?.trim().startsWith("rzp_test_");
  checks.push({
    id: "razorpay",
    label: "Razorpay",
    level: sandbox ? "warn" : keyProblem ? "error" : env("RAZORPAY_WEBHOOK_SECRET") ? "ok" : "warn",
    detail: sandbox
      ? `Sandbox mode: checkout skips Razorpay and activates plans without payment.${keyProblem ? ` Before turning it off: ${keyProblem}` : " Keys look right; turn sandbox off in Settings to use them."}`
      : keyProblem
        ? `Checkout is broken: ${keyProblem}`
        : `${testKey ? "Razorpay test mode (no real money)" : "Live mode"}${env("RAZORPAY_WEBHOOK_SECRET") ? "" : "; RAZORPAY_WEBHOOK_SECRET not set, so payments are only confirmed from the browser"}`,
  });

  // email
  const email = env("RESEND_API_KEY") ? "Resend" : env("SMTP_HOST") && env("SMTP_USER") ? "SMTP" : null;
  checks.push({
    id: "email",
    label: "Email",
    level: email ? "ok" : "warn",
    detail: email ? `Sending with ${email}` : "No provider: verification and reset emails are only printed to the server log.",
  });

  // security
  const seeded = adminsOnSeedPassword();
  checks.push({
    id: "admin-password",
    label: "Super admin password",
    level: seeded.length ? "error" : "ok",
    detail: seeded.length ? `${seeded.map((a) => a.email).join(", ")} still use the default password. Change it now.` : "No super admin uses the default password",
  });
  const secret = env("AI_CREDENTIAL_SECRET") || env("ENCRYPTION_SECRET") || env("AUTH_SECRET");
  checks.push({
    id: "encryption",
    label: "Encryption secret",
    level: secret ? "ok" : "error",
    detail: secret ? "Set" : "Not set: saved API keys are encrypted with a built-in key. Set ENCRYPTION_SECRET.",
  });
  checks.push({
    id: "app-url",
    label: "Public address",
    level: env("NEXT_PUBLIC_APP_URL") ? "ok" : "warn",
    detail: env("NEXT_PUBLIC_APP_URL") ? process.env.NEXT_PUBLIC_APP_URL!.trim() : "NEXT_PUBLIC_APP_URL not set: email links and Google sign-in may point to the wrong address.",
  });

  return { checks, checkedAt: Date.now() };
}
