import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { getUserById } from "@/lib/db/users";
import { getReferralProgramConfig } from "./config";
import { lockFundsForWithdrawal, releaseLockedFunds, finalizeWithdrawalPaid } from "./wallet";
import { executeRazorpayXPayout } from "./razorpayx";
import { createNotification } from "@/lib/db/notifications";
import { logAudit } from "@/lib/db/audit";
import {
  sendPayoutRequestedEmail,
  sendPayoutApprovedEmail,
  sendPayoutRejectedEmail,
} from "@/lib/notifications/email-service";
import type {
  PayoutBeneficiary,
  PayoutMethod,
  PayoutRequest,
  PayoutStatus,
} from "@/lib/db/schema";

// ==================== BENEFICIARIES ====================

export function validateUpiId(upi: string): boolean {
  return /^[\w.-]+@[\w.-]+$/.test(upi.trim());
}

export function validateIfsc(ifsc: string): boolean {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/i.test(ifsc.trim());
}

export function validateAccountNumber(acc: string): boolean {
  return /^\d{9,18}$/.test(acc.trim());
}

export function addBeneficiary(
  userId: string,
  data: {
    payoutMethod: PayoutMethod;
    accountHolderName: string;
    upiId?: string | null;
    bankAccountNumber?: string | null;
    bankIfsc?: string | null;
    bankName?: string | null;
  }
): { success: boolean; beneficiary?: PayoutBeneficiary; error?: string } {
  const holderName = data.accountHolderName?.trim();
  if (!holderName || holderName.length < 3) {
    return { success: false, error: "Valid account holder name is required" };
  }

  if (data.payoutMethod === "upi") {
    if (!data.upiId || !validateUpiId(data.upiId)) {
      return { success: false, error: "Please enter a valid UPI ID (e.g. name@okhdfcbank)" };
    }
  } else if (data.payoutMethod === "bank_account") {
    if (!data.bankAccountNumber || !validateAccountNumber(data.bankAccountNumber)) {
      return { success: false, error: "Account number must be between 9 and 18 digits" };
    }
    if (!data.bankIfsc || !validateIfsc(data.bankIfsc)) {
      return { success: false, error: "Invalid IFSC code format (e.g. HDFC0001234)" };
    }
  } else {
    return { success: false, error: "Invalid payout method" };
  }

  const db = getDb();
  const id = "bene_" + randomUUID().slice(0, 8);
  const now = Date.now();

  // If user has no existing beneficiaries, make this default
  const existingCountRow = db
    .prepare("SELECT COUNT(*) as count FROM payout_beneficiaries WHERE user_id = ?")
    .get(userId) as { count: number };
  const isDefault = existingCountRow?.count === 0 ? 1 : 0;

  const stmt = db.prepare(`
    INSERT INTO payout_beneficiaries (
      id, user_id, payout_method, account_holder_name, upi_id,
      bank_account_number, bank_ifsc, bank_name, is_default, is_verified, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);

  stmt.run(
    id,
    userId,
    data.payoutMethod,
    holderName,
    data.upiId ? data.upiId.trim() : null,
    data.bankAccountNumber ? data.bankAccountNumber.trim() : null,
    data.bankIfsc ? data.bankIfsc.trim().toUpperCase() : null,
    data.bankName ? data.bankName.trim() : null,
    isDefault,
    now,
    now
  );

  const beneficiary: PayoutBeneficiary = {
    id,
    user_id: userId,
    payout_method: data.payoutMethod,
    account_holder_name: holderName,
    upi_id: data.upiId ? data.upiId.trim() : null,
    bank_account_number: data.bankAccountNumber ? data.bankAccountNumber.trim() : null,
    bank_ifsc: data.bankIfsc ? data.bankIfsc.trim().toUpperCase() : null,
    bank_name: data.bankName ? data.bankName.trim() : null,
    is_default: isDefault,
    is_verified: 1,
    created_at: now,
    updated_at: now,
  };

  return { success: true, beneficiary };
}

export function listUserBeneficiaries(userId: string): PayoutBeneficiary[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM payout_beneficiaries WHERE user_id = ? ORDER BY is_default DESC, created_at DESC")
    .all(userId) as PayoutBeneficiary[];
}

export function getBeneficiaryById(id: string): PayoutBeneficiary | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM payout_beneficiaries WHERE id = ?").get(id) as PayoutBeneficiary | undefined;
  return row ?? null;
}

export function deleteBeneficiary(id: string, userId: string): boolean {
  const db = getDb();
  // Ensure not linked to active requested payout
  const activePayout = db
    .prepare("SELECT id FROM payout_requests WHERE beneficiary_id = ? AND status IN ('requested', 'under_review', 'processing')")
    .get(id);
  if (activePayout) {
    throw new Error("Cannot delete beneficiary with an active withdrawal in progress");
  }

  const res = db.prepare("DELETE FROM payout_beneficiaries WHERE id = ? AND user_id = ?").run(id, userId);
  return res.changes > 0;
}

// ==================== PAYOUT REQUESTS ====================

export function requestPayout(
  userId: string,
  amount: number, // in paise
  beneficiaryId: string
): { success: boolean; request?: PayoutRequest; error?: string } {
  const config = getReferralProgramConfig();
  const user = getUserById(userId);

  if (!user) {
    return { success: false, error: "User not found" };
  }

  // 1. Verification rule: email must be verified
  if (!user.email_verified) {
    return {
      success: false,
      error: "Email verification required before requesting a payout. Please verify your email first.",
    };
  }

  // 2. Threshold validation
  if (amount < config.minWithdrawalThreshold) {
    const formattedThreshold = (config.minWithdrawalThreshold / 100).toLocaleString("en-IN");
    return {
      success: false,
      error: `Minimum withdrawal amount is ₹${formattedThreshold}`,
    };
  }

  if (amount > config.maxWithdrawalPerRequest) {
    const formattedMax = (config.maxWithdrawalPerRequest / 100).toLocaleString("en-IN");
    return {
      success: false,
      error: `Maximum withdrawal per request is ₹${formattedMax}`,
    };
  }

  // 3. Beneficiary validation
  const beneficiary = getBeneficiaryById(beneficiaryId);
  if (!beneficiary || beneficiary.user_id !== userId) {
    return { success: false, error: "Invalid beneficiary selected" };
  }

  const db = getDb();

  // 4. Concurrency Guard: Ensure user doesn't already have an unfulfilled request
  const existingActive = db
    .prepare("SELECT id FROM payout_requests WHERE user_id = ? AND status IN ('requested', 'under_review', 'processing')")
    .get(userId);

  if (existingActive) {
    return {
      success: false,
      error: "You already have an active withdrawal request under review. Please wait until it is processed.",
    };
  }

  const requestId = "pout_" + randomUUID().slice(0, 8);
  const now = Date.now();

  // 5. Lock funds atomically in wallet ledger
  const lockResult = lockFundsForWithdrawal(userId, amount, requestId);
  if (!lockResult.success) {
    return { success: false, error: lockResult.error };
  }

  // 6. Insert payout request
  db.prepare(`
    INSERT INTO payout_requests (
      id, user_id, beneficiary_id, amount, currency, status,
      rejection_reason, failure_reason, payout_reference, payout_provider,
      provider_payout_id, requested_at, reviewed_by, reviewed_at,
      processed_at, paid_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'requested', NULL, NULL, NULL, 'manual', NULL, ?, NULL, NULL, NULL, NULL, ?)
  `).run(requestId, userId, beneficiaryId, amount, config.currency, now, now);

  const request: PayoutRequest = {
    id: requestId,
    user_id: userId,
    beneficiary_id: beneficiaryId,
    amount,
    currency: config.currency,
    status: "requested",
    rejection_reason: null,
    failure_reason: null,
    payout_reference: null,
    payout_provider: "manual",
    provider_payout_id: null,
    requested_at: now,
    reviewed_by: null,
    reviewed_at: null,
    processed_at: null,
    paid_at: null,
    updated_at: now,
  };

  // 7. Dispatch notification & confirmation email
  const formattedAmount = (amount / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 });
  createNotification({
    userId,
    title: "Withdrawal Request Received",
    message: `Your request for ₹${formattedAmount} has been received and is under review by our finance team.`,
    type: "billing",
  });

  if (user.email) {
    sendPayoutRequestedEmail({
      toEmail: user.email,
      userName: user.name || "Creator",
      requestId,
      amount,
      payoutMethod: beneficiary.payout_method === "upi" ? `UPI (${beneficiary.upi_id})` : `Bank (${beneficiary.bank_account_number})`,
      currency: config.currency,
    }).catch((err) => console.error("Payout request email error:", err));
  }

  logAudit({
    actorId: userId,
    action: "payout.requested",
    target: requestId,
    details: { amount, beneficiaryId },
  });

  return { success: true, request };
}

export function getPayoutRequestById(id: string): PayoutRequest | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM payout_requests WHERE id = ?").get(id) as PayoutRequest | undefined;
  return row ?? null;
}

export function listUserPayouts(userId: string): Array<PayoutRequest & { beneficiary: PayoutBeneficiary }> {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT p.*,
        b.payout_method, b.account_holder_name, b.upi_id,
        b.bank_account_number, b.bank_ifsc, b.bank_name
      FROM payout_requests p
      JOIN payout_beneficiaries b ON p.beneficiary_id = b.id
      WHERE p.user_id = ?
      ORDER BY p.requested_at DESC
    `)
    .all(userId) as any[];

  return rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    beneficiary_id: r.beneficiary_id,
    amount: r.amount,
    currency: r.currency,
    status: r.status,
    rejection_reason: r.rejection_reason,
    failure_reason: r.failure_reason,
    payout_reference: r.payout_reference,
    payout_provider: r.payout_provider,
    provider_payout_id: r.provider_payout_id,
    requested_at: r.requested_at,
    reviewed_by: r.reviewed_by,
    reviewed_at: r.reviewed_at,
    processed_at: r.processed_at,
    paid_at: r.paid_at,
    updated_at: r.updated_at,
    beneficiary: {
      id: r.beneficiary_id,
      user_id: r.user_id,
      payout_method: r.payout_method,
      account_holder_name: r.account_holder_name,
      upi_id: r.upi_id,
      bank_account_number: r.bank_account_number,
      bank_ifsc: r.bank_ifsc,
      bank_name: r.bank_name,
      is_default: 0,
      is_verified: 1,
      created_at: 0,
      updated_at: 0,
    },
  }));
}

export function listAllPayoutRequests(options?: {
  status?: string;
  limit?: number;
  offset?: number;
}): {
  payouts: Array<PayoutRequest & { user_name: string; user_email: string | null; beneficiary: PayoutBeneficiary }>;
  total: number;
} {
  const db = getDb();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  const statusFilter = options?.status && options.status !== "all" ? options.status : null;

  const countQuery = statusFilter
    ? "SELECT COUNT(*) as count FROM payout_requests WHERE status = ?"
    : "SELECT COUNT(*) as count FROM payout_requests";

  const countRow = (statusFilter ? db.prepare(countQuery).get(statusFilter) : db.prepare(countQuery).get()) as {
    count: number;
  };
  const total = countRow?.count ?? 0;

  const dataQuery = statusFilter
    ? `
      SELECT p.*, u.name as user_name, u.email as user_email,
        b.payout_method, b.account_holder_name, b.upi_id,
        b.bank_account_number, b.bank_ifsc, b.bank_name
      FROM payout_requests p
      JOIN users u ON p.user_id = u.id
      JOIN payout_beneficiaries b ON p.beneficiary_id = b.id
      WHERE p.status = ?
      ORDER BY p.requested_at DESC
      LIMIT ? OFFSET ?
    `
    : `
      SELECT p.*, u.name as user_name, u.email as user_email,
        b.payout_method, b.account_holder_name, b.upi_id,
        b.bank_account_number, b.bank_ifsc, b.bank_name
      FROM payout_requests p
      JOIN users u ON p.user_id = u.id
      JOIN payout_beneficiaries b ON p.beneficiary_id = b.id
      ORDER BY p.requested_at DESC
      LIMIT ? OFFSET ?
    `;

  const rows = (statusFilter
    ? db.prepare(dataQuery).all(statusFilter, limit, offset)
    : db.prepare(dataQuery).all(limit, offset)) as any[];

  const payouts = rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    beneficiary_id: r.beneficiary_id,
    amount: r.amount,
    currency: r.currency,
    status: r.status,
    rejection_reason: r.rejection_reason,
    failure_reason: r.failure_reason,
    payout_reference: r.payout_reference,
    payout_provider: r.payout_provider,
    provider_payout_id: r.provider_payout_id,
    requested_at: r.requested_at,
    reviewed_by: r.reviewed_by,
    reviewed_at: r.reviewed_at,
    processed_at: r.processed_at,
    paid_at: r.paid_at,
    updated_at: r.updated_at,
    user_name: r.user_name,
    user_email: r.user_email,
    beneficiary: {
      id: r.beneficiary_id,
      user_id: r.user_id,
      payout_method: r.payout_method,
      account_holder_name: r.account_holder_name,
      upi_id: r.upi_id,
      bank_account_number: r.bank_account_number,
      bank_ifsc: r.bank_ifsc,
      bank_name: r.bank_name,
      is_default: 0,
      is_verified: 1,
      created_at: 0,
      updated_at: 0,
    },
  }));

  return { payouts, total };
}

// ==================== ADMIN ACTIONS ====================
//
// Payout state machine (any other move throws):
//   requested  -> approved | rejected
//   approved   -> processing (gateway) | paid (manual UTR) | rejected
//   processing -> paid (gateway confirmed / manual UTR) | approved (gateway failed, approval kept)
// Every move is a conditional UPDATE on the current status, so two admins (or two clicks)
// cannot both claim the same request: no double wallet refund, no double payout.

const FROM: Record<"approve" | "reject" | "manual_paid" | "gateway", PayoutStatus[]> = {
  approve: ["requested", "under_review"],
  reject: ["requested", "under_review", "approved"],
  manual_paid: ["approved", "processing"],
  gateway: ["approved"],
};

/** Atomically moves the request from one of `from` to `to`; returns the request as it was before. */
function claimTransition(
  requestId: string,
  from: PayoutStatus[],
  to: PayoutStatus,
  verb: string,
  extraSet = "",
  extraParams: Array<string | number | null> = []
): PayoutRequest {
  const db = getDb();
  const request = getPayoutRequestById(requestId);
  if (!request) throw new Error("Payout request not found");
  if (!from.includes(request.status)) {
    throw new Error(`Cannot ${verb} a payout that is ${request.status}`);
  }
  const placeholders = from.map(() => "?").join(", ");
  const res = db
    .prepare(
      `UPDATE payout_requests SET status = ?, updated_at = ?${extraSet ? ", " + extraSet : ""}
       WHERE id = ? AND status IN (${placeholders})`
    )
    .run(to, Date.now(), ...extraParams, requestId, ...from);
  if (res.changes !== 1) throw new Error(`Payout request changed meanwhile; reload and try again`);
  return request;
}

/** Puts a request back where it was when the money step after a claim failed. */
function revertTransition(requestId: string, to: PayoutStatus, back: PayoutStatus): void {
  getDb()
    .prepare("UPDATE payout_requests SET status = ?, updated_at = ? WHERE id = ? AND status = ?")
    .run(back, Date.now(), requestId, to);
}

function assertPayoutModeAllows(kind: "manual" | "gateway"): void {
  const mode = getReferralProgramConfig().payoutMode;
  if (kind === "manual" && mode === "gateway_only") throw new Error("Payout mode is gateway-only: manual payouts are disabled");
  if (kind === "gateway" && mode === "manual_only") throw new Error("Payout mode is manual-only: gateway payouts are disabled");
}

export function approvePayout(requestId: string, adminId: string): PayoutRequest {
  const now = Date.now();
  const request = claimTransition(requestId, FROM.approve, "approved", "approve", "reviewed_by = ?, reviewed_at = ?", [adminId, now]);

  logAudit({
    actorId: adminId,
    action: "payout.approved",
    target: requestId,
    details: { amount: request.amount },
  });

  return getPayoutRequestById(requestId)!;
}

export function rejectPayout(requestId: string, reason: string, adminId: string): PayoutRequest {
  const cleanReason = reason?.trim();
  if (!cleanReason) throw new Error("Rejection reason is mandatory");

  const now = Date.now();
  // 1. claim first: only one caller can move a request to rejected, so funds are released once
  const request = claimTransition(
    requestId,
    FROM.reject,
    "rejected",
    "reject",
    "rejection_reason = ?, reviewed_by = ?, reviewed_at = ?",
    [cleanReason, adminId, now]
  );

  // 2. Release reserved funds back to available balance
  try {
    releaseLockedFunds(request.user_id, request.amount, requestId, cleanReason);
  } catch (err) {
    revertTransition(requestId, "rejected", request.status);
    throw err;
  }

  // 3. Notify user
  const formattedAmount = (request.amount / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 });
  createNotification({
    userId: request.user_id,
    title: "Withdrawal Request Rejected",
    message: `Your payout request of ₹${formattedAmount} could not be approved: ${cleanReason}. Funds have been refunded to your wallet.`,
    type: "billing",
  });

  const user = getUserById(request.user_id);
  if (user?.email) {
    sendPayoutRejectedEmail({
      toEmail: user.email,
      userName: user.name || "Creator",
      requestId,
      amount: request.amount,
      reason: cleanReason,
      currency: request.currency,
    }).catch((err) => console.error("Payout rejection email error:", err));
  }

  logAudit({
    actorId: adminId,
    action: "payout.rejected",
    target: requestId,
    details: { reason: cleanReason, amount: request.amount, previousStatus: request.status },
  });

  return getPayoutRequestById(requestId)!;
}

export function processManualPayout(requestId: string, reference: string, adminId: string): PayoutRequest {
  const cleanRef = reference?.trim();
  if (!cleanRef) throw new Error("Bank/UPI transaction reference (UTR) is mandatory");
  assertPayoutModeAllows("manual");

  const now = Date.now();
  // 1. claim: approved/processing -> paid, exactly once
  const request = claimTransition(
    requestId,
    FROM.manual_paid,
    "paid",
    "mark as paid",
    `payout_reference = ?, payout_provider = 'manual',
        reviewed_by = COALESCE(reviewed_by, ?), reviewed_at = COALESCE(reviewed_at, ?),
        processed_at = ?, paid_at = ?`,
    [cleanRef, adminId, now, now, now]
  );

  // 2. Finalize funds in wallet (increments total_withdrawn)
  try {
    finalizeWithdrawalPaid(request.user_id, request.amount, requestId, cleanRef);
  } catch (err) {
    revertTransition(requestId, "paid", request.status);
    throw err;
  }

  // 3. Notify user
  const formattedAmount = (request.amount / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 });
  const beneficiary = getBeneficiaryById(request.beneficiary_id);
  const methodLabel = beneficiary?.payout_method === "upi" ? `UPI (${beneficiary.upi_id})` : `Bank Account`;

  createNotification({
    userId: request.user_id,
    title: "Payout Dispatched!",
    message: `₹${formattedAmount} has been successfully paid to your ${methodLabel}. UTR / Ref: ${cleanRef}.`,
    type: "billing",
  });

  const user = getUserById(request.user_id);
  if (user?.email) {
    sendPayoutApprovedEmail({
      toEmail: user.email,
      userName: user.name || "Creator",
      requestId,
      amount: request.amount,
      payoutMethod: methodLabel,
      reference: cleanRef,
      currency: request.currency,
    }).catch((err) => console.error("Payout paid email error:", err));
  }

  logAudit({
    actorId: adminId,
    action: "payout.manual_paid",
    target: requestId,
    details: { reference: cleanRef, amount: request.amount },
  });

  return getPayoutRequestById(requestId)!;
}

export async function processGatewayPayout(
  requestId: string,
  adminId: string
): Promise<{ success: boolean; request: PayoutRequest; error?: string }> {
  assertPayoutModeAllows("gateway");
  const db = getDb();
  const existing = getPayoutRequestById(requestId);
  if (!existing) throw new Error("Payout request not found");
  const beneficiary = getBeneficiaryById(existing.beneficiary_id);
  if (!beneficiary) throw new Error("Beneficiary record not found");

  // 1. claim approved -> processing: a second click or a second admin gets an error here
  const request = claimTransition(requestId, FROM.gateway, "processing", "dispatch", "failure_reason = NULL");

  // 2. Call RazorpayX adapter (sends an idempotency key = request id)
  const result = await executeRazorpayXPayout({ request, beneficiary });
  const now = Date.now();

  if (result.success && result.status === "processed" && result.referenceId) {
    finalizeWithdrawalPaid(request.user_id, request.amount, requestId, result.referenceId);

    db.prepare(`
      UPDATE payout_requests
      SET status = 'paid', payout_reference = ?, payout_provider = ?,
          provider_payout_id = ?, processed_at = ?, paid_at = ?, updated_at = ?
      WHERE id = ? AND status = 'processing'
    `).run(result.referenceId, result.isSandbox ? "razorpayx_sandbox" : "razorpayx", result.payoutId ?? null, now, now, now, requestId);

    const formattedAmount = (request.amount / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 });
    createNotification({
      userId: request.user_id,
      title: "Payout Dispatched via Gateway",
      message: `₹${formattedAmount} was sent via RazorpayX (Ref: ${result.referenceId}).`,
      type: "billing",
    });

    logAudit({
      actorId: adminId,
      action: "payout.gateway_paid",
      target: requestId,
      details: { reference: result.referenceId, payoutId: result.payoutId, isSandbox: result.isSandbox },
    });

    return { success: true, request: getPayoutRequestById(requestId)! };
  }

  if (result.success) {
    // accepted but not settled yet (e.g. queued for low balance): stays 'processing' until confirmed;
    // an admin can then record the bank UTR with "mark paid"
    db.prepare(`
      UPDATE payout_requests SET payout_provider = 'razorpayx', provider_payout_id = ?, processed_at = ?, updated_at = ?
      WHERE id = ? AND status = 'processing'
    `).run(result.payoutId ?? null, now, now, requestId);
    logAudit({
      actorId: adminId,
      action: "payout.gateway_queued",
      target: requestId,
      details: { payoutId: result.payoutId, status: result.status },
    });
    return { success: true, request: getPayoutRequestById(requestId)! };
  }

  // failed: back to approved (the approval stands), keep the reason for the admin to see
  db.prepare(`
    UPDATE payout_requests
    SET status = 'approved', failure_reason = ?, updated_at = ?
    WHERE id = ? AND status = 'processing'
  `).run(result.error || "Gateway execution failed", now, requestId);
  logAudit({
    actorId: adminId,
    action: "payout.gateway_failed",
    target: requestId,
    details: { error: result.error },
  });

  return {
    success: false,
    request: getPayoutRequestById(requestId)!,
    error: result.error || "Gateway dispatch failed",
  };
}

export function bulkApprovePayouts(requestIds: string[], adminId: string): { approved: number; failed: number } {
  let approved = 0;
  let failed = 0;
  for (const id of requestIds) {
    try {
      approvePayout(id, adminId);
      approved++;
    } catch {
      failed++;
    }
  }
  return { approved, failed };
}

export function bulkRejectPayouts(
  requestIds: string[],
  reason: string,
  adminId: string
): { rejected: number; failed: number } {
  let rejected = 0;
  let failed = 0;
  // de-duplicate: the same id twice in one request must not be processed twice
  for (const id of new Set(requestIds)) {
    try {
      rejectPayout(id, reason, adminId);
      rejected++;
    } catch {
      failed++;
    }
  }
  return { rejected, failed };
}
