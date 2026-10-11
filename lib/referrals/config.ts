import "server-only";
import { getAdminSetting, getNumberSetting, setMultipleAdminSettings } from "@/lib/db/admin-settings";
import type { RewardType } from "@/lib/db/schema";

export type ReferralProgramConfig = {
  enabled: boolean;
  rewardType: RewardType;
  rewardValue: number; // percentage (e.g. 20) or fixed amount in paise (e.g. 50000 = ₹500)
  holdingPeriodDays: number; // default: 14 days
  minWithdrawalThreshold: number; // in paise, default: 1000000 = ₹10,000
  maxWithdrawalPerRequest: number; // in paise, default: 5000000 = ₹50,000
  minQualifyingPurchase: number; // in paise, default: 0
  attributionWindowDays: number; // default: 30 days
  currency: string; // default: "INR"
  payoutMode: "manual_and_gateway" | "manual_only" | "gateway_only";
  razorpayxKeyId: string;
  razorpayxKeySecret: string;
  razorpayxAccountNumber: string;
};

export function getReferralProgramConfig(): ReferralProgramConfig {
  const enabled = getAdminSetting("referral_program_enabled", "true") === "true";
  const rewardType: RewardType = getAdminSetting("referral_reward_type", "percentage") === "fixed" ? "fixed" : "percentage";
  // getNumberSetting keeps an explicit 0 (e.g. no holding period) instead of snapping back to the default
  const rewardValue = getNumberSetting("referral_reward_value", 20);
  const holdingPeriodDays = getNumberSetting("referral_holding_period_days", 14);
  const minWithdrawalThreshold = getNumberSetting("referral_min_withdrawal_threshold", 1000000);
  const maxWithdrawalPerRequest = getNumberSetting("referral_max_withdrawal_per_request", 5000000);
  const minQualifyingPurchase = getNumberSetting("referral_min_qualifying_purchase", 0);
  const attributionWindowDays = getNumberSetting("referral_attribution_window_days", 30);
  const currency = getAdminSetting("referral_currency", "INR") || "INR";
  const mode = getAdminSetting("referral_payout_mode", "manual_and_gateway");
  const payoutMode: ReferralProgramConfig["payoutMode"] =
    mode === "manual_only" || mode === "gateway_only" ? mode : "manual_and_gateway";
  const razorpayxKeyId = getAdminSetting("razorpayx_key_id", process.env.RAZORPAYX_KEY_ID || "");
  const razorpayxKeySecret = getAdminSetting("razorpayx_key_secret", process.env.RAZORPAYX_KEY_SECRET || "");
  const razorpayxAccountNumber = getAdminSetting("razorpayx_account_number", process.env.RAZORPAYX_ACCOUNT_NUMBER || "");

  return {
    enabled,
    rewardType,
    rewardValue,
    holdingPeriodDays,
    minWithdrawalThreshold,
    maxWithdrawalPerRequest,
    minQualifyingPurchase,
    attributionWindowDays,
    currency,
    payoutMode,
    razorpayxKeyId,
    razorpayxKeySecret,
    razorpayxAccountNumber,
  };
}

export function updateReferralProgramConfig(
  updates: Partial<ReferralProgramConfig>,
  adminId?: string | null
): ReferralProgramConfig {
  const settings: Record<string, string> = {};

  if (updates.enabled !== undefined) {
    settings.referral_program_enabled = updates.enabled ? "true" : "false";
  }
  if (updates.rewardType !== undefined) {
    settings.referral_reward_type = updates.rewardType;
  }
  if (updates.rewardValue !== undefined) {
    settings.referral_reward_value = String(updates.rewardValue);
  }
  if (updates.holdingPeriodDays !== undefined) {
    settings.referral_holding_period_days = String(Math.max(0, updates.holdingPeriodDays));
  }
  if (updates.minWithdrawalThreshold !== undefined) {
    settings.referral_min_withdrawal_threshold = String(Math.max(100, updates.minWithdrawalThreshold));
  }
  if (updates.maxWithdrawalPerRequest !== undefined) {
    settings.referral_max_withdrawal_per_request = String(Math.max(100, updates.maxWithdrawalPerRequest));
  }
  if (updates.minQualifyingPurchase !== undefined) {
    settings.referral_min_qualifying_purchase = String(Math.max(0, updates.minQualifyingPurchase));
  }
  if (updates.attributionWindowDays !== undefined) {
    settings.referral_attribution_window_days = String(Math.max(1, updates.attributionWindowDays));
  }
  if (updates.currency !== undefined) {
    settings.referral_currency = updates.currency;
  }
  if (updates.payoutMode !== undefined) {
    settings.referral_payout_mode = updates.payoutMode;
  }
  if (updates.razorpayxKeyId !== undefined) {
    settings.razorpayx_key_id = updates.razorpayxKeyId;
  }
  // a blank secret means "keep the saved one" (the API never sends the saved secret back to the browser)
  if (updates.razorpayxKeySecret) {
    settings.razorpayx_key_secret = updates.razorpayxKeySecret;
  }
  if (updates.razorpayxAccountNumber !== undefined) {
    settings.razorpayx_account_number = updates.razorpayxAccountNumber;
  }

  setMultipleAdminSettings(settings, adminId);
  return getReferralProgramConfig();
}
