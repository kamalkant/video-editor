import { adminError, requireAdmin } from "@/lib/auth/admin-guard";
import { getPaymentById } from "@/lib/db/payments";
import { getUserById } from "@/lib/db/users";
import { INVOICE_HEADERS, invoiceFileName, invoiceHtmlForPayment } from "@/lib/payments/invoices";

export const runtime = "nodejs";

/** The GST invoice of any payment (the same page the customer downloads), for admins. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  const payment = getPaymentById((await params).id);
  if (!payment) return adminError(404, "not_found", "Payment not found.");
  const customer = getUserById(payment.user_id);
  const html = invoiceHtmlForPayment(payment, { name: customer?.name ?? null, email: customer?.email ?? null });
  return new Response(html, { headers: { ...INVOICE_HEADERS, "Content-Disposition": `attachment; filename="${invoiceFileName(payment)}"` } });
}
