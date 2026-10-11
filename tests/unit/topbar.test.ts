import { describe, expect, it } from "vitest";
import { docFromSpec, mainTrack, type MediaLite, type VideoClip } from "@/lib/edit/doc";
import { DEFAULT_SPEC } from "@/lib/edit/spec";
import { matchScore, pushRecent, RECENT_MAX, searchCommands } from "@/lib/editor/commands";
import { docReducer, type DocState } from "@/lib/editor/docReducer";
import { historyReducer, initHistory } from "@/lib/editor/history";
import { applyReport, KEEP_MS, runningCount, settle, stepsPercent, withdraw, type Task } from "@/lib/editor/tasks";
import { nextZoom, PREVIEW_ZOOMS } from "@/lib/player/layout";
import { pointerAngle, rotateCursor, turnAngle } from "@/lib/player/rotate";

const cmd = (id: string, label: string, keywords?: string[]) => ({ id, label, keywords });
const LIST = [cmd("split", "Split at the playhead", ["cut"]), cmd("brand", "Brand Kit", ["logo", "colors"]), cmd("export", "Export & Share…"), cmd("text", "Add text"), cmd("sub", "Subtitles"), cmd("trim-in", "Trim start to the playhead")];

describe("search tools (⌘K)", () => {
  it("every typed word must match; the label's start ranks first", () => {
    expect(searchCommands(LIST, "split").map((c) => c.id)).toEqual(["split"]);
    expect(searchCommands(LIST, "logo").map((c) => c.id)).toEqual(["brand"]);
    expect(searchCommands(LIST, "trim play").map((c) => c.id)).toEqual(["trim-in"]);
    expect(searchCommands(LIST, "trim nothing")).toEqual([]);
    // "Subtitles" starts with "sub"; nothing else does
    expect(searchCommands(LIST, "SUB").map((c) => c.id)).toEqual(["sub"]);
    // a word start beats the middle of a word beats a keyword
    expect(matchScore(cmd("a", "Playhead jump"), "play")).toBeGreaterThan(matchScore(cmd("b", "Go to the playhead"), "play"));
    expect(matchScore(cmd("b", "Go to the playhead"), "play")).toBeGreaterThan(matchScore(cmd("c", "Replay"), "play"));
    expect(matchScore(cmd("c", "Replay"), "play")).toBeGreaterThan(matchScore(cmd("d", "Other", ["playback"]), "play"));
  });

  it("equal matches keep the list's order; accents and signs don't matter", () => {
    expect(searchCommands(LIST, "the").map((c) => c.id)).toEqual(["split", "trim-in"]);
    expect(searchCommands([cmd("x", "Café & crème")], "cafe creme").map((c) => c.id)).toEqual(["x"]);
  });

  it("nothing typed: recent picks first, then everything", () => {
    expect(searchCommands(LIST, "  ", ["sub", "gone", "split"]).map((c) => c.id)).toEqual(["sub", "split", "brand", "export", "text", "trim-in"]);
    let r: string[] = [];
    for (const id of ["a", "b", "c", "a", "d", "e", "f"]) r = pushRecent(r, id);
    expect(r).toEqual(["f", "e", "d", "a", "c"]);
    expect(r.length).toBe(RECENT_MAX);
  });

  it("matches track commands when searching track", () => {
    const trackList = [
      ...LIST,
      cmd("track:add-overlay", "Add video track", ["track", "video track"]),
      cmd("track:add-audio", "Add audio track", ["track", "audio track"]),
      cmd("track:close-gaps", "Close all gaps on tracks", ["track", "gap"]),
    ];
    const res = searchCommands(trackList, "track");
    expect(res.map((c) => c.id)).toEqual([
      "track:add-overlay",
      "track:add-audio",
      "track:close-gaps",
    ]);
  });

  it("safely searches across newly added project tools (motion tracking, smart crop, aspect ratios, etc.)", () => {
    const fullList = [
      ...LIST,
      cmd("track:motion", "Motion tracking (attach to moving objects)", ["track", "tracking", "motion tracking", "follow"]),
      cmd("ai:smart-crop", "Smart crop & auto-reframe (16:9 to 9:16)", ["smart crop", "auto reframe", "vertical"]),
      cmd("ai:transcript", "Transcript editor (edit video by editing text)", ["transcript", "text based editing", "speech to text"]),
      cmd("canvas:ratio-9-16", "Aspect ratio: 9:16 Vertical (TikTok, Reels, Shorts)", ["aspect ratio", "9:16", "tiktok", "vertical"]),
      cmd("timeline:disable", "Disable / enable selected clip", ["disable clip", "mute clip", "hide clip"]),
      cmd("timeline:fit", "Fit timeline to screen", ["zoom fit", "fit timeline", "overview"]),
    ];

    expect(searchCommands(fullList, "motion track").map((c) => c.id)).toEqual(["track:motion"]);
    expect(searchCommands(fullList, "smart crop").map((c) => c.id)).toEqual(["ai:smart-crop"]);
    expect(searchCommands(fullList, "transcript").map((c) => c.id)).toEqual(["ai:transcript"]);
    expect(searchCommands(fullList, "tiktok").map((c) => c.id)).toEqual(["canvas:ratio-9-16"]);
    expect(searchCommands(fullList, "9:16").map((c) => c.id)).toEqual(["ai:smart-crop", "canvas:ratio-9-16"]);
    expect(searchCommands(fullList, "disable").map((c) => c.id)).toEqual(["timeline:disable"]);
    expect(searchCommands(fullList, "fit timeline").map((c) => c.id)).toEqual(["timeline:fit"]);
  });
});

describe("background tasks", () => {
  const rep = { id: "export", kind: "export" as const, label: "Exporting", percent: 10 };
  it("added, updated in place, finished; a finished-before-we-knew task is ignored", () => {
    let t: Task[] = [];
    t = applyReport(t, rep, 1000);
    expect(t).toMatchObject([{ id: "export", state: "running", percent: 10, startedAt: 1000 }]);
    const same = applyReport(t, rep, 2000);
    expect(same).toBe(t);
    t = applyReport(t, { ...rep, percent: 55.4 }, 2000);
    expect(t[0]).toMatchObject({ percent: 55, startedAt: 1000 });
    t = applyReport(t, { ...rep, state: "done", percent: 100 }, 3000);
    expect(t[0]).toMatchObject({ state: "done", startedAt: 1000, endedAt: 3000 });
    expect(runningCount(t)).toBe(0);
    // a new export starts over
    t = applyReport(t, rep, 4000);
    expect(t[0]).toMatchObject({ state: "running", startedAt: 4000, endedAt: undefined });
    expect(applyReport([], { ...rep, state: "done" }, 1)).toEqual([]);
  });

  it("a source that goes away removes a running task but not a finished one; old finished ones are dropped", () => {
    const running = applyReport([], rep, 0);
    expect(withdraw(running, "export")).toEqual([]);
    const done = applyReport(running, { ...rep, state: "failed", detail: "No space" }, 100);
    expect(withdraw(done, "export")).toBe(done);
    expect(settle(done, 100 + KEEP_MS - 1)).toBe(done);
    expect(settle(done, 100 + KEEP_MS)).toEqual([]);
    expect(settle(running, 1e12)).toBe(running);
  });

  it("an export's progress is its steps on average", () => {
    expect(stepsPercent([])).toBeNull();
    expect(stepsPercent([{ state: "done", percent: 40 }, { state: "running", percent: 50 }, { state: "pending", percent: 0 }])).toBe(50);
  });
});

describe("turning a clip from a corner", () => {
  it("turns by how far the pointer went round the middle (no jump when grabbed)", () => {
    // grabbed at the top-right corner (−45°), not moved: no change
    expect(turnAngle(30, -45, -45)).toBe(30);
    expect(turnAngle(0, -45, -45 + 37)).toBe(37);
    expect(turnAngle(10, 135, 135 - 25)).toBe(-15);
    expect(pointerAngle(0, 0, 1, 1)).toBeCloseTo(45);
  });
  it("snaps to quarter turns within 6°; Shift: 15° steps; Alt: free; stays within −180…179", () => {
    expect(turnAngle(0, 0, 86)).toBe(90);
    expect(turnAngle(0, 0, 83)).toBe(83);
    expect(turnAngle(0, 0, 86, { alt: true })).toBe(86);
    expect(turnAngle(0, 0, 38, { shift: true })).toBe(45);
    expect(turnAngle(170, 0, 20)).toBe(-170);
    expect(turnAngle(0, 0, 180)).toBe(-180);
  });
  it("a turn cursor per corner", () => {
    const c = rotateCursor(1, 0);
    expect(c).toMatch(/^url\("data:image\/svg\+xml,.+"\) 12 12, grab$/);
    expect(rotateCursor(0)).not.toBe(c);
    expect(rotateCursor(1, 8)).toBe(rotateCursor(1, 15));
  });
});

describe("preview zoom sizes", () => {
  it("fine steps near fit; the ends stay put; odd sizes go to the next step", () => {
    expect(nextZoom(1, -1)).toBe(0.95);
    expect(nextZoom(0.95, -1)).toBe(0.9);
    expect(nextZoom(1, 1)).toBe(1.1);
    expect(nextZoom(1.1, 1)).toBe(1.25);
    expect(nextZoom(0.25, -1)).toBe(0.25);
    expect(nextZoom(4, 1)).toBe(4);
    expect(nextZoom(1.03, -1)).toBe(1);
    expect(nextZoom(1.03, 1)).toBe(1.1);
    expect(PREVIEW_ZOOMS).toContain(1);
  });
});

describe("restoring a version", () => {
  const lite = (id: string): MediaLite => ({ id, kind: "video", fileName: "a.mp4", width: 1280, height: 720, fps: 30, duration: 4, hasAudio: false, suggestedKey: "#12AF34", keyKind: "green" });
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";
  it("is one undo step and adds the version's uploads", () => {
    const reducer = historyReducer(docReducer);
    const now: DocState = { doc: docFromSpec(DEFAULT_SPEC, lite(A)), media: { [A]: lite(A) } };
    const old = docFromSpec(DEFAULT_SPEC, lite(B));
    let h = initHistory(now);
    h = reducer(h, { type: "do", action: { type: "replaceDoc", doc: old, media: { [B]: lite(B) } }, now: 1 });
    expect((mainTrack(h.present.doc).clips[0] as VideoClip).mediaId).toBe(B);
    expect(Object.keys(h.present.media).sort()).toEqual([A, B]);
    h = reducer(h, { type: "undo" });
    expect((mainTrack(h.present.doc).clips[0] as VideoClip).mediaId).toBe(A);
  });
});
