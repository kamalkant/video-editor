import { requireAdmin } from "@/lib/auth/admin-guard";
import { NextResponse } from "next/server";
import { listEmailLogs } from "@/lib/db/email-logs";

export const runtime = "nodejs";

export async function GET() {
  try {
    const guard = await requireAdmin();
    if (guard.denied) return guard.denied;

    const logs = listEmailLogs(100);
    return NextResponse.json({ ok: true, logs });
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message || "Failed to fetch email logs" }, { status: 500 });
  }
}
