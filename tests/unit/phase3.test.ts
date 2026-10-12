import { describe, expect, it, vi } from "vitest";

// AI routes need a signed-in user (lib/ai/meter); a super admin is never charged credits
const auth = vi.hoisted(() => ({ user: { id: "phase3-super", email: "s@test.local", name: "S", role: "super_admin", status: "active" } as unknown }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => auth.user }));
import { grokNameFrom } from "@/lib/ai/grok";
import { POST as grokRoute } from "@/app/api/ai/grok/route";
import {
  TEMPLATES,
  getCustomTemplates,
  saveCustomTemplate,
  deleteCustomTemplate,
} from "@/lib/templates";
import { featureById, FEATURES } from "@/lib/roadmap";
import { emptyDoc } from "@/lib/edit/doc";
import { DEFAULT_OUTPUT } from "@/lib/edit/spec";

describe("Phase 3: AI Grok Imagine, More Templates, Share & Roadmap Sync", () => {
  it("formats Grok Imagine asset naming properly", () => {
    const imgName = grokNameFrom(
      "A cinematic neon cyber city with rain",
      "png",
      "image",
    );
    expect(imgName).toContain(
      "Grok Imagine (image) - A cinematic neon cyber city",
    );
    expect(imgName.endsWith(".png")).toBe(true);

    const vidName = grokNameFrom(
      "A camera pan over snowy mountains",
      "mp4",
      "video",
    );
    expect(vidName).toContain("Grok Imagine (video) - A camera pan over snowy");
    expect(vidName.endsWith(".mp4")).toBe(true);
  });

  it("grok API route validates empty prompt", async () => {
    const req = new Request("http://localhost:3000/api/ai/grok", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "  ", type: "image" }),
    });
    const res = await grokRoute(req);
    expect(res.status).toBe(400);
    // and nobody signed in: 401 before anything else
    const saved = auth.user;
    auth.user = null;
    const anon = await grokRoute(new Request("http://localhost:3000/api/ai/grok", { method: "POST", body: JSON.stringify({ prompt: "x", type: "image" }) }));
    expect(anon.status).toBe(401);
    auth.user = saved;
    const json = await res.json();
    expect(json.error.code).toBe("empty_prompt");
  });

  it("templates library includes Gaming and Weather categories and builds valid documents", () => {
    const gaming = TEMPLATES.find((t) => t.id === "gaming-streamer");
    expect(gaming).toBeDefined();
    expect(gaming?.category).toBe("Gaming");
    const gamingDoc = gaming!.build();
    expect(gamingDoc.canvas.width).toBe(1920);
    expect(gamingDoc.tracks.length).toBeGreaterThan(0);

    const weather = TEMPLATES.find((t) => t.id === "weather-radar");
    expect(weather).toBeDefined();
    expect(weather?.category).toBe("Weather");
    const weatherDoc = weather!.build();
    expect(weatherDoc.canvas.width).toBe(1920);
    expect(weatherDoc.tracks.length).toBeGreaterThan(0);
  });

  it("custom template functions save, retrieve, and delete properly", () => {
    const testDoc = emptyDoc(DEFAULT_OUTPUT, {
      width: 1080,
      height: 1920,
      fps: 30,
      background: "#112233",
    });
    const saved = saveCustomTemplate("My Custom Reels Template", testDoc);
    expect(saved.id).toBeDefined();
    expect(saved.name).toBe("My Custom Reels Template");
    expect(saved.category).toBe("Custom");

    const customs = getCustomTemplates();
    expect(customs.some((c) => c.id === saved.id)).toBe(true);

    deleteCustomTemplate(saved.id);
    const afterDelete = getCustomTemplates();
    expect(afterDelete.some((c) => c.id === saved.id)).toBe(false);
  });

  it("synchronizes all 9 target features in the roadmap as ready", () => {
    const targetFeatures = [
      "loudness",
      "multi-select",
      "custom-masks",
      "styled-caps",
      "transcript",
      "subs-offline",
      "grok",
      "tpl-more",
      "share",
    ];

    for (const fid of targetFeatures) {
      const feat = featureById(fid);
      expect(feat, `Feature ${fid} should exist in roadmap`).toBeDefined();
      expect(feat?.status, `Feature ${fid} should be marked ready`).toBe(
        "ready",
      );
    }
  });
});
