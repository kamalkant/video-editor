import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPlanById } from "@/lib/db/plans";
import { validateCoupon } from "@/lib/db/coupons";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    const body = await req.json();
    const { code, planId } = body || {};

    if (!code || !planId) {
      return NextResponse.json({ ok: false, message: "Code and Plan ID are required" }, { status: 400 });
    }

    const plan = getPlanById(planId);
    if (!plan) {
      return NextResponse.json({ ok: false, message: "Plan not found" }, { status: 400 });
    }

    const result = validateCoupon(code, plan.price_amount, user?.id, 0, plan.currency);

    return NextResponse.json({
      ok: result.valid,
      ...result,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message || "Failed to validate coupon" }, { status: 500 });
  }
}
