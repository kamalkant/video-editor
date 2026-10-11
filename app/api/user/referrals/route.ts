import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getOrCreateReferralCode, recordReferralCodeClick } from "@/lib/referrals/codes";
import { listUserReferrals } from "@/lib/referrals/attribution";
import { getReferralProgramConfig } from "@/lib/referrals/config";

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

    const refCode = getOrCreateReferralCode(user.id);
    const referralsData = listUserReferrals(user.id, limit, offset);
    const config = getReferralProgramConfig();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const referralLink = `${appUrl}/signup?ref=${refCode.code}`;

    const conversionRate =
      refCode.clicks > 0 ? ((refCode.conversions / refCode.clicks) * 100).toFixed(1) : "0.0";

    return NextResponse.json({
      ok: true,
      programEnabled: config.enabled,
      code: refCode.code,
      referralLink,
      clicks: refCode.clicks,
      signups: refCode.signups,
      conversions: refCode.conversions,
      conversionRate: `${conversionRate}%`,
      config: {
        rewardType: config.rewardType,
        rewardValue: config.rewardValue,
        holdingPeriodDays: config.holdingPeriodDays,
        currency: config.currency,
      },
      referrals: referralsData.referrals,
      totalReferrals: referralsData.total,
    });
  } catch (err: any) {
    console.error("User referrals GET error:", err);
    return NextResponse.json({ ok: false, message: err?.message || "Failed to load referrals" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action, code } = body;

    if (action === "record_click" && code) {
      recordReferralCodeClick(code);
      return NextResponse.json({ ok: true, message: "Click recorded" });
    }

    return NextResponse.json({ ok: false, message: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message || "Error" }, { status: 500 });
  }
}
