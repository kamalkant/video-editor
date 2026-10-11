import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getUserSubscriptionWithPlan, cancelSubscription } from "@/lib/db/subscriptions";
import { getUserAICredits } from "@/lib/db/ai-credits";
import { listUserDevices } from "@/lib/db/devices";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const { subscription, plan } = getUserSubscriptionWithPlan(user.id);
    const aiCredits = getUserAICredits(user.id);
    const devices = listUserDevices(user.id);

    return NextResponse.json({
      ok: true,
      subscription,
      plan,
      aiCredits,
      devicesCount: devices.length,
      deviceLimit: plan.device_limit,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message || "Failed to fetch subscription" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const immediate = Boolean(body?.immediate);

    const cancelled = cancelSubscription(user.id, immediate);
    if (!cancelled) {
      return NextResponse.json({ ok: false, message: "No active subscription to cancel" }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: immediate ? "Subscription cancelled immediately" : "Subscription will cancel at end of current period",
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message || "Failed to cancel subscription" }, { status: 500 });
  }
}
