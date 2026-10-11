import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getUserAICredits, listAICreditTransactions } from "@/lib/db/ai-credits";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const ledger = getUserAICredits(user.id);
    const transactions = listAICreditTransactions(user.id, 50);

    return NextResponse.json({
      ok: true,
      ledger,
      transactions,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message || "Failed to fetch AI credits" }, { status: 500 });
  }
}
