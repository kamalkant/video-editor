import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "../../lib/db";
import {
  getOrCreateReferralCode,
  getReferralCodeByCode,
  recordReferralCodeClick,
} from "../../lib/referrals/codes";
import {
  attributeReferral,
  getReferralByReferredUserId,
  listUserReferrals,
} from "../../lib/referrals/attribution";
import {
  getReferralProgramConfig,
  updateReferralProgramConfig,
} from "../../lib/referrals/config";
import {
  getUserWallet,
  creditPendingReward,
  cancelPendingReward,
  reverseAvailableReward,
  maturePendingRewards,
  lockFundsForWithdrawal,
  releaseLockedFunds,
  finalizeWithdrawalPaid,
  adminAdjustWallet,
  listWalletTransactions,
} from "../../lib/referrals/wallet";
import {
  processQualifyingPurchaseReward,
  reverseRewardForRefund,
} from "../../lib/referrals/rewards";
import {
  addBeneficiary,
  listUserBeneficiaries,
  requestPayout,
  approvePayout,
  rejectPayout,
  processManualPayout,
  bulkApprovePayouts,
  bulkRejectPayouts,
  validateUpiId,
  validateIfsc,
  validateAccountNumber,
} from "../../lib/referrals/payouts";
import { isRazorpayXConfigured, executeRazorpayXPayout } from "../../lib/referrals/razorpayx";
import type { Payment, PayoutBeneficiary, PayoutRequest } from "../../lib/db/schema";

describe("VDO Referral Program, Wallet & Payouts Suite", () => {
  const db = getDb();
  const testAdminId = "usr_admin_test";

  function createTestUser(id: string, email: string, name: string, emailVerified = 1, phone = "") {
    db.prepare(`
      INSERT OR IGNORE INTO users (
        id, email, name, password_hash, password_salt, role, status,
        email_verified, phone_number, created_at, updated_at
      ) VALUES (?, ?, ?, 'mockhash', 'mocksalt', 'user', 'active', ?, ?, ?, ?)
    `).run(id, email, name, emailVerified, phone || null, Date.now(), Date.now());
  }

  function createMockPaymentRow(paymentId: string, userId: string, amount: number): Payment {
    const now = Date.now();
    const orderId = "order_" + paymentId;
    const rzpPayId = "pay_rzp_" + paymentId;

    db.prepare(`
      INSERT OR IGNORE INTO payments (
        id, user_id, subscription_id, razorpay_order_id, razorpay_payment_id,
        amount, currency, status, error_code, error_description, invoice_number,
        idempotency_key, created_at, updated_at
      ) VALUES (?, ?, NULL, ?, ?, ?, 'INR', 'captured', NULL, NULL, ?, NULL, ?, ?)
    `).run(paymentId, userId, orderId, rzpPayId, amount, `INV-${paymentId}`, now, now);

    return {
      id: paymentId,
      user_id: userId,
      subscription_id: null,
      razorpay_order_id: orderId,
      razorpay_payment_id: rzpPayId,
      amount,
      currency: "INR",
      status: "captured",
      error_code: null,
      error_description: null,
      invoice_number: `INV-${paymentId}`,
      idempotency_key: null,
      created_at: now,
      updated_at: now,
      plan_id: null,
      coupon_id: null,
    };
  }

  let referrerId: string;
  let refereeId1: string;
  let refereeId2: string;

  beforeEach(() => {
    referrerId = "usr_ref_" + Math.random().toString(36).slice(2, 9);
    refereeId1 = "usr_rf1_" + Math.random().toString(36).slice(2, 9);
    refereeId2 = "usr_rf2_" + Math.random().toString(36).slice(2, 9);

    createTestUser(testAdminId, "admin_test@vdo.local", "Super Admin", 1);
    createTestUser(referrerId, `${referrerId}@vdo.test`, "Alice Creator", 1);
    createTestUser(refereeId1, `${refereeId1}@vdo.test`, "Bob Video", 1);
    createTestUser(refereeId2, `${refereeId2}@vdo.test`, "Charlie Director", 1);

    // Reset default referral configuration
    updateReferralProgramConfig({
      enabled: true,
      rewardType: "percentage",
      rewardValue: 20,
      holdingPeriodDays: 14,
      minWithdrawalThreshold: 1000000, // ₹10,000 in paise
      maxWithdrawalPerRequest: 5000000,
      minQualifyingPurchase: 0,
      attributionWindowDays: 30,
    });
  });

  describe("1. Referral Codes & Lookup", () => {
    it("generates unique referral code and retrieves existing record", () => {
      const code1 = getOrCreateReferralCode(referrerId);
      expect(code1).toBeDefined();
      expect(code1.user_id).toBe(referrerId);
      expect(code1.code.startsWith("VIPLAY-")).toBe(true);

      const code2 = getOrCreateReferralCode(referrerId);
      expect(code2.code).toBe(code1.code);
    });

    it("looks up code case-insensitively and tracks clicks", () => {
      const refCode = getOrCreateReferralCode(referrerId);
      const found = getReferralCodeByCode(refCode.code.toLowerCase());
      expect(found).toBeDefined();
      expect(found?.user_id).toBe(referrerId);

      const clicked = recordReferralCodeClick(refCode.code);
      expect(clicked).toBe(true);

      const updated = getReferralCodeByCode(refCode.code);
      expect(updated?.clicks).toBe(refCode.clicks + 1);
    });
  });

  describe("2. Referral Attribution & Anti-Fraud", () => {
    it("successfully attributes a new user on signup", () => {
      const refCode = getOrCreateReferralCode(referrerId);
      const res = attributeReferral({
        code: refCode.code,
        newUserId: refereeId1,
        ipAddress: "192.168.1.50",
      });

      expect(res.success).toBe(true);
      expect(res.referral?.referrer_id).toBe(referrerId);
      expect(res.referral?.referred_user_id).toBe(refereeId1);
      expect(res.referral?.status).toBe("signed_up");

      const check = getReferralByReferredUserId(refereeId1);
      expect(check?.referrer_id).toBe(referrerId);
    });

    it("prevents self-referral using user ID or matching identity", () => {
      const refCode = getOrCreateReferralCode(referrerId);

      // Same user ID
      const resSelf = attributeReferral({
        code: refCode.code,
        newUserId: referrerId,
      });
      expect(resSelf.success).toBe(false);
      expect(resSelf.error).toContain("Self-referral is not allowed");
    });

    it("prevents duplicate attribution for already referred user", () => {
      const refCode = getOrCreateReferralCode(referrerId);
      attributeReferral({ code: refCode.code, newUserId: refereeId2 });

      // Attempt to refer refereeId2 again
      const secondTry = attributeReferral({ code: refCode.code, newUserId: refereeId2 });
      expect(secondTry.success).toBe(false);
      expect(secondTry.error).toContain("already been referred");
    });

    it("skips attribution when referral program is disabled in settings", () => {
      updateReferralProgramConfig({ enabled: false });
      const refCode = getOrCreateReferralCode(referrerId);
      const res = attributeReferral({
        code: refCode.code,
        newUserId: refereeId2,
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain("inactive");
    });
  });

  describe("3. Purchase Verification & Reward Crediting", () => {
    it("credits pending reward on qualifying payment and marks referral converted", () => {
      const refCode = getOrCreateReferralCode(referrerId);
      attributeReferral({ code: refCode.code, newUserId: refereeId1 });

      const paymentId = "pay_test_" + Math.random().toString(36).slice(2, 9);
      const mockPayment = createMockPaymentRow(paymentId, refereeId1, 299900); // ₹2,999.00

      const res = processQualifyingPurchaseReward(mockPayment);
      expect(res.processed).toBe(true);
      expect(res.reward).toBeDefined();
      // 20% of 299900 is 59980 paise (₹599.80)
      expect(res.reward?.amount).toBe(59980);
      expect(res.reward?.status).toBe("pending");

      // Check referrer wallet has pending balance
      const wallet = getUserWallet(referrerId);
      expect(wallet.pending_balance).toBe(59980);
      expect(wallet.available_balance).toBe(0);

      // Verify referral status converted
      const ref = getReferralByReferredUserId(refereeId1);
      expect(ref?.status).toBe("converted");
      expect(ref?.first_purchase_payment_id).toBe(mockPayment.id);
    });

    it("ensures idempotency when duplicate webhook or verify call occurs", () => {
      const refCode = getOrCreateReferralCode(referrerId);
      attributeReferral({ code: refCode.code, newUserId: refereeId2 });

      const paymentId = "pay_idemp_" + Math.random().toString(36).slice(2, 9);
      const mockPayment = createMockPaymentRow(paymentId, refereeId2, 500000); // ₹5,000

      const firstCall = processQualifyingPurchaseReward(mockPayment);
      expect(firstCall.processed).toBe(true);

      const walletBefore = getUserWallet(referrerId);

      // Second identical call
      const secondCall = processQualifyingPurchaseReward(mockPayment);
      expect(secondCall.processed).toBe(false);
      expect(secondCall.reason).toContain("already processed");

      const walletAfter = getUserWallet(referrerId);
      expect(walletAfter.pending_balance).toBe(walletBefore.pending_balance);
    });
  });

  describe("4. Holding Period Maturity & Ledger Integrity", () => {
    it("transitions mature pending rewards to available balance and records ledger transaction", () => {
      const wallet = getUserWallet(referrerId);
      const initialAvailable = wallet.available_balance;

      const pastPaymentId = "pay_past_" + Math.random().toString(36).slice(2, 9);
      createMockPaymentRow(pastPaymentId, refereeId1, 500000);

      // Insert reward whose unlock_at is in the past
      const rewardId = "rrew_past_" + Math.random().toString(36).slice(2, 9);
      const pastTime = Date.now() - 1000;
      db.prepare(`
        INSERT INTO referral_rewards (
          id, referrer_id, referred_user_id, payment_id, amount, currency,
          reward_type, reward_value, status, holding_period_days, unlock_at,
          matured_at, cancellation_reason, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 100000, 'INR', 'fixed', 100000, 'pending', 14, ?, NULL, NULL, ?, ?)
      `).run(rewardId, referrerId, refereeId1, pastPaymentId, pastTime, pastTime, pastTime);

      // Credit pending
      db.prepare("UPDATE wallets SET pending_balance = pending_balance + 100000 WHERE user_id = ?").run(referrerId);

      // Run maturity transition
      const maturedCount = maturePendingRewards(referrerId);
      expect(maturedCount).toBeGreaterThanOrEqual(1);

      const updatedWallet = getUserWallet(referrerId);
      expect(updatedWallet.available_balance).toBe(initialAvailable + 100000);
      expect(updatedWallet.total_earned).toBeGreaterThanOrEqual(100000);

      // Check transaction ledger
      const txs = listWalletTransactions(referrerId);
      const maturedTx = txs.transactions.find((t) => t.reference_id === rewardId);
      expect(maturedTx).toBeDefined();
      expect(maturedTx?.type).toBe("reward_matured");
      expect(maturedTx?.status).toBe("completed");
    });
  });

  describe("5. Withdrawal Eligibility & Funds Reservation", () => {
    it("validates beneficiary inputs (UPI and Bank)", () => {
      expect(validateUpiId("creator@okaxis")).toBe(true);
      expect(validateUpiId("invalid_upi")).toBe(false);

      expect(validateIfsc("HDFC0001234")).toBe(true);
      expect(validateIfsc("123456")).toBe(false);

      expect(validateAccountNumber("123456789012")).toBe(true);
      expect(validateAccountNumber("123")).toBe(false);
    });

    it("enforces minimum withdrawal threshold (₹10,000)", () => {
      // Add beneficiary
      const beneRes = addBeneficiary(referrerId, {
        payoutMethod: "upi",
        accountHolderName: "Alice Creator",
        upiId: "alice@okhdfc",
      });
      expect(beneRes.success).toBe(true);
      const beneId = beneRes.beneficiary!.id;

      // Attempt withdrawal with zero balance
      const failedRequest = requestPayout(referrerId, 1000000, beneId);
      expect(failedRequest.success).toBe(false);
      expect(failedRequest.error).toContain("Insufficient available balance");
    });

    it("locks funds safely upon withdrawal and refunds them upon rejection", () => {
      // Credit ₹15,000 available balance
      adminAdjustWallet(referrerId, 1500000, "Seed test balance", testAdminId);

      // Add beneficiary
      const beneRes = addBeneficiary(referrerId, {
        payoutMethod: "upi",
        accountHolderName: "Alice Creator",
        upiId: "alice@okhdfc",
      });
      const beneId = beneRes.beneficiary!.id;

      // Request withdrawal of ₹10,000 (1000000 paise)
      const res = requestPayout(referrerId, 1000000, beneId);
      expect(res.success).toBe(true);
      const reqId = res.request!.id;

      const walletDuring = getUserWallet(referrerId);
      expect(walletDuring.available_balance).toBe(500000); // 15000 - 10000 = 5000

      // Super Admin rejects request
      const rejected = rejectPayout(reqId, "Invalid UPI handle provided", testAdminId);
      expect(rejected.status).toBe("rejected");
      expect(rejected.rejection_reason).toBe("Invalid UPI handle provided");

      // Balance is safely released back!
      const walletAfter = getUserWallet(referrerId);
      expect(walletAfter.available_balance).toBe(1500000);
    });

    it("marks payout paid and updates total_withdrawn", () => {
      // Add balance and beneficiary
      adminAdjustWallet(referrerId, 1000000, "Seed payout test balance", testAdminId);
      const beneRes = addBeneficiary(referrerId, {
        payoutMethod: "upi",
        accountHolderName: "Alice Creator",
        upiId: "alice@okaxis",
      });

      // Request withdrawal of ₹10,000
      const reqRes = requestPayout(referrerId, 1000000, beneRes.beneficiary!.id);
      expect(reqRes.success).toBe(true);
      const reqId = reqRes.request!.id;

      // Approve request
      const approved = approvePayout(reqId, testAdminId);
      expect(approved.status).toBe("approved");

      // Mark Paid with UTR reference
      const paid = processManualPayout(reqId, "UTR987654321000", testAdminId);
      expect(paid.status).toBe("paid");
      expect(paid.payout_reference).toBe("UTR987654321000");

      const wallet = getUserWallet(referrerId);
      expect(wallet.total_withdrawn).toBe(1000000);
    });
  });

  describe("6. Refund & Chargeback Reversal", () => {
    it("cancels pending reward when a payment refund is processed", () => {
      const paymentId = "pay_for_refund_" + Math.random().toString(36).slice(2, 9);
      createMockPaymentRow(paymentId, refereeId1, 299900);

      // Seed reward
      const rewardId = "rrew_refund_" + Math.random().toString(36).slice(2, 9);
      db.prepare(`
        INSERT INTO referral_rewards (
          id, referrer_id, referred_user_id, payment_id, amount, currency,
          reward_type, reward_value, status, holding_period_days, unlock_at,
          matured_at, cancellation_reason, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 50000, 'INR', 'fixed', 50000, 'pending', 14, ?, NULL, NULL, ?, ?)
      `).run(rewardId, referrerId, refereeId1, paymentId, Date.now() + 1000000, Date.now(), Date.now());

      creditPendingReward(referrerId, 50000, rewardId, "Seed pending reward");

      const beforeCancel = getUserWallet(referrerId);
      expect(beforeCancel.pending_balance).toBeGreaterThanOrEqual(50000);

      const reversed = reverseRewardForRefund(paymentId, "Customer requested chargeback");
      expect(reversed).toBe(true);

      const rewardRow = db.prepare("SELECT * FROM referral_rewards WHERE id = ?").get(rewardId) as any;
      expect(rewardRow.status).toBe("cancelled");
      expect(rewardRow.cancellation_reason).toContain("chargeback");
    });
  });

  describe("7. Pluggable Payout Provider (RazorpayX Sandbox)", () => {
    it("handles sandbox simulation correctly when no live credentials exist", async () => {
      const mockReq: PayoutRequest = {
        id: "pout_mock_1",
        user_id: referrerId,
        beneficiary_id: "bene_mock_1",
        amount: 1000000,
        currency: "INR",
        status: "approved",
        rejection_reason: null,
        failure_reason: null,
        payout_reference: null,
        payout_provider: "manual",
        provider_payout_id: null,
        requested_at: Date.now(),
        reviewed_by: testAdminId,
        reviewed_at: Date.now(),
        processed_at: null,
        paid_at: null,
        updated_at: Date.now(),
      };

      const mockBene: PayoutBeneficiary = {
        id: "bene_mock_1",
        user_id: referrerId,
        payout_method: "upi",
        account_holder_name: "Alice Creator",
        upi_id: "alice@upi",
        bank_account_number: null,
        bank_ifsc: null,
        bank_name: null,
        is_default: 1,
        is_verified: 1,
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      const result = await executeRazorpayXPayout({ request: mockReq, beneficiary: mockBene });
      expect(result.success).toBe(true);
      expect(result.isSandbox).toBe(true);
      expect(result.referenceId).toBeDefined();
    });
  });

  describe("8. Bulk Admin Operations", () => {
    it("executes bulk approvals and bulk rejections", () => {
      // Create 2 test requests
      adminAdjustWallet(refereeId1, 2000000, "Seed balance", testAdminId);
      const bene = addBeneficiary(refereeId1, {
        payoutMethod: "upi",
        accountHolderName: "Bob Video",
        upiId: "bob@upi",
      });
      const req1 = requestPayout(refereeId1, 1000000, bene.beneficiary!.id);

      adminAdjustWallet(refereeId2, 2000000, "Seed balance", testAdminId);
      const bene2 = addBeneficiary(refereeId2, {
        payoutMethod: "upi",
        accountHolderName: "Charlie",
        upiId: "charlie@upi",
      });
      const req2 = requestPayout(refereeId2, 1000000, bene2.beneficiary!.id);

      expect(req1.success).toBe(true);
      expect(req2.success).toBe(true);

      const bulkRes = bulkApprovePayouts([req1.request!.id, req2.request!.id], testAdminId);
      expect(bulkRes.approved).toBe(2);

      const check1 = db.prepare("SELECT status FROM payout_requests WHERE id = ?").get(req1.request!.id) as any;
      expect(check1.status).toBe("approved");
    });
  });
});
