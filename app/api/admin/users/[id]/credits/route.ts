import { requireAdmin } from "@/lib/auth/admin-guard";
import { NextResponse } from "next/server";
import { getUserAICredits, grantAICredits, deductAICredits, listAICreditTransactions } from "@/lib/db/ai-credits";
import { logAudit } from "@/lib/db/audit";
import { getUserById } from "@/lib/db/users";

export const runtime = "nodejs";

const MAX_CREDIT_ADJUSTMENT = 1_000_000;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireAdmin();
    if (guard.denied) return guard.denied;

    const { id } = await params;
    if (!getUserById(id)) return NextResponse.json({ ok: false, message: "User not found" }, { status: 404 });
    const ledger = getUserAICredits(id);
    const history = listAICreditTransactions(id, 20);

    return NextResponse.json({ ok: true, ledger, history });
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message || "Failed to fetch credits" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireAdmin();
    if (guard.denied) return guard.denied;
    const user = guard.user;

    const { id } = await params;
    if (!getUserById(id)) return NextResponse.json({ ok: false, message: "User not found" }, { status: 404 });
    const body = await req.json();
    const amount = Number(body?.amount);
    const reason = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 300) : "Admin credit grant";

    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > MAX_CREDIT_ADJUSTMENT) {
      return NextResponse.json(
        { ok: false, message: `Amount must be a non-zero whole number between -${MAX_CREDIT_ADJUSTMENT} and ${MAX_CREDIT_ADJUSTMENT}` },
        { status: 400 }
      );
    }

    let ledger;
    if (amount > 0) {
      ledger = grantAICredits(id, amount, reason);
    } else {
      const res = deductAICredits(id, Math.abs(amount), reason);
      if (!res.success) return NextResponse.json({ ok: false, message: res.error }, { status: 400 });
      ledger = getUserAICredits(id);
    }

    logAudit({
      actorId: user.id,
      action: "user.ai_credits_adjusted",
      target: id,
      details: { amount, reason, newBalance: ledger.balance },
    });

    return NextResponse.json({ ok: true, ledger });
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message || "Credit adjustment failed" }, { status: 500 });
  }
}
