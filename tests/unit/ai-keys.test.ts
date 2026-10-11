import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// its own storage (never the real one)
const tmp = mkdtempSync(join(tmpdir(), "VDO-keys-"));
process.env.VDO_STORAGE = join(tmp, "storage");
delete process.env.GEMINI_FAKE;
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("AI settings: your own API keys", () => {
  it("uses the .env.local key until the settings say otherwise; save, switch off, remove", async () => {
    process.env.GEMINI_API_KEY = "AIzaENVKEY000000000000000000000000000";
    const k = await import("@/lib/ai/keys");
    const { geminiState } = await import("@/lib/ai/gemini");
    expect(k.aiKey("gemini")).toBe(process.env.GEMINI_API_KEY);
    expect(k.aiStatus().find((s) => s.id === "gemini")).toMatchObject({
      hasKey: true,
      source: "env",
      last4: "0000",
      enabled: true,
    });
    expect(geminiState()).toBe("ready");

    k.setAiKey("gemini", "AIzaSAVEDKEY11111111111111111111111abcd");
    expect(k.aiKey("gemini")).toMatch(/abcd$/);
    const st = k.aiStatus().find((s) => s.id === "gemini")!;
    expect(st).toMatchObject({ source: "settings", last4: "abcd" });
    // the status never carries the key
    expect(JSON.stringify(k.aiStatus())).not.toContain("SAVEDKEY");
    // the file is readable by this user only
    expect(
      statSync(join(tmp, "storage", "settings", "ai-keys.json")).mode & 0o777,
    ).toBe(0o600);

    k.setAiEnabled("gemini", false);
    expect(k.aiKey("gemini")).toBeNull();
    expect(geminiState()).toBe("off");
    k.setAiEnabled("gemini", true);
    expect(geminiState()).toBe("ready");

    // removed: the .env.local key is not used either
    k.removeAiKey("gemini");
    expect(k.aiKey("gemini")).toBeNull();
    expect(geminiState()).toBe("no-key");
    expect(k.aiStatus().find((s) => s.id === "gemini")).toMatchObject({
      hasKey: false,
      source: null,
    });
  });

  it("switching off a service that only had an .env.local key keeps that key for switching on again", async () => {
    process.env.XAI_API_KEY = "xai-ENVKEY0000000000000000000000";
    const k = await import("@/lib/ai/keys");
    k.setAiEnabled("grok", false);
    expect(k.aiKey("grok")).toBeNull();
    k.setAiEnabled("grok", true);
    expect(k.aiKey("grok")).toBe(process.env.XAI_API_KEY);
    delete process.env.XAI_API_KEY;
    expect(k.aiKey("grok")).toBe("xai-ENVKEY0000000000000000000000");
  });

  it("each service's key has a recognisable shape", async () => {
    const { PROVIDERS } = await import("@/lib/ai/providers");
    const shape = (id: string) => PROVIDERS.find((p) => p.id === id)!.shape;
    expect(
      shape("gemini").test(
        "AIzaSyFAKEKEYfortestsONLY00000000000000".replace(/./g, (c, i) =>
          i < 4 ? c : "x",
        ),
      ),
    ).toBe(true);
    expect(shape("gemini").test("custom-gemini-key-1234567890abcdef")).toBe(
      true,
    );
    expect(shape("gemini").test("sk-abc")).toBe(false);
    expect(shape("grok").test("xai-" + "a".repeat(40))).toBe(true);
    expect(shape("openai").test("sk-proj-" + "a".repeat(40))).toBe(true);
  });
});
