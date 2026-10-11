import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SafeUser } from "@/lib/db/schema";

const auth = vi.hoisted(() => ({ user: null as SafeUser | null }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => auth.user }));

import { idParams, jsonRequest, makeUser } from "../admin-helpers";
import { getDb } from "@/lib/db";
import { createBulkJob, generateBulkJobReportCsv, getBulkJobById, processBulkJobBatch } from "@/lib/db/bulk-jobs";
import { getUserAICredits } from "@/lib/db/ai-credits";

let CREATE: typeof import("@/app/api/admin/bulk-jobs/route").POST;
let RETRY: typeof import("@/app/api/admin/bulk-jobs/[id]/retry/route").POST;
let EXPORT: typeof import("@/app/api/admin/bulk-jobs/export/route").GET;
let admin: SafeUser;

beforeAll(async () => {
  CREATE = (await import("@/app/api/admin/bulk-jobs/route")).POST;
  RETRY = (await import("@/app/api/admin/bulk-jobs/[id]/retry/route")).POST;
  EXPORT = (await import("@/app/api/admin/bulk-jobs/export/route")).GET;
  admin = makeUser("admin");
});

const create = async (body: unknown) => {
  auth.user = admin;
  const res = await CREATE(jsonRequest("/api/admin/bulk-jobs", "POST", body));
  return { res, data: await res.json() };
};

describe("bulk job targeting", () => {
  it('"All users" targets every account, not just the first page of 25', async () => {
    for (let i = 0; i < 30; i++) makeUser();
    const everyone = (getDb().prepare("SELECT COUNT(*) as n FROM users WHERE status != 'deleted'").get() as { n: number }).n;
    expect(everyone).toBeGreaterThan(25);
    const { res, data } = await create({ type: "ai_credit_grant", targetScope: "all", payload: { amount: 5 } });
    expect(res.status).toBe(200);
    expect(data.targetCount).toBe(everyone);
  });

  it("disruptive jobs never touch staff accounts or the requester", async () => {
    const otherAdmin = makeUser("admin");
    const { data } = await create({ type: "user_status", targetScope: "all", payload: { status: "suspended" } });
    const ids: string[] = JSON.parse(getBulkJobById(data.job.id)!.payload).targetUserIds;
    expect(ids).not.toContain(admin.id);
    expect(ids).not.toContain(otherAdmin.id);
    const roles = getDb()
      .prepare(`SELECT DISTINCT role FROM users WHERE id IN (${ids.map(() => "?").join(",")})`)
      .all(...ids) as Array<{ role: string }>;
    expect(roles.map((r) => r.role)).toEqual(["user"]);
  });

  it.each([
    ["an unknown type", { type: "plan_migration", targetScope: "all", payload: {} }],
    ["no target", { type: "force_logout", payload: {} }],
    ["a huge credit grant", { type: "ai_credit_grant", targetScope: "all", payload: { amount: 10_000_000 } }],
    ["a fractional device limit", { type: "user_device_override", targetScope: "all", payload: { maxDevices: 1.5 } }],
  ])("rejects %s", async (_label, body) => {
    expect((await create(body)).res.status).toBe(400);
  });
});

describe("bulk job execution", () => {
  it("two runners on the same job never process a batch twice", async () => {
    const users = [makeUser(), makeUser(), makeUser(), makeUser()];
    const job = createBulkJob({ type: "ai_credit_grant", targetUserIds: users.map((u) => u.id), payload: { amount: 7 }, batchSize: 2, createdBy: admin.id });
    const before = users.map((u) => getUserAICredits(u.id).balance);
    await Promise.all([processBulkJobBatch(job.id), processBulkJobBatch(job.id), processBulkJobBatch(job.id), processBulkJobBatch(job.id)]);
    await processBulkJobBatch(job.id);
    const after = users.map((u) => getUserAICredits(u.id).balance);
    expect(after.map((b, i) => b - before[i])).toEqual([7, 7, 7, 7]);
    const done = getBulkJobById(job.id)!;
    expect(done).toMatchObject({ status: "completed", processed_items: 4, successful_items: 4, failed_items: 0 });
  });

  it("an unsupported type fails its items instead of reporting fake success", async () => {
    const u = makeUser();
    const job = createBulkJob({ type: "plan_migration", targetUserIds: [u.id], payload: {}, createdBy: admin.id });
    const done = await processBulkJobBatch(job.id);
    expect(done).toMatchObject({ status: "failed", successful_items: 0, failed_items: 1 });
  });

  it("Retry creates a new job for only the failed users", async () => {
    const good = makeUser();
    const job = createBulkJob({ type: "ai_credit_grant", targetUserIds: [good.id, "missing-user-id"], payload: { amount: 3 }, createdBy: admin.id });
    await processBulkJobBatch(job.id);
    expect(getBulkJobById(job.id)).toMatchObject({ successful_items: 1, failed_items: 1 });

    auth.user = admin;
    const res = await RETRY(jsonRequest(`/api/admin/bulk-jobs/${job.id}/retry`, "POST"), idParams(job.id));
    expect(res.status).toBe(200);
    const retry = (await res.json()).job;
    expect(retry.id).not.toBe(job.id);
    expect(JSON.parse(retry.payload)).toMatchObject({ targetUserIds: ["missing-user-id"], amount: 3, retryOf: job.id });

    const clean = createBulkJob({ type: "ai_credit_grant", targetUserIds: [good.id], payload: { amount: 1 }, createdBy: admin.id });
    await processBulkJobBatch(clean.id);
    expect((await RETRY(jsonRequest(`/api/admin/bulk-jobs/${clean.id}/retry`, "POST"), idParams(clean.id))).status).toBe(409);
  });
});

describe("bulk job report", () => {
  it("neutralises spreadsheet formulas and 404s an unknown job", async () => {
    const job = createBulkJob({ type: "ai_credit_grant", targetUserIds: ["=HYPERLINK(\"http://evil\")"], payload: { amount: 1 }, createdBy: admin.id });
    await processBulkJobBatch(job.id);
    const csv = generateBulkJobReportCsv(job.id)!;
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(csv).not.toMatch(/^"=|,"=/m);

    auth.user = admin;
    expect((await EXPORT(jsonRequest("/api/admin/bulk-jobs/export?jobId=nope"))).status).toBe(404);
  });
});
