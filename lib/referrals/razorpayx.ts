import "server-only";
import { randomBytes } from "node:crypto";
import { getReferralProgramConfig } from "./config";
import { isSandboxMode } from "@/lib/payments/razorpay";
import type { PayoutBeneficiary, PayoutRequest } from "@/lib/db/schema";

export type RazorpayXPayoutResult = {
  success: boolean;
  payoutId?: string;
  referenceId?: string;
  status: "processed" | "queued" | "failed";
  isSandbox: boolean;
  error?: string;
};

/**
 * Checks if live RazorpayX credentials are provided and ready.
 */
export function isRazorpayXConfigured(): boolean {
  const config = getReferralProgramConfig();
  return Boolean(config.razorpayxKeyId && config.razorpayxKeySecret && config.razorpayxAccountNumber);
}

/**
 * Executes a payout via RazorpayX API, with automated sandbox fallback for development and testing.
 */
export async function executeRazorpayXPayout(params: {
  request: PayoutRequest;
  beneficiary: PayoutBeneficiary;
}): Promise<RazorpayXPayoutResult> {
  const config = getReferralProgramConfig();
  const configured = isRazorpayXConfigured();

  // Without RazorpayX credentials, only simulate when the platform is explicitly in sandbox mode:
  // in live mode a missing config must fail loudly, never mark a payout paid with a fake UTR
  if (!configured) {
    if (!isSandboxMode()) {
      return { success: false, status: "failed", isSandbox: false, error: "RazorpayX is not configured (key id, secret and account number are required)" };
    }
    const mockPayoutId = "pout_sb_" + randomBytes(8).toString("hex");
    const mockUtr = "UTR" + Date.now() + randomBytes(2).toString("hex").toUpperCase();

    return {
      success: true,
      payoutId: mockPayoutId,
      referenceId: mockUtr,
      status: "processed",
      isSandbox: true,
    };
  }

  try {
    const authHeader =
      "Basic " + Buffer.from(`${config.razorpayxKeyId}:${config.razorpayxKeySecret}`).toString("base64");

    // 1. Create / Get Contact in RazorpayX
    const contactRes = await fetch("https://api.razorpay.com/v1/contacts", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: params.beneficiary.account_holder_name,
        type: "customer",
        reference_id: params.request.user_id,
        notes: { vdo_user_id: params.request.user_id },
      }),
    });

    if (!contactRes.ok) {
      const err = await contactRes.text();
      return { success: false, status: "failed", isSandbox: false, error: `Contact creation failed: ${err}` };
    }

    const contactData = await contactRes.json();
    const contactId = contactData.id;

    // 2. Create Fund Account
    let fundAccountPayload: any = {
      contact_id: contactId,
      account_type: params.beneficiary.payout_method === "upi" ? "vpa" : "bank_account",
    };

    if (params.beneficiary.payout_method === "upi") {
      fundAccountPayload.vpa = {
        address: params.beneficiary.upi_id,
      };
    } else {
      fundAccountPayload.bank_account = {
        name: params.beneficiary.account_holder_name,
        ifsc: params.beneficiary.bank_ifsc,
        account_number: params.beneficiary.bank_account_number,
      };
    }

    const fundRes = await fetch("https://api.razorpay.com/v1/fund_accounts", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(fundAccountPayload),
    });

    if (!fundRes.ok) {
      const err = await fundRes.text();
      return { success: false, status: "failed", isSandbox: false, error: `Fund account creation failed: ${err}` };
    }

    const fundData = await fundRes.json();
    const fundAccountId = fundData.id;

    // 3. Create Payout
    const payoutRes = await fetch("https://api.razorpay.com/v1/payouts", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        // a retried dispatch of the same request can never create a second payout
        "X-Payout-Idempotency": params.request.id,
      },
      body: JSON.stringify({
        account_number: config.razorpayxAccountNumber,
        fund_account_id: fundAccountId,
        amount: params.request.amount,
        currency: params.request.currency || "INR",
        mode: params.beneficiary.payout_method === "upi" ? "UPI" : "IMPS",
        purpose: "payout",
        queue_if_low_balance: true,
        reference_id: params.request.id,
        narration: "ViPlay Creator Payout",
      }),
    });

    if (!payoutRes.ok) {
      const err = await payoutRes.text();
      return { success: false, status: "failed", isSandbox: false, error: `RazorpayX payout failed: ${err}` };
    }

    const payoutData = await payoutRes.json();
    return {
      success: true,
      payoutId: payoutData.id,
      referenceId: payoutData.utr || payoutData.id,
      status: payoutData.status === "processed" ? "processed" : "queued",
      isSandbox: false,
    };
  } catch (err: any) {
    return {
      success: false,
      status: "failed",
      isSandbox: false,
      error: err?.message || "Unexpected error during RazorpayX payout dispatch",
    };
  }
}
