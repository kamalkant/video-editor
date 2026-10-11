import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getUserWallet, maturePendingRewards, listWalletTransactions } from "@/lib/referrals/wallet";
import { getReferralProgramConfig } from "@/lib/referrals/config";
import { getUserById } from "@/lib/db/users";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Auto-mature any unlocked pending rewards for this user
    maturePendingRewards(user.id);

    const fullUser = getUserById(user.id);
    const wallet = getUserWallet(user.id);
    const transactionsData = listWalletTransactions(user.id, limit, offset);
    const config = getReferralProgramConfig();

    const minThreshold = config.minWithdrawalThreshold;
    const progressPercent = Math.min(100, Math.floor((wallet.available_balance / minThreshold) * 100));
    const amountNeeded = Math.max(0, minThreshold - wallet.available_balance);

    return NextResponse.json({
      ok: true,
      wallet: {
        currency: wallet.currency,
        availableBalance: wallet.available_balance,
        pendingBalance: wallet.pending_balance,
        totalEarned: wallet.total_earned,
        totalWithdrawn: wallet.total_withdrawn,
      },
      threshold: {
        minWithdrawalThreshold: minThreshold,
        maxWithdrawalPerRequest: config.maxWithdrawalPerRequest,
        progressPercent,
        amountNeeded,
        isEligible: wallet.available_balance >= minThreshold && Boolean(fullUser?.email_verified),
        emailVerified: Boolean(fullUser?.email_verified),
      },
      transactions: transactionsData.transactions,
      totalTransactions: transactionsData.total,
    });
  } catch (err: any) {
    console.error("User wallet GET error:", err);
    return NextResponse.json({ ok: false, message: err?.message || "Failed to load wallet" }, { status: 500 });
  }
}
