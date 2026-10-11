import { describe, it, expect, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import {
  generateExpectedSignature,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from "../../lib/payments/razorpay";
import {
  validateCoupon,
  bulkGenerateCoupons,
  createCoupon,
} from "../../lib/db/coupons";
import {
  checkDeviceLimit,
  registerOrUpdateDevice,
  revokeDevice,
  revokeAllOtherDevices,
  revokeAllUserDevices,
  listUserDevices,
  getUserDeviceLimit,
  setUserDeviceOverride,
  removeUserDeviceOverride,
} from "../../lib/db/devices";
import { deleteSession } from "../../lib/db/sessions";

import {
  activateSubscription,
  evaluateGracePeriods,
  downgradeExpiredSubscriptions,
  getActiveSubscription,
} from "../../lib/db/subscriptions";
import {
  getUserAICredits,
  grantAICredits,
  deductAICredits,
} from "../../lib/db/ai-credits";
import {
  createBulkJob,
  processBulkJobBatch,
  getBulkJobById,
} from "../../lib/db/bulk-jobs";
import {
  calculateInvoiceBreakdown,
  generateInvoiceHtml,
} from "../../lib/payments/invoices";
import { getDb } from "../../lib/db";

describe("VDO Admin Panel & Billing Test Suite", () => {
  const db = getDb();

  function createTestUser(id: string) {
    db.prepare(`
      INSERT OR IGNORE INTO users (id, email, name, password_hash, password_salt, role, status, created_at, updated_at)
      VALUES (?, ?, 'Test User', 'mockhash', 'mocksalt', 'user', 'active', ?, ?)
    `).run(id, `${id}@example.com`, Date.now(), Date.now());
  }

  const testUserId = "user_main_" + Date.now();

  beforeEach(() => {
    createTestUser(testUserId);
  });

  describe("1. Razorpay Gateway & Signature Verification", () => {
    const mockSecret = "rzp_test_secret_key_12345";
    const orderId = "order_99887766";
    const paymentId = "pay_11223344";

    it("verifies authentic HMAC-SHA256 signature", () => {
      const validSignature = createHmac("sha256", mockSecret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

      const generated = generateExpectedSignature(orderId, paymentId, mockSecret);
      expect(generated).toBe(validSignature);
      expect(validSignature.length).toBe(64);
    });

    it("strictly rejects tampered signatures", () => {
      const tamperedSignature = "bad_signature_000000000000000000000000000000000000000000000000000000";
      const isValid = verifyPaymentSignature({
        orderId,
        paymentId,
        signature: tamperedSignature,
      });
      expect(isValid).toBe(false);
    });

    it("verifies webhook payload HMAC signature", () => {
      const webhookSecret = "wh_secret_xyz";
      const rawPayload = JSON.stringify({ event: "payment.captured", id: "evt_123" });
      const webhookSig = createHmac("sha256", webhookSecret).update(rawPayload).digest("hex");

      const verified = verifyWebhookSignature(rawPayload, webhookSig, webhookSecret);
      expect(verified).toBe(true);

      const invalid = verifyWebhookSignature(rawPayload, "wrong_sig", webhookSecret);
      expect(invalid).toBe(false);
    });
  });

  describe("2. Coupons & Recurrence Discount Scoping", () => {
    const basePlanAmount = 100000; // ₹1,000.00 in paise

    it("calculates percentage discount accurately", () => {
      const cpnCode = "TESTPCT_" + Date.now();
      createCoupon({
        code: cpnCode,
        discount_type: "percentage",
        discount_value: 30, // 30% off
        scope: "first_payment",
      });

      const res = validateCoupon(cpnCode, basePlanAmount, testUserId, 0);
      expect(res.valid).toBe(true);
      expect(res.discountAmount).toBe(30000); // 30% of 100000 = 30000
      expect(res.finalAmount).toBe(70000); // 70000
    });

    it("calculates fixed discount accurately and caps at base amount", () => {
      const cpnCode = "TESTFIX_" + Date.now();
      createCoupon({
        code: cpnCode,
        discount_type: "fixed",
        discount_value: 25000, // ₹250.00 in paise
        scope: "first_payment",
      });

      const res = validateCoupon(cpnCode, basePlanAmount, testUserId, 0);
      expect(res.valid).toBe(true);
      expect(res.discountAmount).toBe(25000);
      expect(res.finalAmount).toBe(75000);

      // Excessive discount caps at 100%
      const hugeCode = "TESTHUGE_" + Date.now();
      createCoupon({
        code: hugeCode,
        discount_type: "fixed",
        discount_value: 200000,
        scope: "first_payment",
      });
      const hugeRes = validateCoupon(hugeCode, basePlanAmount, testUserId, 0);
      expect(hugeRes.discountAmount).toBe(basePlanAmount);
      expect(hugeRes.finalAmount).toBe(0);
    });

    it("enforces coupon recurrence scopes (first_payment vs first_n_cycles vs every_renewal)", () => {
      // First payment only
      const firstPayCode = "SCOPE1_" + Date.now();
      createCoupon({
        code: firstPayCode,
        discount_type: "percentage",
        discount_value: 20,
        scope: "first_payment",
      });

      // Valid on first payment (cycle 0)
      expect(validateCoupon(firstPayCode, basePlanAmount, testUserId, 0).valid).toBe(true);
      // Rejected on renewal (cycle 1)
      expect(validateCoupon(firstPayCode, basePlanAmount, testUserId, 1).valid).toBe(false);

      // First N cycles
      const first3CyclesCode = "SCOPE3_" + Date.now();
      createCoupon({
        code: first3CyclesCode,
        discount_type: "percentage",
        discount_value: 20,
        scope: "first_n_cycles",
        n_cycles: 3,
      });

      expect(validateCoupon(first3CyclesCode, basePlanAmount, testUserId, 0).valid).toBe(true);
      expect(validateCoupon(first3CyclesCode, basePlanAmount, testUserId, 2).valid).toBe(true);
      expect(validateCoupon(first3CyclesCode, basePlanAmount, testUserId, 3).valid).toBe(false);

      // Every renewal
      const lifetimeCode = "SCOPELIFE_" + Date.now();
      createCoupon({
        code: lifetimeCode,
        discount_type: "percentage",
        discount_value: 15,
        scope: "every_renewal",
      });

      expect(validateCoupon(lifetimeCode, basePlanAmount, testUserId, 0).valid).toBe(true);
      expect(validateCoupon(lifetimeCode, basePlanAmount, testUserId, 10).valid).toBe(true);
    });

    it("bulk-generates collision-resistant unique coupon codes", () => {
      const generated = bulkGenerateCoupons({
        count: 15,
        prefix: "SUMMER",
        discount_type: "percentage",
        discount_value: 25,
        max_redemptions: 1,
      });

      expect(generated.length).toBe(15);
      const uniqueCodes = new Set(generated.map((c) => c.code));
      expect(uniqueCodes.size).toBe(15);
      expect(generated[0].code.startsWith("SUMMER-")).toBe(true);
    });
  });

  describe("3. Device Limits & Interactive Session Enforcement", () => {
    it("tracks devices and enforces plan concurrency limits", () => {
      const uid = "dev_user_" + Date.now();
      createTestUser(uid);

      // Register device 1
      registerOrUpdateDevice({
        userId: uid,
        sessionToken: "tok_dev1_" + Date.now(),
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
        ipAddress: "192.168.1.10",
      });

      let check = checkDeviceLimit(uid, 2);
      expect(check.allowed).toBe(true);
      expect(check.activeCount).toBe(1);

      // Register device 2
      registerOrUpdateDevice({
        userId: uid,
        sessionToken: "tok_dev2_" + Date.now(),
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1",
        ipAddress: "192.168.1.11",
      });

      check = checkDeviceLimit(uid, 2);
      expect(check.allowed).toBe(true);
      expect(check.activeCount).toBe(2);

      // Register device 3 -> exceeds 2-device limit
      const token3 = "tok_dev3_" + Date.now();
      registerOrUpdateDevice({
        userId: uid,
        sessionToken: token3,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Edge/120.0",
        ipAddress: "192.168.1.12",
      });

      check = checkDeviceLimit(uid, 2);
      expect(check.allowed).toBe(false);
      expect(check.activeCount).toBe(3);

      // Remote revocation of device 1 frees up the slot
      const allDevs = listUserDevices(uid);
      const devToRevoke = allDevs.find((d) => d.session_token !== token3) || allDevs[allDevs.length - 1];
      revokeDevice(devToRevoke.id, uid);

      check = checkDeviceLimit(uid, 2);
      expect(check.allowed).toBe(true);
      expect(check.activeCount).toBe(2);

      // Revoke all other devices leaves only token3 active
      revokeAllOtherDevices(uid, token3);
      const remaining = listUserDevices(uid);
      expect(remaining.length).toBe(1);
      expect(remaining[0].session_token).toBe(token3);

      // Revoke all devices marks all devices as revoked
      const count = revokeAllUserDevices(uid);
      expect(count).toBe(1);
      expect(listUserDevices(uid).length).toBe(0);
      expect(listUserDevices(uid, true).length).toBe(3);
    });

    it("synchronizes session deletion with device revocation", () => {
      const syncUid = "sync_user_" + Date.now();
      createTestUser(syncUid);
      const sessTok = "tok_sync_" + Date.now();

      registerOrUpdateDevice({
        userId: syncUid,
        sessionToken: sessTok,
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      });


      expect(listUserDevices(syncUid).length).toBe(1);

      // When session is deleted (e.g. on logout), device is automatically marked revoked
      deleteSession(sessTok);
      expect(listUserDevices(syncUid).length).toBe(0);
      const all = listUserDevices(syncUid, true);
      expect(all.length).toBe(1);
      expect(all[0].is_revoked).toBe(1);
    });

    it("respects global admin setting fallback and per-user override for device limits", () => {
      const userA = "override_user_a_" + Date.now();
      createTestUser(userA);

      // Without subscription or override, falls back to admin setting
      db.prepare("INSERT OR REPLACE INTO admin_settings (key, value, updated_at) VALUES ('default_device_limit', '3', ?)").run(Date.now());
      expect(getUserDeviceLimit(userA)).toBe(3);

      // Set individual override to 5
      setUserDeviceOverride({
        userId: userA,
        maxDevices: 5,
        reason: "VIP device allowance",
      });
      expect(getUserDeviceLimit(userA)).toBe(5);

      // Remove override -> reverts back to global default (3)
      removeUserDeviceOverride(userA);
      expect(getUserDeviceLimit(userA)).toBe(3);
    });
  });


  describe("4. Subscription Expiry, Grace Period & Local Storage Invariance", () => {
    it("activates subscription and grants plan AI credits", () => {
      const subUser = "sub_user_" + Date.now();
      createTestUser(subUser);

      const initialCredits = getUserAICredits(subUser).balance;

      const sub = activateSubscription({
        userId: subUser,
        planId: "plan_monthly_pro",
        durationMs: 30 * 24 * 60 * 60 * 1000,
      });

      expect(sub.status).toBe("active");
      const updatedCredits = getUserAICredits(subUser).balance;
      expect(updatedCredits).toBe(initialCredits + 250); // Monthly Pro grants 250 credits
    });

    it("softly transitions expired subscription to grace_period then expired", () => {
      const expireUser = "exp_user_" + Date.now();
      createTestUser(expireUser);
      const pastTime = Date.now() - 10000;

      // Create subscription
      const sub = activateSubscription({
        userId: expireUser,
        planId: "plan_weekly_pro",
        durationMs: 1000, // 1 second
      });

      // Force period end into the past
      db.prepare("UPDATE subscriptions SET current_period_end = ? WHERE id = ?").run(pastTime, sub.id);

      // Evaluate grace periods
      const graceEvaluated = evaluateGracePeriods(5);
      expect(graceEvaluated).toBeGreaterThanOrEqual(1);

      const activeSub = getActiveSubscription(expireUser);
      expect(activeSub?.status).toBe("grace_period");
      expect(activeSub?.grace_period_end).toBeGreaterThan(Date.now());

      // Force grace period into the past
      db.prepare("UPDATE subscriptions SET grace_period_end = ? WHERE id = ?").run(pastTime, sub.id);

      // Downgrade expired subscriptions
      const downgraded = downgradeExpiredSubscriptions();
      expect(downgraded).toBeGreaterThanOrEqual(1);

      const postExpirySub = getActiveSubscription(expireUser);
      // Soft-downgraded to Free Tier
      expect(postExpirySub).toBeNull();
    });
  });

  describe("5. Bulk Job Runner & Chunk Processing", () => {
    it("processes bulk credit grants in chunked batches safely", async () => {
      const targetIds = [
        "user_batch_1_" + Date.now(),
        "user_batch_2_" + Date.now(),
        "user_batch_3_" + Date.now(),
      ];

      for (const id of targetIds) {
        createTestUser(id);
      }

      const job = createBulkJob({
        type: "ai_credit_grant",
        targetUserIds: targetIds,
        payload: { amount: 15, reason: "Test bulk grant" },
        batchSize: 2, // 2 items per chunk
      });

      expect(job.status).toBe("pending");
      expect(job.total_items).toBe(3);

      // Execute chunk 1 (2 items)
      const afterChunk1 = await processBulkJobBatch(job.id, 2);
      expect(afterChunk1?.processed_items).toBe(2);
      expect(afterChunk1?.status).toBe("running");

      // Execute chunk 2 (1 remaining item)
      const afterChunk2 = await processBulkJobBatch(job.id, 2);
      expect(afterChunk2?.processed_items).toBe(3);
      expect(afterChunk2?.status).toBe("completed");
      expect(afterChunk2?.failed_items).toBe(0);

      // Verify credits were granted
      const u1Credits = getUserAICredits(targetIds[0]);
      expect(u1Credits.balance).toBe(25); // 10 initial + 15 granted
    });

    it("executes user_device_override bulk job to apply device limits to multiple users", async () => {
      const user1 = "bulk_dev_1_" + Date.now();
      const user2 = "bulk_dev_2_" + Date.now();
      createTestUser(user1);
      createTestUser(user2);

      const job = createBulkJob({
        type: "user_device_override",
        targetUserIds: [user1, user2],
        payload: { maxDevices: 4, reason: "Bulk policy update" },
        batchSize: 10,
        createdBy: testUserId,
      });

      const res = await processBulkJobBatch(job.id, 10);
      expect(res?.status).toBe("completed");
      expect(res?.processed_items).toBe(2);
      expect(res?.successful_items).toBe(2);

      expect(getUserDeviceLimit(user1)).toBe(4);
      expect(getUserDeviceLimit(user2)).toBe(4);
    });
  });

  describe("6. Invoice Generation & Tax Breakdown", () => {
    it("calculates subtotal, discounts, and itemized taxes accurately", () => {
      const mockPlan: any = {
        name: "Monthly Pro",
        price_amount: 100000, // ₹1,000.00
        tax_rate_percent: 18.0,
      };

      const breakdown = calculateInvoiceBreakdown({
        plan: mockPlan,
        discountAmount: 20000, // ₹200.00 discount
        couponCode: "SAVE20",
      });

      expect(breakdown.baseAmount).toBe(100000);
      expect(breakdown.discountAmount).toBe(20000);
      expect(breakdown.subtotal).toBe(80000);
      expect(breakdown.taxAmount).toBe(14400); // 18% of 80000 = 14400
      expect(breakdown.totalAmount).toBe(94400); // 80000 + 14400 = 94400
    });

    it("generates valid standalone HTML invoice", () => {
      const html = generateInvoiceHtml({
        invoiceNumber: "INV-2026-TEST",
        date: "10/10/2026",
        userName: "Kamal Kant",
        userEmail: "kamal@vdo.studio",
        planName: "Monthly Pro",
        interval: "monthly",
        currency: "INR",
        baseAmount: 100000,
        discountAmount: 20000,
        couponCode: "SAVE20",
        taxPercent: 18,
        taxAmount: 14400,
        totalAmount: 94400,
        paymentId: "pay_test_invoice_123",
        status: "CAPTURED",
      });

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("INV-2026-TEST");
      expect(html).toContain("Kamal Kant");
      expect(html).toContain("₹944.00");
    });
  });
});
