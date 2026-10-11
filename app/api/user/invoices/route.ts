import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { listUserPayments, getPaymentById } from "@/lib/db/payments";
import { INVOICE_HEADERS, invoiceFileName, invoiceHtmlForPayment } from "@/lib/payments/invoices";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const invoiceId = searchParams.get("id");
    const download = searchParams.get("download") === "true";

    if (invoiceId) {
      const payment = getPaymentById(invoiceId);
      if (!payment || payment.user_id !== user.id) {
        return NextResponse.json({ ok: false, message: "Invoice not found" }, { status: 404 });
      }

      const html = invoiceHtmlForPayment(payment, user);
      if (download) {
        return new NextResponse(html, {
          headers: { ...INVOICE_HEADERS, "Content-Disposition": `inline; filename="${invoiceFileName(payment)}"` },
        });
      }

      return NextResponse.json({ ok: true, html, payment });
    }

    const payments = listUserPayments(user.id);
    return NextResponse.json({ ok: true, payments });
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message || "Failed to fetch invoices" }, { status: 500 });
  }
}
