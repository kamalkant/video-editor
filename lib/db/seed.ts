
export const DEFAULT_NOTIFICATION_RULES = [
  {
    id: "rule_expiring_7d",
    event_type: "subscription_expiring_7d",
    channels: JSON.stringify(["in_app", "email"]),
    template_title: "Your ViPlay Subscription Renews in 7 Days",
    template_body: "Hi {{name}}, your {{plan_name}} plan is scheduled to renew in 7 days on {{renewal_date}}.",
    is_enabled: 1,
  },
  {
    id: "rule_expiring_3d",
    event_type: "subscription_expiring_3d",
    channels: JSON.stringify(["in_app", "email", "push"]),
    template_title: "3 Days Left: Upcoming ViPlay Subscription Renewal",
    template_body: "Friendly reminder: your {{plan_name}} subscription will renew in 3 days. Please ensure your payment method is active.",
    is_enabled: 1,
  },
  {
    id: "rule_expiring_1d",
    event_type: "subscription_expiring_1d",
    channels: JSON.stringify(["in_app", "email", "push"]),
    template_title: "Urgent: Your ViPlay Subscription Renews Tomorrow",
    template_body: "Your subscription renews tomorrow. Keep your proxy editing and AI capabilities uninterrupted.",
    is_enabled: 1,
  },
  {
    id: "rule_payment_failed",
    event_type: "payment_failed",
    channels: JSON.stringify(["in_app", "email"]),
    template_title: "Payment Unsuccessful for ViPlay Subscription",
    template_body: "We were unable to process your subscription renewal of {{amount}}. Please update your billing details.",
    is_enabled: 1,
  },
  {
    id: "rule_payment_succeeded",
    event_type: "payment_succeeded",
    channels: JSON.stringify(["in_app", "email"]),
    template_title: "Payment Received — Thank You!",
    template_body: "Your payment of {{amount}} for {{plan_name}} has been confirmed. Your invoice is ready in your account.",
    is_enabled: 1,
  },
  {
    id: "rule_security_new_device",
    event_type: "security_new_device",
    channels: JSON.stringify(["in_app", "email"]),
    template_title: "New Device Sign-in Detected",
    template_body: "A new session was initiated on {{device_name}} from IP {{ip_address}}. If this was not you, please revoke it immediately.",
    is_enabled: 1,
  },
  {
    id: "rule_referral_signup",
    event_type: "referral_signup",
    channels: JSON.stringify(["in_app", "email"]),
    template_title: "New Referral Signup!",
    template_body: "Someone just joined ViPlay using your referral link.",
    is_enabled: 1,
  },
  {
    id: "rule_referral_reward_pending",
    event_type: "referral_reward_pending",
    channels: JSON.stringify(["in_app", "email"]),
    template_title: "Referral Commission Earned (Pending)",
    template_body: "You earned a referral commission of {{amount}}. It will unlock after the {{holding_days}}-day review period.",
    is_enabled: 1,
  },
  {
    id: "rule_referral_reward_available",
    event_type: "referral_reward_available",
    channels: JSON.stringify(["in_app", "email"]),
    template_title: "Referral Reward Available for Withdrawal!",
    template_body: "Your reward of {{amount}} has unlocked and is now in your available wallet balance.",
    is_enabled: 1,
  },
  {
    id: "rule_payout_requested",
    event_type: "payout_requested",
    channels: JSON.stringify(["in_app", "email"]),
    template_title: "Withdrawal Request Submitted",
    template_body: "Your payout request for {{amount}} has been submitted and is under administrative review.",
    is_enabled: 1,
  },
  {
    id: "rule_payout_paid",
    event_type: "payout_paid",
    channels: JSON.stringify(["in_app", "email"]),
    template_title: "Payout Sent Successfully!",
    template_body: "Your payout of {{amount}} has been processed via {{payout_method}}. Reference ID: {{reference}}.",
    is_enabled: 1,
  },
  {
    id: "rule_payout_rejected",
    event_type: "payout_rejected",
    channels: JSON.stringify(["in_app", "email"]),
    template_title: "Withdrawal Request Status",
    template_body: "Your payout request of {{amount}} could not be approved: {{reason}}. The funds have been returned to your wallet.",
    is_enabled: 1,
  },
];

import { randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { hashPassword } from "@/lib/auth/passwords";
import type { FeatureFlag, UserRole } from "./schema";

export const DEFAULT_FEATURES: Array<{
  tool_id: string;
  title: string;
  description: string;
  enabled_global: number;
  allowed_roles: UserRole[];
}> = [
  {
    tool_id: "library",
    title: "Meme & Video Library",
    description: "Curated Bollywood/Hollywood meme clips and on-demand dynamic search",
    enabled_global: 1,
    allowed_roles: ["super_admin", "admin", "user"],
  },
  {
    tool_id: "elements",
    title: "Elements & Shapes",
    description: "Graphic elements, shapes, stickers, badges, and layout overlays",
    enabled_global: 1,
    allowed_roles: ["super_admin", "admin", "user"],
  },
  {
    tool_id: "effects",
    title: "Visual Effects & Filters",
    description: "Visual filters, glitch effects, color grading, and video effects",
    enabled_global: 1,
    allowed_roles: ["super_admin", "admin", "user"],
  },
  {
    tool_id: "ai",
    title: "AI Studio Suite",
    description: "Gemini scriptwriter, AI Voiceover, image-to-video, and prompt generators",
    enabled_global: 1,
    allowed_roles: ["super_admin", "admin", "user"],
  },
  {
    tool_id: "text",
    title: "Text & Titles",
    description: "Text styling, animated titles, typography presets",
    enabled_global: 1,
    allowed_roles: ["super_admin", "admin", "user"],
  },
  {
    tool_id: "transitions",
    title: "Scene Transitions",
    description: "Crossfade, whip pan, wipe, zoom, and cut transitions between clips",
    enabled_global: 1,
    allowed_roles: ["super_admin", "admin", "user"],
  },
  {
    tool_id: "audio",
    title: "Music & Sound Effects",
    description: "Audio track library, ambient music, and sound design effects",
    enabled_global: 1,
    allowed_roles: ["super_admin", "admin", "user"],
  },
  {
    tool_id: "subtitles",
    title: "Auto Subtitles & Captions",
    description: "Automated speech recognition and synced animated captions",
    enabled_global: 1,
    allowed_roles: ["super_admin", "admin", "user"],
  },
  {
    tool_id: "templates",
    title: "Video Templates",
    description: "Pre-made video design templates, social reels, and ad layouts",
    enabled_global: 1,
    allowed_roles: ["super_admin", "admin", "user"],
  },
  {
    tool_id: "brand",
    title: "Brand Kit",
    description: "Custom organization logos, watermarks, intros, and outros",
    enabled_global: 1,
    allowed_roles: ["super_admin", "admin", "user"],
  },
  {
    tool_id: "background",
    title: "Canvas & Backdrops",
    description: "Canvas aspect ratios, background colors, patterns, and blurs",
    enabled_global: 1,
    allowed_roles: ["super_admin", "admin", "user"],
  },
  {
    tool_id: "export",
    title: "Video Export & Rendering",
    description: "High-resolution video encoding, transparent webm/mp4, and downloads",
    enabled_global: 1,
    allowed_roles: ["super_admin", "admin", "user"],
  },
  {
    tool_id: "motionTrack",
    title: "Smart Motion Tracking",
    description: "Multi-point Lucas-Kanade optical flow tracking with text, sticker, and blur attachments",
    enabled_global: 1,
    allowed_roles: ["super_admin", "admin", "user"],
  },
];

export const DEFAULT_PLANS = [
  {
    id: "plan_free",
    name: "Free Tier",
    slug: "free",
    description: "Ideal for beginners and hobbyists creating quick video clips.",
    interval: "monthly",
    currency: "INR",
    price_amount: 0,
    tax_rate_percent: 18.0,
    trial_days: 0,
    ai_credits_monthly: 10,
    device_limit: 1,
    features: JSON.stringify([
      "720p & 1080p Export",
      "Standard Transitions & Effects",
      "10 AI Studio Credits",
      "1 Active Device Session",
      "Local-first .VDO storage"
    ]),
    is_active: 1,
    is_public: 1,
    version: 1,
    max_export_height: 1080,
    watermark: 1,
  },
  {
    id: "plan_weekly_pro",
    name: "Weekly Pro",
    slug: "weekly-pro",
    description: "Short-term access for fast turnaround projects and event editing.",
    interval: "weekly",
    currency: "INR",
    price_amount: 29900, // ₹299.00
    tax_rate_percent: 18.0,
    trial_days: 3,
    ai_credits_monthly: 60,
    device_limit: 2,
    features: JSON.stringify([
      "Up to 4K 60fps Export",
      "720p Fast Proxy Editing",
      "Full AI Suite (Voiceover & Subtitles)",
      "2 Active Device Sessions",
      "No Watermarks",
      "Priority support"
    ]),
    is_active: 1,
    is_public: 1,
    version: 1,
    max_export_height: 2160,
    watermark: 0,
  },
  {
    id: "plan_monthly_pro",
    name: "Monthly Pro",
    slug: "monthly-pro",
    description: "Our most popular plan for digital creators, YouTubers, and freelancers.",
    interval: "monthly",
    currency: "INR",
    price_amount: 99900, // ₹999.00
    tax_rate_percent: 18.0,
    trial_days: 7,
    ai_credits_monthly: 250,
    device_limit: 2,
    features: JSON.stringify([
      "Up to 4K 60fps Export",
      "Transparent VP9 WebM Alpha Export",
      "Fast Proxy Editing & OPFS Cache",
      "250 AI Studio Credits per month",
      "2 Active Device Sessions",
      "Automatic Audio Metering & Limiting",
      "Custom Brand Kits"
    ]),
    is_active: 1,
    is_public: 1,
    version: 1,
    max_export_height: 2160,
    watermark: 0,
  },
  {
    id: "plan_annual_studio",
    name: "Annual Studio",
    slug: "annual-studio",
    description: "Maximum power and savings for production studios and professional editors.",
    interval: "yearly",
    currency: "INR",
    price_amount: 799900, // ₹7,999.00
    tax_rate_percent: 18.0,
    trial_days: 14,
    ai_credits_monthly: 3500,
    device_limit: 4,
    features: JSON.stringify([
      "Everything in Monthly Pro",
      "4 Active Device Sessions",
      "3,500 AI Studio Credits annually",
      "Parallel-Track Multicam Editing",
      "Priority support & early access",
      "Dedicated Technical Support",
      "Save over 33% annually"
    ]),
    is_active: 1,
    is_public: 1,
    version: 1,
    max_export_height: 2160,
    watermark: 0,
  },
];

export const DEFAULT_COUPONS = [
  {
    id: "cpn_welcome50",
    code: "WELCOME50",
    discount_type: "percentage",
    discount_value: 50.0,
    currency: "INR",
    max_redemptions: 1000,
    scope: "first_payment",
    n_cycles: 1,
    is_active: 1,
  },
  {
    id: "cpn_studio20",
    code: "STUDIO20",
    discount_type: "percentage",
    discount_value: 20.0,
    currency: "INR",
    max_redemptions: 500,
    scope: "every_renewal",
    n_cycles: 1,
    is_active: 1,
  },
];

export const DEFAULT_SETTINGS: Record<string, string> = {
  razorpay_sandbox_mode: "true",
  default_tax_rate_percent: "18.0",
  default_currency: "INR",
  grace_period_days: "5",
  retry_schedule_hours: "24,48,72",
  expiry_notification_days: "7,3,1",
  admin_notification_email: "billing@viplay.in",
  referral_program_enabled: "true",
  referral_reward_type: "percentage",
  referral_reward_value: "20",
  referral_holding_period_days: "14",
  referral_min_withdrawal_threshold: "1000000",
  referral_max_withdrawal_per_request: "5000000",
  referral_min_qualifying_purchase: "0",
  referral_attribution_window_days: "30",
  referral_currency: "INR",
  referral_payout_mode: "manual_and_gateway",
  default_device_limit: "1",
};


/** The first super admin's password when INITIAL_ADMIN_PASSWORD isn't set (development only; must be changed at first sign-in). */
export const SEED_ADMIN_PASSWORD = "Admin@12345";

function adminFromEnv(db: DatabaseSync, now: number) {
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD?.trim();
  if (!email || !password) return;
  const audit = (actorId: string, action: string) =>
    db.prepare("INSERT INTO audit_logs (id, actor_id, action, target, details, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(randomUUID(), actorId, action, "super_admin", JSON.stringify({ email }), now);
  const user = db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").get(email) as { id: string } | undefined;
  if (!user) {
    const { hash, salt } = hashPassword(password);
    const id = randomUUID();
    db.prepare(
      "INSERT INTO users (id, email, name, password_hash, password_salt, role, status, created_at, updated_at, must_change_password) VALUES (?, ?, ?, ?, ?, 'super_admin', 'active', ?, ?, 0)",
    ).run(id, email, "Super Administrator", hash, salt, now, now);
    audit(id, "system.admin_from_env");
    return;
  }
  if (process.env.INITIAL_ADMIN_RESET !== "1") return;
  const { hash, salt } = hashPassword(password);
  db.prepare(
    "UPDATE users SET password_hash = ?, password_salt = ?, role = 'super_admin', status = 'active', must_change_password = 0, updated_at = ? WHERE id = ?",
  ).run(hash, salt, now, user.id);
  // (signed-in devices of that account sign in again, with the new password)
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
  audit(user.id, "system.admin_reset_from_env");
  console.warn(`[ViPlay] ${email}: super admin password set from INITIAL_ADMIN_PASSWORD. Remove INITIAL_ADMIN_RESET now, or it's set again at every start.`);
}

/** `throwaway`: a build worker's in-memory copy (lib/db/index), so its made-up admin password isn't printed. */
export function seedDefaultData(db: DatabaseSync, { throwaway = false } = {}) {
  const now = Date.now();

  // 1. Seed Feature Flags if missing
  const insertFeature = db.prepare(`
    INSERT OR IGNORE INTO feature_flags (tool_id, title, description, enabled_global, allowed_roles, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const f of DEFAULT_FEATURES) {
    insertFeature.run(
      f.tool_id,
      f.title,
      f.description,
      f.enabled_global,
      JSON.stringify(f.allowed_roles),
      now,
      "system"
    );
  }

  // 2. Seed Initial Super Admin if no super_admin exists
  const checkAdmin = db.prepare("SELECT id FROM users WHERE role = 'super_admin' LIMIT 1");
  const existingAdmin = checkAdmin.get() as { id: string } | undefined;
  let adminId = existingAdmin?.id;

  const defaultEmail = process.env.INITIAL_ADMIN_EMAIL || "admin@VDO.local";
  // (no super admin, but that email is already an account: inserting it again crashed every start;
  // adminFromEnv below promotes it when INITIAL_ADMIN_RESET=1)
  const emailTaken = !!db.prepare("SELECT 1 FROM users WHERE email = ? COLLATE NOCASE").get(defaultEmail);

  if (!existingAdmin && !emailTaken) {
    // never the well-known default in production, and never a password in the logs: without
    // INITIAL_ADMIN_PASSWORD the account gets a random one nobody knows (set the env vars and
    // INITIAL_ADMIN_RESET=1 to sign in: adminFromEnv below)
    const envPass = process.env.INITIAL_ADMIN_PASSWORD?.trim();
    const defaultPass = envPass || (process.env.NODE_ENV === "production" ? randomBytes(24).toString("base64url") : SEED_ADMIN_PASSWORD);
    if (!envPass && process.env.NODE_ENV === "production" && !throwaway) {
      console.warn(`[ViPlay] Created super admin ${defaultEmail} without a known password. To sign in, set INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD and INITIAL_ADMIN_RESET=1, restart, sign in, then remove INITIAL_ADMIN_RESET.`);
    }
    const { hash, salt } = hashPassword(defaultPass);
    adminId = randomUUID();

    const insertAdmin = db.prepare(`
      INSERT INTO users (id, email, name, password_hash, password_salt, role, status, created_at, updated_at, must_change_password)
      VALUES (?, ?, ?, ?, ?, 'super_admin', 'active', ?, ?, ?)
    `);

    insertAdmin.run(adminId, defaultEmail.toLowerCase(), "Super Administrator", hash, salt, now, now, envPass ? 0 : 1);

    const insertAudit = db.prepare(`
      INSERT INTO audit_logs (id, actor_id, action, target, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertAudit.run(
      randomUUID(),
      adminId,
      "system.initialized",
      "super_admin",
      JSON.stringify({ email: defaultEmail }),
      now
    );
  }

  // 2b. The super admin named in the env, on a database that already has one (it outlives deploys now):
  // created if missing; with INITIAL_ADMIN_RESET=1 its password is set from the env again (a lost password)
  if (!throwaway) adminFromEnv(db, now);

  // 3. Seed Default Plans
  const insertPlan = db.prepare(`
    INSERT OR IGNORE INTO plans (id, name, slug, description, interval, currency, price_amount, tax_rate_percent, trial_days, ai_credits_monthly, device_limit, features, is_active, is_public, version, created_at, updated_at, max_export_height, watermark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const p of DEFAULT_PLANS) {
    insertPlan.run(
      p.id,
      p.name,
      p.slug,
      p.description,
      p.interval,
      p.currency,
      p.price_amount,
      p.tax_rate_percent,
      p.trial_days,
      p.ai_credits_monthly,
      p.device_limit,
      p.features,
      p.is_active,
      p.is_public,
      p.version,
      now,
      now,
      p.max_export_height,
      p.watermark
    );
  }

  // 4. Seed Default Coupons
  const insertCoupon = db.prepare(`
    INSERT OR IGNORE INTO coupons (id, code, discount_type, discount_value, currency, max_redemptions, redemption_count, scope, n_cycles, valid_from, valid_until, is_active, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, NULL, ?, ?, ?)
  `);

  for (const c of DEFAULT_COUPONS) {
    insertCoupon.run(
      c.id,
      c.code,
      c.discount_type,
      c.discount_value,
      c.currency,
      c.max_redemptions,
      c.scope,
      c.n_cycles,
      now,
      c.is_active,
      adminId || "system",
      now
    );
  }

  // 4b. Plans seeded before the wording fix promised rendering tiers that don't exist: reword just
  // those exact phrases (an admin's own feature text is left alone)
  for (const [from, to] of [
    ["Priority Rendering", "Priority support"],
    ["Highest Priority Cloud Rendering", "Priority support & early access"],
  ] as const) {
    db.prepare("UPDATE plans SET features = replace(features, ?, ?) WHERE features LIKE ?").run(`"${from}"`, `"${to}"`, `%"${from}"%`);
  }

  // 5. Seed Default Admin Settings
  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO admin_settings (key, value, updated_at, updated_by)
    VALUES (?, ?, ?, ?)
  `);

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    insertSetting.run(key, value, now, adminId || "system");
  }

  // 6. Ensure all existing users have an AI credits record
  try {
    const usersWithoutCredits = db.prepare(`
      SELECT id FROM users
      WHERE id NOT IN (SELECT user_id FROM ai_credits)
    `).all() as Array<{ id: string }>;

    const insertCredit = db.prepare(`
      INSERT OR IGNORE INTO ai_credits (user_id, balance, lifetime_granted, lifetime_used, updated_at)
      VALUES (?, 10, 10, 0, ?)
    `);

    for (const u of usersWithoutCredits) {
      insertCredit.run(u.id, now);
    }
  } catch (err) {
    console.error("Failed to seed AI credits for users:", err);
  }

  // 7. Seed Default Notification Rules
  try {
    const insertRule = db.prepare(`
      INSERT OR IGNORE INTO notification_rules (id, event_type, channels, template_title, template_body, is_enabled, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const r of DEFAULT_NOTIFICATION_RULES) {
      insertRule.run(r.id, r.event_type, r.channels, r.template_title, r.template_body, r.is_enabled, now);
    }
  } catch (err) {
    console.error("Failed to seed notification rules:", err);
  }

}
