import { describe, it, expect, beforeEach } from "vitest";
import { encryptString, decryptString, maskSecretKey } from "../../lib/crypto/encryption";
import {
  setUserCredential,
  listUserCredentials,
  removeUserCredential,
  createAdminPool,
  listAdminPools,
  assignPoolToUser,
  resolveAiKey,
} from "../../lib/ai/user-keys";
import {
  getUserDeviceLimit,
  setUserDeviceOverride,
  removeUserDeviceOverride,
  checkDeviceLimit,
  registerOrUpdateDevice,
  revokeDevice,
} from "../../lib/db/devices";
import {
  createCampaign,
  getCampaignById,
  resolveAudience,
  dispatchCampaign,
  retryFailedCampaignRecipients,
  listNotificationRules,
  updateNotificationRule,
} from "../../lib/notifications/campaign-engine";
import {
  createBulkJob,
  getBulkJobById,
  processBulkJobBatch,
  generateBulkJobReportCsv,
} from "../../lib/db/bulk-jobs";
import { getDb } from "../../lib/db/index";
import { randomUUID } from "node:crypto";

describe("Admin Incremental Features Test Suite", () => {
  const db = getDb();
  let testUserId: string;
  let testAdminId: string;

  beforeEach(() => {
    testUserId = "usr_test_" + randomUUID().slice(0, 8);
    testAdminId = "adm_test_" + randomUUID().slice(0, 8);

    // Seed test users
    db.prepare(`
      INSERT OR REPLACE INTO users (id, email, name, password_hash, password_salt, role, status, created_at, updated_at)
      VALUES (?, ?, 'Test Regular User', 'hash123', 'salt123', 'user', 'active', ?, ?)
    `).run(testUserId, `${testUserId}@example.com`, Date.now(), Date.now());

    db.prepare(`
      INSERT OR REPLACE INTO users (id, email, name, password_hash, password_salt, role, status, created_at, updated_at)
      VALUES (?, ?, 'Test Admin User', 'hash123', 'salt123', 'super_admin', 'active', ?, ?)
    `).run(testAdminId, `${testAdminId}@example.com`, Date.now(), Date.now());
  });

  describe("1. AES-256-GCM Encryption & Credential Isolation", () => {
    it("encrypts and decrypts API credentials securely", () => {
      const rawSecret = "AIzaSySecretApiKey123456789";
      const encrypted = encryptString(rawSecret);

      expect(encrypted).not.toBe(rawSecret);
      expect(encrypted.split(":")).toHaveLength(3); // iv:tag:ciphertext

      const decrypted = decryptString(encrypted);
      expect(decrypted).toBe(rawSecret);
    });

    it("safely handles corrupted or tampered encrypted payloads", () => {
      const corrupted = "invalid:tampered:payload";
      const decrypted = decryptString(corrupted);
      expect(decrypted).toBeNull();
    });

    it("masks API keys to only show the last 4 characters", () => {
      const masked = maskSecretKey("AIzaSySecretApiKey123456789");
      expect(masked.hasKey).toBe(true);
      expect(masked.last4).toBe("6789");

      const emptyMasked = maskSecretKey("");
      expect(emptyMasked.hasKey).toBe(false);
      expect(emptyMasked.last4).toBeNull();
    });
  });

  describe("2. User AI Keys & Super Admin Assignment Policies", () => {
    it("allows a user to store, list, and delete their personal encrypted API key", () => {
      setUserCredential(testUserId, "gemini", "AIzaSyUserPersonalKey9999");
      const creds = listUserCredentials(testUserId);
      const gemini = creds.find((c) => c.provider === "gemini");

      expect(gemini).toBeDefined();
      expect(gemini?.hasKey).toBe(true);
      expect(gemini?.last4).toBe("9999");

      // Verify deletion
      const removed = removeUserCredential(testUserId, "gemini");
      expect(removed).toBe(true);

      const afterCreds = listUserCredentials(testUserId);
      const afterGemini = afterCreds.find((c) => c.provider === "gemini");
      expect(afterGemini?.hasKey).toBe(false);
    });

    it("resolves keys according to USER_FIRST policy and protects Super Admin private key", async () => {
      // 1. Regular user with no key and no assignment gets null (falls back to platform credits)
      const unassigned = await resolveAiKey(testUserId, "gemini");
      expect(unassigned.key).toBeNull();
      expect(unassigned.source).toBe("credits");

      // 2. Super Admin creates an API pool
      const pool = createAdminPool({
        name: "Enterprise Gemini Pool",
        provider: "gemini",
        rawKey: "AIzaSyAdminPoolKey8888",
        createdBy: testAdminId,
      });
      expect(pool.id).toBeDefined();

      // 3. Assign pool to user with USER_FIRST policy
      assignPoolToUser({
        poolId: pool.id,
        userId: testUserId,
        policy: "USER_FIRST",
        assignedBy: testAdminId,
      });

      // User has no personal key yet -> gets admin assigned key
      const assignedRes = await resolveAiKey(testUserId, "gemini");
      expect(assignedRes.key).toBe("AIzaSyAdminPoolKey8888");
      expect(assignedRes.source).toBe("assigned");

      // User now adds their personal key -> USER_FIRST should prefer their personal key
      setUserCredential(testUserId, "gemini", "AIzaSyUserPersonalKey7777");
      const userFirstRes = await resolveAiKey(testUserId, "gemini");
      expect(userFirstRes.key).toBe("AIzaSyUserPersonalKey7777");
      expect(userFirstRes.source).toBe("user");

      // Reassign with ADMIN_FIRST policy -> should prefer pool key even though user has key
      assignPoolToUser({
        poolId: pool.id,
        userId: testUserId,
        policy: "ADMIN_FIRST",
        assignedBy: testAdminId,
      });
      const adminFirstRes = await resolveAiKey(testUserId, "gemini");
      expect(adminFirstRes.key).toBe("AIzaSyAdminPoolKey8888");
      expect(adminFirstRes.source).toBe("assigned");
    });
  });

  describe("3. Simultaneous Device Limits & Session Enforcement", () => {
    it("enforces plan default limit and applies user-specific overrides", () => {
      // Default free limit is 1
      const defaultLimit = getUserDeviceLimit(testUserId);
      expect(defaultLimit).toBe(1);

      // Set admin override to 4 devices
      setUserDeviceOverride({
        userId: testUserId,
        maxDevices: 4,
        reason: "Studio Power User Beta",
        updatedBy: testAdminId,
      });

      const overrideLimit = getUserDeviceLimit(testUserId);
      expect(overrideLimit).toBe(4);

      // Remove override -> reverts to plan default
      removeUserDeviceOverride(testUserId);
      expect(getUserDeviceLimit(testUserId)).toBe(1);
    });

    it("blocks new session when active devices reach simultaneous limit", () => {
      // User with 1 device limit
      const token1 = "sess_tok_1_" + randomUUID();
      const dev1 = registerOrUpdateDevice({
        userId: testUserId,
        sessionToken: token1,
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0",
      });
      expect(dev1.id).toBeDefined();

      // Check device limit -> 1 active device with limit 1 is allowed
      let check = checkDeviceLimit(testUserId, 1);
      expect(check.activeCount).toBe(1);
      expect(check.allowed).toBe(true);

      // Adding a 2nd device exceeds limit 1
      const token2 = "sess_tok_2_" + randomUUID();
      const dev2 = registerOrUpdateDevice({
        userId: testUserId,
        sessionToken: token2,
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5)",
      });
      check = checkDeviceLimit(testUserId, 1);
      expect(check.activeCount).toBe(2);
      expect(check.allowed).toBe(false);

      // Revoking dev2 frees the slot back to limit 1
      const revoked = revokeDevice(dev2.id);
      expect(revoked).toBe(true);

      const checkAfter = checkDeviceLimit(testUserId, 1);
      expect(checkAfter.activeCount).toBe(1);
      expect(checkAfter.allowed).toBe(true);
    });
  });

  describe("4. Configurable Notification Platform & Multi-Channel Dispatch", () => {
    it("creates, filters audience, and dispatches a multi-channel campaign", async () => {
      const campaign = createCampaign({
        name: "Pro Feature Announcement",
        title: "New AI Inpainting Tools",
        message: "Check out the new smart brush in the editor.",
        ctaLabel: "Open Studio",
        ctaUrl: "/editor",
        channels: ["in_app", "email"],
        priority: "high",
        audienceFilter: { type: "users", userIds: [testUserId] },
        createdBy: testAdminId,
      });

      expect(campaign.id).toBeDefined();
      expect(campaign.status).toBe("draft");

      // Verify audience resolution and deduplication
      const audience = resolveAudience({ type: "users", userIds: [testUserId, testUserId] });
      expect(audience).toHaveLength(1);
      expect(audience[0].userId).toBe(testUserId);

      // Dispatch campaign
      const dispatch = await dispatchCampaign(campaign.id);
      expect(dispatch.total).toBe(1);
      expect(dispatch.delivered).toBe(1);

      // Verify campaign status updated in DB
      const updatedCampaign = getCampaignById(campaign.id);
      expect(updatedCampaign?.status).toBe("completed");
      expect(updatedCampaign?.delivered_recipients).toBe(1);

      // Verify in-app notification delivered
      const notifs = db.prepare("SELECT * FROM notifications WHERE user_id = ?").all(testUserId) as any[];
      expect(notifs.length).toBeGreaterThan(0);
      expect(notifs[0].title).toBe("New AI Inpainting Tools");
    });

    it("manages automated lifecycle reminder rules", () => {
      const rules = listNotificationRules();
      expect(rules.length).toBeGreaterThan(0);

      const exp7d = rules.find((r) => r.event_type === "subscription_expiring_7d");
      expect(exp7d).toBeDefined();

      const updated = updateNotificationRule({
        id: exp7d!.id,
        isEnabled: true,
        channels: ["in_app", "email"],
        templateTitle: "Custom 7-day Alert: {{plan_name}}",
        templateBody: "Hey {{name}}, renewal on {{renewal_date}}.",
      });
      expect(updated).toBe(true);
    });
  });

  describe("5. Universal Background Bulk Operations & Reporting", () => {
    it("executes chunked batch processing and generates CSV audit report", async () => {
      const job = createBulkJob({
        type: "ai_credit_grant",
        targetUserIds: [testUserId],
        payload: { amount: 15, reason: "Bulk Test Grant" },
        batchSize: 10,
        createdBy: testAdminId,
      });

      expect(job.id).toBeDefined();
      expect(job.status).toBe("pending");

      // Process batch
      const processedJob = await processBulkJobBatch(job.id);
      expect(processedJob?.status).toBe("completed");
      expect(processedJob?.successful_items).toBe(1);

      // Generate CSV Report
      const csv = generateBulkJobReportCsv(job.id);
      expect(csv).toContain("Job ID,Type,Status");
      expect(csv).toContain(job.id);
      expect(csv).toContain("ai_credit_grant");
      expect(csv).toContain('"completed"');
    });
  });
});
