import { describe, expect, it, vi } from "vitest";
import type { SafeUser } from "@/lib/db/schema";

const auth = vi.hoisted(() => ({ user: null as SafeUser | null }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => auth.user }));

import { makeUser } from "../admin-helpers";
import { aiCost, FREE_HEADER, meteredAi } from "@/lib/ai/meter";
import { aiKey } from "@/lib/ai/keys";
import { setUserCredential } from "@/lib/ai/user-keys";
import { deductAICredits, getUserAICredits, grantAICredits } from "@/lib/db/ai-credits";
import { setAdminSetting } from "@/lib/db/admin-settings";
import { parseAiCosts } from "@/lib/ai/costs";

const ok = () => Promise.resolve(Response.json({ ok: true }));
const balance = (id: string) => getUserAICredits(id).balance;

describe("AI credits", () => {
  it("nobody signed in: 401, the AI is never called", async () => {
    auth.user = null;
    const run = vi.fn(ok);
    const res = await meteredAi("image", "gemini", run);
    expect(res.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("a user on the platform key pays the tool's credits, and sees what's left", async () => {
    const u = makeUser();
    auth.user = u;
    const before = balance(u.id);
    const res = await meteredAi("image", "gemini", ok);
    expect(res.status).toBe(200);
    expect(balance(u.id)).toBe(before - aiCost("image"));
    expect(res.headers.get("X-AI-Credits-Charged")).toBe(String(aiCost("image")));
    expect(res.headers.get("X-AI-Credits-Left")).toBe(String(before - aiCost("image")));
  });

  it("out of credits: 402 with an upgrade message, and the AI is not called", async () => {
    const u = makeUser();
    auth.user = u;
    deductAICredits(u.id, balance(u.id), "test: spend all");
    const run = vi.fn(ok);
    const res = await meteredAi("video", "gemini", run);
    expect(res.status).toBe(402);
    expect((await res.json()).error.message).toMatch(/Upgrade your plan in Billing/);
    expect(run).not.toHaveBeenCalled();
  });

  it("a failed AI request gives the credits back; so does a reused (cached) result", async () => {
    const u = makeUser();
    auth.user = u;
    const before = balance(u.id);
    const failed = await meteredAi("image", "gemini", () => Promise.resolve(Response.json({ error: { message: "no" } }, { status: 502 })));
    expect(failed.status).toBe(502);
    expect(balance(u.id)).toBe(before);
    await expect(meteredAi("image", "gemini", () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(balance(u.id)).toBe(before);
    const cached = await meteredAi("subtitles", "gemini", () => Promise.resolve(Response.json({}, { headers: { [FREE_HEADER]: "1" } })));
    expect(cached.status).toBe(200);
    expect(balance(u.id)).toBe(before);
  });

  it("with their own key: no credits, and the AI code gets that key", async () => {
    const u = makeUser();
    auth.user = u;
    setUserCredential(u.id, "gemini", "AIza-own-key-for-test-123456");
    const before = balance(u.id);
    let seen: string | null = null;
    const res = await meteredAi("video", "gemini", async () => {
      seen = aiKey("gemini");
      return Response.json({ ok: true });
    });
    expect(res.status).toBe(200);
    expect(seen).toBe("AIza-own-key-for-test-123456");
    expect(balance(u.id)).toBe(before);
  });

  it("super admins are never charged", async () => {
    const root = makeUser("super_admin");
    auth.user = root;
    const before = balance(root.id);
    await meteredAi("video", "gemini", ok);
    expect(balance(root.id)).toBe(before);
  });

  it("subtitles cost per started minute; admins can change the prices", async () => {
    setAdminSetting("ai_credit_costs", "{}");
    expect(aiCost("subtitles", 2.1)).toBe(3);
    setAdminSetting("ai_credit_costs", JSON.stringify({ video: 50, image: -3 }));
    expect(aiCost("video")).toBe(50);
    expect(aiCost("image")).toBe(2); // a bad price is ignored
    expect(parseAiCosts("not json").video).toBe(20);
    setAdminSetting("ai_credit_costs", "{}");
  });

  it("two requests at once can't spend the same credits", () => {
    const u = makeUser();
    deductAICredits(u.id, balance(u.id), "test: spend all");
    grantAICredits(u.id, 3, "test");
    const a = deductAICredits(u.id, 2, "a");
    const b = deductAICredits(u.id, 2, "b");
    expect([a.success, b.success]).toEqual([true, false]);
    expect(balance(u.id)).toBe(1);
  });
});
