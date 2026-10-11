import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { getAdminSetting } from "@/lib/db/admin-settings";

export function isSandboxMode(): boolean {
  const adminSandbox = getAdminSetting("razorpay_sandbox_mode", "");
  if (adminSandbox === "true") return true;
  if (adminSandbox === "false") return false;
  return process.env.RAZORPAY_SANDBOX === "true" || !process.env.RAZORPAY_KEY_ID;
}

export function getRazorpayKeys() {
  return {
    keyId: process.env.RAZORPAY_KEY_ID || "rzp_test_mock_vdo_key",
    keySecret: process.env.RAZORPAY_KEY_SECRET || "rzp_secret_mock_vdo_secret",
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || "rzp_webhook_mock_vdo_secret",
  };
}

/**
 * Why live payments can't work with the keys in .env.local, or null when they look right.
 * (Catches the usual slips: the secret left out, or copied as the dashboard's masked "******".)
 */
export function razorpayKeyProblem(): string | null {
  const id = process.env.RAZORPAY_KEY_ID?.trim() ?? "";
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim() ?? "";
  if (!/^rzp_(test|live)_\w+$/.test(id)) return "RAZORPAY_KEY_ID is missing or isn't a Razorpay key (rzp_test_… / rzp_live_…).";
  if (!secret) return "RAZORPAY_KEY_SECRET is not set.";
  if (/^\*+$/.test(secret) || secret.includes("*")) return "RAZORPAY_KEY_SECRET is the masked \"*****\" text from the dashboard, not the secret. Regenerate the key there and copy the secret shown.";
  if (/\s/.test(secret) || secret.length < 16) return "RAZORPAY_KEY_SECRET doesn't look like a Razorpay key secret.";
  return null;
}

export type CreateOrderParams = {
  amount: number; // in smallest unit (e.g. paise)
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
};

export type RazorpayOrderResult = {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
  isSandbox: boolean;
};

export async function createRazorpayOrder(params: CreateOrderParams): Promise<RazorpayOrderResult> {
  const sandbox = isSandboxMode();
  const currency = params.currency || "INR";

  if (sandbox) {
    const mockOrderId = "order_sb_" + randomBytes(8).toString("hex");
    return {
      id: mockOrderId,
      amount: params.amount,
      currency,
      receipt: params.receipt,
      status: "created",
      isSandbox: true,
    };
  }

  const problem = razorpayKeyProblem();
  if (problem) throw new Error(`Payments aren't set up: ${problem}`);
  const { keyId, keySecret } = getRazorpayKeys();
  const authHeader = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: params.amount,
      currency,
      receipt: params.receipt,
      notes: params.notes,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Razorpay Create Order Error:", res.status, errText);
    throw new Error(`Failed to create Razorpay order: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return {
    id: data.id,
    amount: data.amount,
    currency: data.currency,
    receipt: data.receipt,
    status: data.status,
    isSandbox: false,
  };
}

export function generateExpectedSignature(orderId: string, paymentId: string, secret?: string): string {
  const keySecret = secret || getRazorpayKeys().keySecret;
  return createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
}

export function verifyPaymentSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  if (isSandboxMode() && params.orderId.startsWith("order_sb_")) {
    // In sandbox mode, verify using the mock secret or standard HMAC
    const expected = generateExpectedSignature(params.orderId, params.paymentId);
    return params.signature === expected || params.signature === "sandbox_verified_signature";
  }

  const { keySecret } = getRazorpayKeys();
  const expected = createHmac("sha256", keySecret)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest("hex");

  return params.signature === expected;
}

export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secretOverride?: string
): boolean {
  const secret = secretOverride || getRazorpayKeys().webhookSecret;
  if (!secret || !signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return signature === expected;
}

export async function processRazorpayRefund(
  paymentId: string,
  amount: number,
  notes?: Record<string, string>
): Promise<{ id: string; amount: number; status: string; isSandbox: boolean }> {
  if (isSandboxMode() || paymentId.startsWith("pay_sb_")) {
    return {
      id: "rfnd_sb_" + randomBytes(8).toString("hex"),
      amount,
      status: "processed",
      isSandbox: true,
    };
  }

  const { keyId, keySecret } = getRazorpayKeys();
  const authHeader = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount, notes }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Razorpay Refund Error:", res.status, errText);
    throw new Error(`Razorpay refund failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return {
    id: data.id,
    amount: data.amount,
    status: data.status,
    isSandbox: false,
  };
}
