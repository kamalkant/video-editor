export type UserRole = "super_admin" | "admin" | "user";
export type UserStatus = "active" | "suspended" | "deleted";

export type User = {
  id: string;
  email: string | null;
  name: string;
  password_hash: string | null;
  password_salt: string | null;
  role: UserRole;
  status: UserStatus;
  created_at: number;
  updated_at: number;
  last_login_at: number | null;
  email_verified: number; // 0 or unix ms
  phone_number: string | null;
  phone_verified: number; // 0 or unix ms
  /** 1: signed in with a password someone else knows (the seeded admin's); the admin panel stays locked until it's changed */
  must_change_password: number;
};

export type SafeUser = Omit<User, "password_hash" | "password_salt">;

export type Session = {
  id: string;
  user_id: string;
  token: string;
  expires_at: number;
  created_at: number;
};

export type UserIdentity = {
  id: string;
  user_id: string;
  provider: "google" | "email" | "phone";
  provider_user_id: string;
  created_at: number;
};

export type AuthToken = {
  id: string;
  user_id: string;
  token_hash: string;
  type: "email_verify" | "password_reset";
  expires_at: number;
  created_at: number;
};

export type PhoneOtp = {
  id: string;
  phone_number: string;
  otp_hash: string;
  attempts: number;
  expires_at: number;
  created_at: number;
};

export type FeatureFlag = {
  tool_id: string;
  title: string;
  description: string;
  enabled_global: number; // 1 or 0
  allowed_roles: string; // JSON string of UserRole[] e.g. "["super_admin","admin","user"]"
  updated_at: number;
  updated_by: string | null;
};

export type ParsedFeatureFlag = Omit<FeatureFlag, "allowed_roles" | "enabled_global"> & {
  enabled_global: boolean;
  allowed_roles: UserRole[];
};

export type UserFeatureOverride = {
  user_id: string;
  tool_id: string;
  enabled: number; // 1 or 0
  updated_at: number;
  updated_by: string | null;
};

export type AuditLog = {
  id: string;
  actor_id: string | null;
  action: string;
  target: string | null;
  details: string | null;
  created_at: number;
};

// ==================== BILLING, PLANS & ADMIN SCHEMAS ====================

export type PlanInterval = "weekly" | "monthly" | "yearly";

export type Plan = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  interval: PlanInterval;
  currency: string; // "INR" | "USD"
  price_amount: number; // in smallest currency unit (e.g. paise / cents)
  tax_rate_percent: number; // e.g. 18.0
  trial_days: number;
  ai_credits_monthly: number;
  device_limit: number;
  features: string; // JSON array of string feature slugs/labels
  is_active: number; // 1 or 0
  is_public: number; // 1 or 0
  version: number;
  created_at: number;
  updated_at: number;
  /** The biggest export allowed, by the short side (1080 = Full HD, 2160 = 4K). */
  max_export_height: number;
  /** 1: exports carry a small ViPlay logo (the Free plan). */
  watermark: number;
};

export type ParsedPlan = Omit<Plan, "features" | "is_active" | "is_public" | "watermark" | "max_export_height"> & {
  features: string[];
  is_active: boolean;
  is_public: boolean;
  max_export_height: number;
  watermark: boolean;
};

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "grace_period"
  | "cancelled"
  | "expired";

export type Subscription = {
  id: string;
  user_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: number; // 1 or 0
  cancelled_at: number | null;
  grace_period_end: number | null;
  razorpay_subscription_id: string | null;
  razorpay_customer_id: string | null;
  applied_coupon_id: string | null;
  renewal_count: number;
  created_at: number;
  updated_at: number;
};

export type PaymentStatus = "created" | "authorized" | "captured" | "partially_refunded" | "refunded" | "failed";

export type Payment = {
  id: string;
  user_id: string;
  subscription_id: string | null;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  error_code: string | null;
  error_description: string | null;
  invoice_number: string | null;
  idempotency_key: string | null;
  created_at: number;
  updated_at: number;
  /** The plan (and coupon) this order was created for: what a verified payment activates (never the browser's say). */
  plan_id: string | null;
  coupon_id: string | null;
};

export type Refund = {
  id: string;
  payment_id: string;
  user_id: string;
  razorpay_refund_id: string | null;
  amount: number;
  currency: string;
  reason: string;
  status: "pending" | "processed" | "failed";
  created_by: string | null;
  created_at: number;
};

export type CouponDiscountType = "percentage" | "fixed";
export type CouponScope = "first_payment" | "first_n_cycles" | "every_renewal";

export type Coupon = {
  id: string;
  code: string;
  discount_type: CouponDiscountType;
  discount_value: number; // percentage (e.g. 20) or fixed amount in lowest unit
  currency: string;
  max_redemptions: number | null;
  redemption_count: number;
  scope: CouponScope;
  n_cycles: number;
  valid_from: number;
  valid_until: number | null;
  is_active: number; // 1 or 0
  created_by: string | null;
  created_at: number;
};

export type CouponRedemption = {
  id: string;
  coupon_id: string;
  user_id: string;
  subscription_id: string | null;
  payment_id: string | null;
  discount_amount: number;
  redeemed_at: number;
};

export type DeviceType = "desktop" | "mobile" | "tablet";

export type Device = {
  id: string;
  user_id: string;
  session_token: string;
  device_name: string;
  device_type: DeviceType;
  os: string;
  browser: string;
  ip_address: string | null;
  last_active_at: number;
  is_revoked: number; // 1 or 0
  created_at: number;
};

export type AICreditLedger = {
  user_id: string;
  balance: number;
  lifetime_granted: number;
  lifetime_used: number;
  updated_at: number;
};

export type AICreditTransaction = {
  id: string;
  user_id: string;
  amount: number; // positive = grant, negative = consumed
  reason: string;
  reference_id: string | null;
  created_at: number;
};

export type BulkJobType =
  | "ai_credit_grant"
  | "plan_migration"
  | "force_logout"
  | "notification_broadcast"
  | "user_status"
  | "device_revoke_all"
  | "user_device_override"
  | "ai_assignment_grant"
  | "ai_assignment_revoke";

export type BulkJobStatus = "pending" | "running" | "completed" | "failed" | "paused";

export type BulkJob = {
  id: string;
  type: BulkJobType;
  status: BulkJobStatus;
  total_items: number;
  processed_items: number;
  successful_items: number;
  failed_items: number;
  batch_size: number;
  payload: string; // JSON
  results: string | null; // JSON
  error_log: string | null; // JSON
  created_by: string | null;
  created_at: number;
  updated_at: number;
};

export type Notification = {
  id: string;
  user_id: string | null; // null = broadcast to all
  title: string;
  message: string;
  type: "billing" | "security" | "system" | "promotion";
  is_read: number; // 1 or 0
  created_at: number;
};

export type EmailLog = {
  id: string;
  to_email: string;
  subject: string;
  template_name: string;
  status: "sent" | "failed" | "simulated";
  error_message: string | null;
  sent_at: number;
};

export type AdminSetting = {
  key: string;
  value: string;
  updated_at: number;
  updated_by: string | null;
};


export type CredentialPolicy = "USER_FIRST" | "ADMIN_FIRST" | "USER_KEY_ONLY" | "ADMIN_ASSIGNED_ONLY";

export type NotificationCampaign = {
  id: string;
  name: string;
  title: string;
  message: string;
  image_url: string | null;
  cta_label: string | null;
  cta_url: string | null;
  channels: string; // JSON: ["in_app", "email", "push"]
  priority: "normal" | "high" | "urgent";
  audience_filter: string; // JSON
  status: "draft" | "scheduled" | "sending" | "completed" | "cancelled";
  total_recipients: number;
  delivered_recipients: number;
  failed_recipients: number;
  scheduled_for: number | null;
  sent_at: number | null;
  created_by: string | null;
  created_at: number;
  updated_at: number;
};

export type CampaignRecipient = {
  id: string;
  campaign_id: string;
  user_id: string | null;
  email: string | null;
  channels_sent: string; // JSON
  status: "pending" | "delivered" | "failed";
  error_message: string | null;
  sent_at: number | null;
};

export type NotificationRule = {
  id: string;
  event_type: string;
  channels: string; // JSON: ["in_app", "email"]
  template_title: string;
  template_body: string;
  is_enabled: number; // 0 or 1
  updated_at: number;
};

export type UserApiCredential = {
  id: string;
  user_id: string;
  provider: string;
  encrypted_key: string;
  key_last4: string;
  is_enabled: number; // 0 or 1
  created_at: number;
  updated_at: number;
};

export type AdminApiPool = {
  id: string;
  name: string;
  provider: string;
  encrypted_key: string;
  key_last4: string;
  allowed_models: string; // JSON array
  max_monthly_spend_cents: number;
  is_active: number; // 0 or 1
  created_by: string | null;
  created_at: number;
  updated_at: number;
};

export type UserApiAssignment = {
  id: string;
  pool_id: string;
  user_id: string;
  policy: CredentialPolicy;
  status: "active" | "suspended" | "revoked" | "expired";
  expires_at: number | null;
  assigned_by: string | null;
  created_at: number;
  updated_at: number;
};

export type UserDeviceOverride = {
  user_id: string;
  max_devices_override: number;
  reason: string | null;
  updated_by: string | null;
  updated_at: number;
};

// ==================== REFERRALS, WALLET & PAYOUT SCHEMAS ====================

export type ReferralCode = {
  id: string;
  user_id: string;
  code: string;
  clicks: number;
  signups: number;
  conversions: number;
  created_at: number;
  updated_at: number;
};

export type ReferralStatus = "signed_up" | "converted" | "expired" | "rejected_fraud";

export type Referral = {
  id: string;
  referrer_id: string;
  referred_user_id: string;
  referral_code: string;
  status: ReferralStatus;
  first_purchase_payment_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  attributed_at: number;
  converted_at: number | null;
};

export type ReferralRewardStatus = "pending" | "available" | "cancelled" | "reversed";
export type RewardType = "percentage" | "fixed";

export type ReferralReward = {
  id: string;
  referrer_id: string;
  referred_user_id: string;
  payment_id: string;
  amount: number; // in smallest currency unit e.g. paise
  currency: string;
  reward_type: RewardType;
  reward_value: number; // e.g. 20 (percent) or 50000 (paise)
  status: ReferralRewardStatus;
  holding_period_days: number;
  unlock_at: number; // unix timestamp in ms
  matured_at: number | null;
  cancellation_reason: string | null;
  created_at: number;
  updated_at: number;
};

export type Wallet = {
  user_id: string;
  currency: string;
  available_balance: number; // in paise
  pending_balance: number; // in paise
  total_earned: number; // in paise
  total_withdrawn: number; // in paise
  updated_at: number;
};

export type WalletTransactionType =
  | "reward_pending"
  | "reward_matured"
  | "withdrawal_locked"
  | "withdrawal_paid"
  | "withdrawal_refunded"
  | "reward_reversal"
  | "admin_adjustment";

export type WalletTransactionStatus = "pending" | "completed" | "cancelled" | "reversed";

export type WalletTransaction = {
  id: string;
  wallet_user_id: string;
  amount: number; // positive = credit, negative = debit
  type: WalletTransactionType;
  status: WalletTransactionStatus;
  reference_id: string | null;
  description: string;
  balance_after: number;
  created_at: number;
};

export type PayoutMethod = "upi" | "bank_account";

export type PayoutBeneficiary = {
  id: string;
  user_id: string;
  payout_method: PayoutMethod;
  account_holder_name: string;
  upi_id: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_name: string | null;
  is_default: number; // 1 or 0
  is_verified: number; // 1 or 0
  created_at: number;
  updated_at: number;
};

export type PayoutStatus =
  | "requested"
  | "under_review"
  | "approved"
  | "processing"
  | "paid"
  | "rejected"
  | "failed";

export type PayoutRequest = {
  id: string;
  user_id: string;
  beneficiary_id: string;
  amount: number; // in paise
  currency: string;
  status: PayoutStatus;
  rejection_reason: string | null;
  failure_reason: string | null;
  payout_reference: string | null;
  payout_provider: string; // 'manual' | 'razorpayx'
  provider_payout_id: string | null;
  requested_at: number;
  reviewed_by: string | null;
  reviewed_at: number | null;
  processed_at: number | null;
  paid_at: number | null;
  updated_at: number;
};

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT,
  password_salt TEXT,
  role TEXT NOT NULL DEFAULT user,
  status TEXT NOT NULL DEFAULT active,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER,
  email_verified INTEGER NOT NULL DEFAULT 0,
  phone_number TEXT UNIQUE,
  phone_verified INTEGER NOT NULL DEFAULT 0,
  must_change_password INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS user_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_user_identities_provider ON user_identities(provider, provider_user_id);

CREATE TABLE IF NOT EXISTS auth_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id);

CREATE TABLE IF NOT EXISTS phone_otps (
  id TEXT PRIMARY KEY,
  phone_number TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_phone_otps_phone ON phone_otps(phone_number);

CREATE TABLE IF NOT EXISTS feature_flags (
  tool_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  enabled_global INTEGER NOT NULL DEFAULT 1,
  allowed_roles TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS user_feature_overrides (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT,
  PRIMARY KEY (user_id, tool_id)
);

CREATE INDEX IF NOT EXISTS idx_user_feature_overrides_user ON user_feature_overrides(user_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target TEXT,
  details TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- ==================== NEW ADMIN & BILLING TABLES ====================

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  interval TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT INR,
  price_amount INTEGER NOT NULL,
  tax_rate_percent REAL NOT NULL DEFAULT 18.0,
  trial_days INTEGER NOT NULL DEFAULT 0,
  ai_credits_monthly INTEGER NOT NULL DEFAULT 50,
  device_limit INTEGER NOT NULL DEFAULT 2,
  features TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_public INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  max_export_height INTEGER NOT NULL DEFAULT 2160,
  watermark INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_plans_slug ON plans(slug);

CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL COLLATE NOCASE,
  discount_type TEXT NOT NULL,
  discount_value REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT INR,
  max_redemptions INTEGER,
  redemption_count INTEGER NOT NULL DEFAULT 0,
  scope TEXT NOT NULL DEFAULT first_payment,
  n_cycles INTEGER DEFAULT 1,
  valid_from INTEGER NOT NULL,
  valid_until INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL,
  current_period_start INTEGER NOT NULL,
  current_period_end INTEGER NOT NULL,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  cancelled_at INTEGER,
  grace_period_end INTEGER,
  razorpay_subscription_id TEXT,
  razorpay_customer_id TEXT,
  applied_coupon_id TEXT REFERENCES coupons(id),
  renewal_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subs_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subs_status ON subscriptions(status);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id TEXT REFERENCES subscriptions(id),
  razorpay_order_id TEXT UNIQUE NOT NULL,
  razorpay_payment_id TEXT UNIQUE,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT INR,
  status TEXT NOT NULL,
  error_code TEXT,
  error_description TEXT,
  invoice_number TEXT UNIQUE,
  idempotency_key TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  plan_id TEXT,
  coupon_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(razorpay_order_id);

CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  razorpay_refund_id TEXT UNIQUE,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT processed,
  created_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_refunds_payment ON refunds(payment_id);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id TEXT PRIMARY KEY,
  coupon_id TEXT NOT NULL REFERENCES coupons(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  subscription_id TEXT REFERENCES subscriptions(id),
  payment_id TEXT REFERENCES payments(id),
  discount_amount INTEGER NOT NULL,
  redeemed_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user ON coupon_redemptions(user_id);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token TEXT UNIQUE NOT NULL,
  device_name TEXT NOT NULL,
  device_type TEXT NOT NULL,
  os TEXT NOT NULL,
  browser TEXT NOT NULL,
  ip_address TEXT,
  last_active_at INTEGER NOT NULL,
  is_revoked INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_token ON devices(session_token);

CREATE TABLE IF NOT EXISTS ai_credits (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 10,
  lifetime_granted INTEGER NOT NULL DEFAULT 10,
  lifetime_used INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_credit_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  reference_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_tx_user ON ai_credit_transactions(user_id);

CREATE TABLE IF NOT EXISTS bulk_jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  total_items INTEGER NOT NULL DEFAULT 0,
  processed_items INTEGER NOT NULL DEFAULT 0,
  successful_items INTEGER NOT NULL DEFAULT 0,
  failed_items INTEGER NOT NULL DEFAULT 0,
  batch_size INTEGER NOT NULL DEFAULT 50,
  payload TEXT NOT NULL,
  results TEXT,
  error_log TEXT,
  created_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bulk_jobs_status ON bulk_jobs(status);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT system,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

CREATE TABLE IF NOT EXISTS email_logs (
  id TEXT PRIMARY KEY,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  template_name TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  sent_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_logs_to ON email_logs(to_email);

CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS notification_campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  image_url TEXT,
  cta_label TEXT,
  cta_url TEXT,
  channels TEXT NOT NULL DEFAULT '["in_app"]',
  priority TEXT NOT NULL DEFAULT 'normal',
  audience_filter TEXT NOT NULL DEFAULT '{"type":"all"}',
  status TEXT NOT NULL DEFAULT 'draft',
  total_recipients INTEGER NOT NULL DEFAULT 0,
  delivered_recipients INTEGER NOT NULL DEFAULT 0,
  failed_recipients INTEGER NOT NULL DEFAULT 0,
  scheduled_for INTEGER,
  sent_at INTEGER,
  created_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON notification_campaigns(status);

CREATE TABLE IF NOT EXISTS campaign_recipients (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES notification_campaigns(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  email TEXT,
  channels_sent TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  sent_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_camp_rec_camp ON campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_camp_rec_user ON campaign_recipients(user_id);

CREATE TABLE IF NOT EXISTS notification_rules (
  id TEXT PRIMARY KEY,
  event_type TEXT UNIQUE NOT NULL,
  channels TEXT NOT NULL DEFAULT '["in_app","email"]',
  template_title TEXT NOT NULL,
  template_body TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_api_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  key_last4 TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_user_api_user ON user_api_credentials(user_id);

CREATE TABLE IF NOT EXISTS admin_api_pools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  key_last4 TEXT NOT NULL,
  allowed_models TEXT NOT NULL DEFAULT '[]',
  max_monthly_spend_cents INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_api_assignments (
  id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL REFERENCES admin_api_pools(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  policy TEXT NOT NULL DEFAULT 'USER_FIRST',
  status TEXT NOT NULL DEFAULT 'active',
  expires_at INTEGER,
  assigned_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(pool_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_api_assign_user ON user_api_assignments(user_id);

CREATE TABLE IF NOT EXISTS user_device_overrides (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  max_devices_override INTEGER NOT NULL,
  reason TEXT,
  updated_by TEXT REFERENCES users(id),
  updated_at INTEGER NOT NULL
);

-- ==================== REFERRALS, WALLETS & PAYOUT TABLES ====================

CREATE TABLE IF NOT EXISTS referral_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL COLLATE NOCASE,
  clicks INTEGER NOT NULL DEFAULT 0,
  signups INTEGER NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ref_codes_code ON referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_ref_codes_user ON referral_codes(user_id);

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  referrer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'signed_up',
  first_purchase_payment_id TEXT REFERENCES payments(id),
  ip_address TEXT,
  user_agent TEXT,
  attributed_at INTEGER NOT NULL,
  converted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_user_id);

CREATE TABLE IF NOT EXISTS referral_rewards (
  id TEXT PRIMARY KEY,
  referrer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_id TEXT NOT NULL REFERENCES payments(id),
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  reward_type TEXT NOT NULL DEFAULT 'percentage',
  reward_value REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  holding_period_days INTEGER NOT NULL DEFAULT 14,
  unlock_at INTEGER NOT NULL,
  matured_at INTEGER,
  cancellation_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ref_rewards_referrer ON referral_rewards(referrer_id);
CREATE INDEX IF NOT EXISTS idx_ref_rewards_payment ON referral_rewards(payment_id);
CREATE INDEX IF NOT EXISTS idx_ref_rewards_status_unlock ON referral_rewards(status, unlock_at);

CREATE TABLE IF NOT EXISTS wallets (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  currency TEXT NOT NULL DEFAULT 'INR',
  available_balance INTEGER NOT NULL DEFAULT 0,
  pending_balance INTEGER NOT NULL DEFAULT 0,
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_withdrawn INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  wallet_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  reference_id TEXT,
  description TEXT NOT NULL,
  balance_after INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON wallet_transactions(wallet_user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_created ON wallet_transactions(created_at);

CREATE TABLE IF NOT EXISTS payout_beneficiaries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payout_method TEXT NOT NULL,
  account_holder_name TEXT NOT NULL,
  upi_id TEXT,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  bank_name TEXT,
  is_default INTEGER NOT NULL DEFAULT 1,
  is_verified INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payout_beneficiary_user ON payout_beneficiaries(user_id);

CREATE TABLE IF NOT EXISTS payout_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  beneficiary_id TEXT NOT NULL REFERENCES payout_beneficiaries(id),
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'requested',
  rejection_reason TEXT,
  failure_reason TEXT,
  payout_reference TEXT,
  payout_provider TEXT NOT NULL DEFAULT 'manual',
  provider_payout_id TEXT,
  requested_at INTEGER NOT NULL,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at INTEGER,
  processed_at INTEGER,
  paid_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payout_requests_user ON payout_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_payout_requests_status ON payout_requests(status);

`;
