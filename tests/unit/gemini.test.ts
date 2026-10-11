import { afterEach, describe, expect, it } from "vitest";
import { chooseModel, findBlobs, findJson, findTexts, geminiState, scrub } from "@/lib/ai/gemini";
import { costOf, money, veoSecondsFor } from "@/lib/ai/pricing";
import { nearestImageAspect, pixelsOf, veoAspectFor } from "@/lib/ai/shapes";

const saved = { key: process.env.GEMINI_API_KEY, fake: process.env.GEMINI_FAKE };
afterEach(() => {
  process.env.GEMINI_API_KEY = saved.key;
  process.env.GEMINI_FAKE = saved.fake;
  if (saved.key === undefined) delete process.env.GEMINI_API_KEY;
  if (saved.fake === undefined) delete process.env.GEMINI_FAKE;
});

describe("reading Gemini's answers loosely", () => {
  const answer = {
    id: "x",
    input: [{ type: "text", text: "what we asked" }],
    steps: [{ content: [{ type: "text", text: '```json\n{"segments":[{"start":1,"end":2,"text":"hi"}]}\n```' }] }, { content: [{ type: "audio", mime_type: "audio/wav", data: "UklGRiQAAABXQVZFZm10IBAAAAABAAEA" }] }],
    output_image: { mime_type: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB" },
  };
  it("finds pictures and sound by type anywhere, and the model's words (not ours)", () => {
    expect(findBlobs(answer, "image/")).toEqual([{ mime: "image/png", data: answer.output_image.data }]);
    expect(findBlobs(answer, "audio/")[0].mime).toBe("audio/wav");
    expect(findBlobs({ video: { inlineData: { mimeType: "video/mp4", data: "AAAAIGZ0eXBpc29tAAACAGlzb21pc28y" } } }, "video/")).toHaveLength(1);
    expect(findTexts(answer)).not.toContain("what we asked");
    expect(findJson<{ segments: unknown[] }>(answer)?.segments).toHaveLength(1);
    expect(findJson({ text: 'Sure! {"lines":["a"]}' })).toEqual({ lines: ["a"] });
    expect(findJson({ text: "no json" })).toBeNull();
  });

  it("picks the best model the key has, else the newest match, else the first choice; the setting wins", () => {
    expect(chooseModel("text", ["gemini-3.5-flash", "gemini-3.8-flash"])).toBe("gemini-3.8-flash");
    expect(chooseModel("text", ["gemini-4.0-flash", "gemini-3.9-flash"])).toBe("gemini-4.0-flash");
    expect(chooseModel("tts", [])).toBe("gemini-3.8-flash-tts");
    expect(chooseModel("video-fast", ["veo-3.1-fast-generate-preview", "veo-3.1-generate-preview"])).toBe("veo-3.1-fast-generate-preview");
    expect(chooseModel("image", ["gemini-3.1-flash-image"], "my-model")).toBe("my-model");
  });

  it("never shows the key in a message, and says whether Gemini is set up", () => {
    process.env.GEMINI_API_KEY = "AIzaSyTESTKEY1234567890abcdefgh";
    expect(scrub("bad key AIzaSyTESTKEY1234567890abcdefgh here")).toBe("bad key ••• here");
    expect(scrub("other AIzaSyOTHERKEY123456789012345")).toBe("other •••");
    expect(geminiState()).toBe("ready");
    delete process.env.GEMINI_API_KEY;
    expect(geminiState()).toBe("no-key");
    process.env.GEMINI_FAKE = "1";
    expect(geminiState()).toBe("fake");
  });
});

describe("prices and shapes", () => {
  it("shows what each thing costs", () => {
    expect(money(costOf.video("fast", "720p", 8))).toBe("~$0.80");
    expect(money(costOf.video("lite", "720p", 8))).toBe("~$0.40");
    expect(money(costOf.video("standard", "1080p", 8))).toBe("~$3.20");
    expect(money(costOf.image("lite"))).toBe("~$0.03");
    expect(money(costOf.subtitles(60))).toBe("less than 1¢");
    expect(costOf.subtitles(60 * 60)).toBeCloseTo(0.3);
    expect(veoSecondsFor("1080p")).toEqual([8]);
  });
  it("matches the project's shape", () => {
    expect(nearestImageAspect(1920, 1080)).toBe("16:9");
    expect(nearestImageAspect(1080, 1920)).toBe("9:16");
    expect(nearestImageAspect(1080, 1350)).toBe("4:5");
    expect(nearestImageAspect(1000, 1000)).toBe("1:1");
    expect(pixelsOf("9:16", 1024)).toEqual({ width: 576, height: 1024 });
    expect(veoAspectFor(1080, 1920)).toBe("9:16");
    expect(veoAspectFor(1080, 1080)).toBe("16:9");
  });
});
