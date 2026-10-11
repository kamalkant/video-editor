import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  addBeneficiary,
  listUserBeneficiaries,
  deleteBeneficiary,
  requestPayout,
  listUserPayouts,
} from "@/lib/referrals/payouts";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const beneficiaries = listUserBeneficiaries(user.id);
    const payouts = listUserPayouts(user.id);

    return NextResponse.json({
      ok: true,
      beneficiaries,
      payouts,
    });
  } catch (err: any) {
    console.error("User payouts GET error:", err);
    return NextResponse.json({ ok: false, message: err?.message || "Failed to load payouts" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const action = body?.action || "request_withdrawal";

    if (action === "add_beneficiary") {
      const res = addBeneficiary(user.id, {
        payoutMethod: body.payoutMethod,
        accountHolderName: body.accountHolderName,
        upiId: body.upiId,
        bankAccountNumber: body.bankAccountNumber,
        bankIfsc: body.bankIfsc,
        bankName: body.bankName,
      });

      if (!res.success) {
        return NextResponse.json({ ok: false, message: res.error }, { status: 400 });
      }

      return NextResponse.json({
        ok: true,
        beneficiary: res.beneficiary,
        message: "Payout beneficiary added successfully",
      });
    }

    if (action === "request_withdrawal") {
      const amount = parseInt(body.amount, 10);
      const beneficiaryId = body.beneficiaryId;

      if (!amount || isNaN(amount) || amount <= 0) {
        return NextResponse.json({ ok: false, message: "Valid withdrawal amount is required" }, { status: 400 });
      }

      if (!beneficiaryId) {
        return NextResponse.json({ ok: false, message: "Please select a payout beneficiary" }, { status: 400 });
      }

      const res = requestPayout(user.id, amount, beneficiaryId);
      if (!res.success) {
        return NextResponse.json({ ok: false, message: res.error }, { status: 400 });
      }

      return NextResponse.json({
        ok: true,
        request: res.request,
        message: "Withdrawal request submitted successfully and is under review",
      });
    }

    return NextResponse.json({ ok: false, message: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    console.error("User payouts POST error:", err);
    return NextResponse.json({ ok: false, message: err?.message || "Failed to process request" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const beneficiaryId = searchParams.get("id");

    if (!beneficiaryId) {
      return NextResponse.json({ ok: false, message: "Beneficiary ID is required" }, { status: 400 });
    }

    deleteBeneficiary(beneficiaryId, user.id);
    return NextResponse.json({ ok: true, message: "Beneficiary removed successfully" });
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message || "Failed to remove beneficiary" }, { status: 400 });
  }
}
