import { describe, expect, it } from "vitest";
import { emptyDoc, type MediaLite } from "@/lib/edit/doc";
import { addMedia } from "@/lib/edit/docEdit";
import { DENOISE } from "@/lib/audio/denoise";
import { aiMatte } from "@/lib/ops/aiMatte";
import { GraphBuilder } from "@/lib/ops/types";
import { assignSlots, type Slot } from "@/lib/player/videoPool";
import { buildComposeArgs } from "@/lib/render/compose";
import { FEATURES } from "@/lib/roadmap";
import { parseVoices } from "@/lib/tts";

describe("video pool (program preview)", () => {
  it("keeps elements few, reuses the same file, and keeps a clip on its element", () => {
    const slots: Slot[] = [];
    // 60 cuts of one file: at any time only the current and the next one need an element
    for (let i = 0; i < 60; i++) {
      const a = assignSlots(slots, [{ clipId: `c${i}`, src: "A" }, { clipId: `c${i + 1}`, src: "A" }], i, 6);
      expect(a.get(`c${i}`)).toBeDefined();
      expect(a.get(`c${i + 1}`)).toBeDefined();
      expect(a.get(`c${i}`)).not.toBe(a.get(`c${i + 1}`));
    }
    expect(slots.length).toBe(2);
    // the clip that was "next" keeps the element it was pre-rolled on
    const s1 = assignSlots(slots, [{ clipId: "x1", src: "B" }, { clipId: "x2", src: "B" }], 100, 6);
    const s2 = assignSlots(slots, [{ clipId: "x2", src: "B" }, { clipId: "x3", src: "B" }], 101, 6);
    expect(s2.get("x2")).toBe(s1.get("x2"));
  });

  it("grows only up to the limit", () => {
    const slots: Slot[] = [];
    const a = assignSlots(slots, [1, 2, 3, 4, 5].map((n) => ({ clipId: `c${n}`, src: `S${n}` })), 0, 3);
    expect(slots.length).toBe(3);
    expect(a.size).toBe(3);
  });
});

describe("text to speech voices", () => {
  it("parses `say -v ?`, drops novelty voices, puts Indian English first", () => {
    const v = parseVoices(["Albert              en_US    # Hello! My name is Albert.", "Samantha            en_US    # Hello! My name is Samantha.", "Aman                en_IN    # Hello! My name is Aman.", "Lekha               hi_IN    # नमस्ते", "Bad News            en_US    # Hello!", "Grandma (English (UK)) en_GB    # Hello!"].join("\n"));
    expect(v.map((x) => x.name)).toEqual(["Aman", "Lekha", "Grandma (English (UK))", "Samantha"]);
  });
});

describe("AI Removal: blur background", () => {
  it("puts the masked subject over a blurred copy (solid result)", () => {
    const g = new GraphBuilder();
    g.maskInput = "[1:v]";
    const p = aiMatte.sanitize({ ...aiMatte.defaults, background: "blur", blur: 18 });
    expect(p).toMatchObject({ background: "blur", blur: 18 });
    aiMatte.toFilter(p, "[0:v]", g);
    const s = g.toString();
    expect(s).toContain("split");
    expect(s).toContain("gblur=sigma=18");
    expect(s).toMatch(/alphamerge[\s\S]*overlay=format=auto/);
  });
  it("older settings stay exactly as they were", () => {
    expect(aiMatte.sanitize(aiMatte.defaults)).toEqual(aiMatte.defaults);
    expect(aiMatte.sanitize({ ...aiMatte.defaults, background: "transparent", blur: 30 })).toEqual(aiMatte.defaults);
  });
});

describe("remove background noise", () => {
  it("adds the denoiser to the clip's sound in the export", () => {
    const S = "44444444-4444-4444-8444-444444444444";
    const m: MediaLite = { id: S, kind: "audio", fileName: "a", width: 0, height: 0, fps: 0, duration: 4, hasAudio: true, suggestedKey: null, keyKind: null };
    let d = { ...emptyDoc(), canvas: { width: 640, height: 360, fps: 24, background: "#000000" } };
    const r = addMedia(d, m, { at: 0, id: "s1" });
    d = { ...r.doc, tracks: r.doc.tracks.map((t) => (t.kind === "audio" ? { ...t, clips: t.clips.map((c) => ({ ...c, denoise: "strong" as const })) } : t)) };
    const args = buildComposeArgs(d, { [S]: { path: "a.m4a", hasAudio: true, width: 0, height: 0 } }, "mp4", "out.mp4", { progress: false });
    expect(args.join(" ")).toContain(DENOISE.strong);
  });
});

describe("the plan (lib/roadmap)", () => {
  it("has unique ids and every feature in a known state", () => {
    expect(new Set(FEATURES.map((f) => f.id)).size).toBe(FEATURES.length);
    expect(FEATURES.every((f) => ["ready", "next", "later"].includes(f.status))).toBe(true);
    // a ready cloud feature is a Gemini one, and says so (nothing goes online unannounced);
    // smart crop, upscale and the object cover run on this computer
    expect(FEATURES.filter((f) => ["smart-crop", "upscale", "remove-object"].includes(f.id)).every((f) => !f.cloud)).toBe(true);
    const cloudReady = FEATURES.filter((f) => f.cloud && f.status === "ready");
    expect(cloudReady.map((f) => f.id).sort()).toEqual([
      "auto-subs",
      "avatar",
      "b-roll",
      "extend",
      "gen-bg",
      "gen-effects",
      "gen-image",
      "gen-video",
      "highlights",
      "replace-sky",
      "text-to-video",
      "translate",
      "translate-subs",
      "voice-clone",
    ]);
    expect(cloudReady.every((f) => f.detail.includes("Gemini"))).toBe(true);
  });
});
