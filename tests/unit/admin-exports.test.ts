import { describe, expect, it, vi } from "vitest";
import type { SafeUser } from "@/lib/db/schema";

const auth = vi.hoisted(() => ({ user: null as SafeUser | null }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => auth.user }));

import { idParams, jsonRequest, makeCapturedPayment, makeUser } from "../admin-helpers";
import { GET as exportGET } from "@/app/api/admin/export/[kind]/route";
import { GET as invoiceGET } from "@/app/api/admin/payments/[id]/invoice/route";
import { GET as userInvoiceGET } from "@/app/api/user/invoices/route";
import { toCsv } from "@/lib/admin/csv";
import { listAuditLogs } from "@/lib/db/audit";
import { invoiceDataForPayment } from "@/lib/payments/invoices";
import { createUser } from "@/lib/db/users";

const kind = (k: string) => ({ params: Promise.resolve({ kind: k }) });

describe("CSV", () => {
  it("quotes commas, quotes and new lines; defuses spreadsheet formulas; keeps negative numbers", () => {
    const csv = toCsv([{ a: 'He said "hi", ok', b: "=HYPERLINK(1)", c: -12.5, d: "line\nbreak" }], [
      ["A", (r) => r.a],
      ["B", (r) => r.b],
      ["C", (r) => r.c],
      ["D", (r) => r.d],
    ]);
    expect(csv.startsWith("﻿A,B,C,D\r\n")).toBe(true);
    expect(csv).toContain('"He said ""hi"", ok",\'=HYPERLINK(1),-12.5,"line\nbreak"');
  });
});

describe("admin CSV exports", () => {
  it("admins only; unknown kinds are 404", async () => {
    auth.user = makeUser("user");
    expect((await exportGET(jsonRequest("/api/admin/export/users.csv"), kind("users.csv"))).status).toBe(403);
    auth.user = makeUser("admin");
    expect((await exportGET(jsonRequest("/api/admin/export/secrets.csv"), kind("secrets.csv"))).status).toBe(404);
  });

  it("payments CSV: one row per payment in rupees, a download, and an audit entry", async () => {
    const admin = makeUser("admin");
    auth.user = admin;
    const u = makeUser();
    const pay = makeCapturedPayment(u.id, 117882);
    const res = await exportGET(jsonRequest("/api/admin/export/payments.csv"), kind("payments.csv"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toMatch(/attachment; filename="vdo-payments-\d{4}-\d{2}-\d{2}\.csv"/);
    const text = await res.text();
    const line = text.split("\r\n").find((l) => l.includes(pay.razorpay_order_id))!;
    expect(line).toContain(u.email!);
    expect(line).toContain("1178.82");
    expect(line).toContain("captured");
    expect(listAuditLogs(5, 0, { actorId: admin.id }).logs[0].action).toBe("admin.export_csv");
  });

  it("a date range limits the rows; every kind downloads", async () => {
    auth.user = makeUser("admin");
    const u = makeUser();
    const res = await exportGET(jsonRequest(`/api/admin/export/users.csv?from=${Date.now() + 60_000}`), kind("users.csv"));
    expect((await res.text()).trim().split("\r\n")).toHaveLength(1); // the header only
    for (const k of ["refunds", "payouts", "users"]) {
      const r = await exportGET(jsonRequest(`/api/admin/export/${k}.csv`), kind(`${k}.csv`));
      expect(r.status).toBe(200);
    }
    const all = await (await exportGET(jsonRequest("/api/admin/export/users.csv"), kind("users.csv"))).text();
    expect(all).toContain(u.email!);
    expect(all).not.toContain("password");
  });
});

describe("GST invoices", () => {
  it("the amount paid includes GST: taxable value + tax add up to it", () => {
    const pay = { id: "pay_1", amount: 117882, currency: "INR", created_at: Date.now(), invoice_number: "INV-1", razorpay_payment_id: "p", razorpay_order_id: "o", status: "captured" } as never;
    const d = invoiceDataForPayment(pay, { name: "A", email: "a@x" }, { name: "Pro", interval: "monthly", price_amount: 99900, tax_rate_percent: 18 });
    expect(d.baseAmount - d.discountAmount + d.taxAmount).toBe(117882);
    expect(d.taxAmount).toBe(17982);
    expect(d.discountAmount).toBe(0);
    const discounted = invoiceDataForPayment({ ...(pay as object), amount: 58941 } as never, { name: "A", email: null }, { name: "Pro", interval: "monthly", price_amount: 99900, tax_rate_percent: 18 }, "HALF");
    expect(discounted.discountAmount).toBe(99900 - 49950);
    expect(discounted.couponCode).toBe("HALF");
    expect(discounted.baseAmount - discounted.discountAmount + discounted.taxAmount).toBe(58941);
  });

  it("a name with markup is escaped, and the page may not run scripts (admin + customer)", async () => {
    const evil = createUser({ email: `evil-${Date.now()}@test.local`, name: '<img src=x onerror="alert(1)">', password: "Secret#123", emailVerified: true });
    const pay = makeCapturedPayment(evil.id, 117882);
    auth.user = makeUser("admin");
    const res = await invoiceGET(jsonRequest(`/api/admin/payments/${pay.id}/invoice`), idParams(pay.id));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    const html = await res.text();
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");

    auth.user = evil;
    const mine = await userInvoiceGET(jsonRequest(`/api/user/invoices?id=${pay.id}&download=true`));
    expect(mine.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    expect(await mine.text()).not.toContain("<img src=x");
  });

  it("admin invoice: 404 for an unknown payment; users can't open someone else's", async () => {
    auth.user = makeUser("admin");
    expect((await invoiceGET(jsonRequest("/api/admin/payments/nope/invoice"), idParams("nope"))).status).toBe(404);
    const owner = makeUser();
    const pay = makeCapturedPayment(owner.id, 1000);
    auth.user = makeUser();
    expect((await userInvoiceGET(jsonRequest(`/api/user/invoices?id=${pay.id}&download=true`))).status).toBe(404);
  });
});
