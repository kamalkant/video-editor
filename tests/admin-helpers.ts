import { randomUUID } from "node:crypto";
import { createUser } from "@/lib/db/users";
import { createPaymentRecord, updatePaymentStatus } from "@/lib/db/payments";
import { getDb } from "@/lib/db";
import { adminAdjustWallet } from "@/lib/referrals/wallet";
import { addBeneficiary, requestPayout } from "@/lib/referrals/payouts";
import type { Payment, PayoutRequest, SafeUser, UserRole, UserStatus } from "@/lib/db/schema";

/** A fresh account with a unique email; verified so payout rules don't get in the way. */
export function makeUser(role: UserRole = "user", status: UserStatus = "active", password = "Secret#123"): SafeUser {
  const tag = randomUUID().slice(0, 8);
  return createUser({ email: `${role}-${tag}@test.local`, name: `${role} ${tag}`, password, role, status, emailVerified: true });
}

export function jsonRequest(url: string, method = "GET", body?: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

export const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

/** The message of an admin API error, whichever of the two shapes it uses. */
export async function errorMessage(res: Response): Promise<string> {
  const data = await res.clone().json();
  return data?.error?.message ?? data?.message ?? "";
}

/** A captured (paid) sandbox payment. Amount is in paise. */
export function makeCapturedPayment(userId: string, amount: number, currency = "INR"): Payment {
  const orderId = "order_sb_" + randomUUID().slice(0, 12);
  createPaymentRecord({ userId, razorpayOrderId: orderId, amount, currency });
  return updatePaymentStatus(orderId, "captured", { razorpayPaymentId: "pay_sb_" + randomUUID().slice(0, 12) })!;
}

/** A user with ₹15,000 in the wallet and an open ₹10,000 payout request (status 'requested'). */
export function makePayoutRequest(adminId: string): { user: SafeUser; request: PayoutRequest } {
  const user = makeUser("user");
  adminAdjustWallet(user.id, 1_500_000, "Seed test balance", adminId);
  const bene = addBeneficiary(user.id, { payoutMethod: "upi", accountHolderName: "Test Holder", upiId: "tester@upi" });
  if (!bene.success) throw new Error(bene.error);
  const res = requestPayout(user.id, 1_000_000, bene.beneficiary!.id);
  if (!res.success) throw new Error(res.error);
  return { user, request: res.request! };
}

export function walletOf(userId: string) {
  return getDb().prepare("SELECT * FROM wallets WHERE user_id = ?").get(userId) as {
    available_balance: number;
    pending_balance: number;
    total_withdrawn: number;
  };
}
