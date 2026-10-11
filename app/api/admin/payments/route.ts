import { NextResponse } from "next/server";
import { listAllPayments } from "@/lib/db/payments";
import { pageParams, requireAdmin } from "@/lib/auth/admin-guard";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const guard = await requireAdmin();
    if (guard.denied) return guard.denied;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "all";
    const data = listAllPayments({ status, ...pageParams(searchParams) });
    return NextResponse.json({ ok: true, ...data });
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message || "Failed to fetch payments" }, { status: 500 });
  }
}
