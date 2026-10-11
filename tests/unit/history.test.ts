import { describe, expect, it } from "vitest";
import { DEFAULT_SPEC } from "@/lib/edit/spec";
import { historyReducer, initHistory, MERGE_MS } from "@/lib/editor/history";
import { keyParams, stateForVideo, studioReducer, type StudioState } from "@/lib/editor/studioReducer";

const reduce = historyReducer(studioReducer);
const start = (): StudioState => stateForVideo(null, "#11AE33", { width: 1280, fps: 24 }, false);

describe("studio state + undo/redo", () => {
  it("uses the clip's detected key and keeps other settings for a new video", () => {
    const s = start();
    expect(keyParams(s).keyColor).toBe("#11AE33");
    const edited = studioReducer(s, { type: "key", patch: { blend: 0.2 } });
    const next = stateForVideo(edited.spec, "#20B040", { width: 1280, fps: 24 }, true);
    expect(keyParams(next).blend).toBe(0.2);
    expect(keyParams(next).keyColor).toBe("#20B040");
    expect(next.spec.output.audio).toBe("remove");
  });

  it("undoes and redoes, merging a slider drag into one step", () => {
    let h = initHistory(start());
    for (const [i, v] of [0.16, 0.17, 0.18].entries()) h = reduce(h, { type: "do", action: { type: "key", patch: { blend: v } }, group: "key:blend", now: 1000 + i * 100 });
    expect(h.past.length).toBe(1);
    h = reduce(h, { type: "do", action: { type: "key", patch: { blend: 0.2 } }, group: "key:blend", now: 1300 + MERGE_MS + 1 });
    expect(h.past.length).toBe(2);
    h = reduce(h, { type: "undo" });
    expect(keyParams(h.present).blend).toBe(0.18);
    h = reduce(h, { type: "undo" });
    expect(keyParams(h.present).blend).toBe(0.15);
    h = reduce(h, { type: "redo" });
    expect(keyParams(h.present).blend).toBe(0.18);
  });

  it("presets and section resets", () => {
    let s = studioReducer(start(), { type: "applyPreset", id: "soft" });
    expect(keyParams(s).feather).toBe(0.5);
    s = studioReducer(s, { type: "resetSection", section: "edge" });
    expect(keyParams(s).feather).toBe(0);
    expect(keyParams(s).blend).toBe(0.18);
    s = studioReducer(s, { type: "resetSection", section: "removal" });
    expect(keyParams(s).blend).toBe(0.15);
  });

  it("clamps through the op's sanitizer and ignores a bad key", () => {
    const s = studioReducer(start(), { type: "key", patch: { similarity: 5 } });
    expect(keyParams(s).similarity).toBe(0.2);
    expect(studioReducer(s, { type: "setKey", hex: "nope", source: "typed" })).toBe(s);
    expect(DEFAULT_SPEC.ops[0].type).toBe("chromaKey");
  });
});

describe("background removal on/off", () => {
  it("switches off and on, and picking a color switches it back on", async () => {
    const { removalOn } = await import("@/lib/editor/studioReducer");
    let s = start();
    // new clips keep their background until the user switches removal on
    expect(removalOn(s)).toBe(false);
    s = studioReducer(s, { type: "setRemoval", enabled: true });
    expect(removalOn(s)).toBe(true);
    s = studioReducer(s, { type: "setRemoval", enabled: false });
    expect(removalOn(s)).toBe(false);
    expect(s.spec.ops[0].enabled).toBe(false);
    s = studioReducer(s, { type: "setKey", hex: "#10B030", source: "picked" });
    expect(removalOn(s)).toBe(true);
  });
});

describe("a new clip picks its starting mode", () => {
  it("removal starts off; a black clip is ready in black mode, a green one with its green", async () => {
    const { removalOn } = await import("@/lib/editor/studioReducer");
    const lim = { width: 1280, fps: 24 };
    const green = stateForVideo(null, "#11AE33", lim, false);
    expect(removalOn(green)).toBe(false);
    expect(keyParams(green).keyColor).toBe("#11AE33");
    expect(removalOn(studioReducer(green, { type: "setRemoval", enabled: true }))).toBe(true);
    const black = stateForVideo(null, null, lim, false, { black: true });
    expect(black.method).toBe("black");
    expect(removalOn(black)).toBe(false);
    expect(removalOn(studioReducer(black, { type: "setMethod", method: "black" }))).toBe(true);
    const none = stateForVideo(black.spec, null, lim, false);
    expect(none.method).toBe("color");
    expect(removalOn(none)).toBe(false);
    // picking a color on such a clip switches green removal on
    expect(removalOn(studioReducer(none, { type: "setKey", hex: "#808080", source: "picked" }))).toBe(true);
    // effects clips (found in the frame, not the border) start in effects mode
    expect(keyParams(stateForVideo(null, "#11AE33", lim, false, { effects: true })).subject).toBe("effects");
  });
});
