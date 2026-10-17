import { describe, expect, it } from "vitest";
import { docSchema, emptyDoc, findClip, mainTrack, type AnyClip, type ElementClip, type TimelineDoc } from "@/lib/edit/doc";
import { addElement, addText, duplicateClip, moveClip, pasteClip, setTrack, splitClip } from "@/lib/edit/docEdit";
import { editAt, motionAt } from "@/lib/edit/keyframes";
import { brandSchema } from "@/lib/brand";
import { ELEMENTS, elementClipOf, elementName, elementPreset, emojiClipOf, presetSeconds, searchElements } from "@/lib/elements/catalog";
import { movesByItself } from "@/lib/elements/draw";
import { EMOJI, emojisIn, firstEmoji } from "@/lib/elements/emoji";
import { badgeAspect, ELEMENT_MAX_SIDE, elementRect, elementUnit, elementWork, MAX_STRIP, MIN_SIDE, placeElement, progressAt, refitBadge, stretchElement, tickerLayout, tickerShift } from "@/lib/elements/geometry";
import { textClipOf } from "@/lib/text/layout";

const W = 1920;
const H = 1080;
const canvas = { width: W, height: H };
/** A measure without a browser: every letter 0.6 of the font size wide. */
const measure = (text: string, font: string) => text.length * Number(/(\d+)px/.exec(font)![1]) * 0.6;
const clipOf = (id: string, over: Partial<ElementClip> = {}): ElementClip => ({ ...elementClipOf(elementPreset(id)!, canvas, 12), id: "e1", ...over });
const doc0 = (): TimelineDoc => ({ ...emptyDoc(), canvas: { width: W, height: H, fps: 30, background: "#000000" } });

describe("the ready-made elements (lib/elements/catalog)", () => {
  it("every one makes a clip the timeline keeps exactly (a save round-trip)", () => {
    let d = doc0();
    // (one after another: a timeline has at most 24 tracks)
    ELEMENTS.forEach((p, i) => (d = addElement(d, elementClipOf(p, canvas, 12), i * 13).doc));
    d = addElement(d, emojiClipOf("🔥", canvas), 0).doc;
    const back = docSchema.parse(JSON.parse(JSON.stringify(d)));
    expect(back).toEqual(d);
    const els = back.tracks.flatMap((t): AnyClip[] => t.clips).filter((c) => c.type === "element");
    expect(els).toHaveLength(ELEMENTS.length + 1);
  });
  it("has unique ids, every group, and 27 stickers", () => {
    expect(new Set(ELEMENTS.map((p) => p.id)).size).toBe(ELEMENTS.length);
    for (const g of ["shapes", "lines", "stickers", "news"]) expect(ELEMENTS.some((p) => p.group === g)).toBe(true);
    expect(ELEMENTS.filter((p) => p.group === "stickers")).toHaveLength(27);
  });
  it("search finds by name and other words, emoji too", () => {
    const ids = (q: string) => searchElements(q).presets.map((p) => p.id);
    expect(ids("arrow")).toEqual(expect.arrayContaining(["arrow", "double-arrow", "curved-arrow"]));
    expect(ids("arrow")).not.toContain("box");
    expect(ids("heart")).toContain("heart");
    expect(ids("live")[0]).toBe("live");
    expect(searchElements("fire").emoji.map((x) => x.e)).toContain("🔥");
    expect(searchElements("heart").emoji.map((x) => x.e)).toContain("❤️");
    expect(searchElements("").presets).toHaveLength(ELEMENTS.length);
  });
  it("names: what it is, or its words once changed", () => {
    expect(elementName(clipOf("arrow"))).toBe("Arrow");
    expect(elementName("arrow")).toBe("Arrow");
    expect(elementName("breaking-lower-third")).toBe("Breaking banner");
    expect(elementName("lowerThird")).toBe("Lower third");
    expect(elementName(undefined)).toBe("Element");
    expect(elementName(null)).toBe("Element");
    const live = clipOf("live");
    expect(elementName(live)).toBe("LIVE");
    expect(elementName({ el: { ...live.el, text: "ON AIR" } })).toBe("ON AIR");
    expect(elementName(emojiClipOf("🔥", canvas))).toBe("🔥 fire");
  });
  it("a progress bar lasts the whole video (10 s on an empty timeline)", () => {
    expect(presetSeconds(elementPreset("progress")!, 42.5)).toBe(42.5);
    expect(presetSeconds(elementPreset("progress")!, 0)).toBe(10);
    expect(presetSeconds(elementPreset("box")!, 42.5)).toBe(5);
  });
});

describe("emoji (lib/elements/emoji)", () => {
  it("each is one emoji, none twice", () => {
    // (the v flag: one whole emoji, as Unicode lists them)
    const re = new RegExp("^\\p{RGI_Emoji}$", "v");
    for (const x of EMOJI) expect(re.test(x.e), `${x.e} ${x.name}`).toBe(true);
    expect(new Set(EMOJI.map((x) => x.e)).size).toBe(EMOJI.length);
    expect(EMOJI.length).toBeGreaterThanOrEqual(250);
  });
  it("the first / every whole emoji in some typing (skin tones, flags, keycaps stay whole)", () => {
    expect(firstEmoji("👍🏽 hi")).toBe("👍🏽");
    expect(firstEmoji("abc")).toBeNull();
    expect(emojisIn("a🇮🇳b#️⃣ 👨‍👩‍👧")).toEqual(["🇮🇳", "#️⃣", "👨‍👩‍👧"]);
  });
});

describe("element geometry (lib/elements/geometry)", () => {
  it("the box at scale 1 fits the canvas by its own shape", () => {
    expect(elementUnit(4, W, H)).toEqual({ w: 1920, h: 480 });
    expect(elementUnit(1, W, H)).toEqual({ w: 1080, h: 1080 });
    expect(elementUnit(1, 1080, 1920)).toEqual({ w: 1080, h: 1080 });
    expect(elementUnit(0.5, 1080, 1920)).toEqual({ w: 960, h: 1920 });
  });
  it("an arrow turned to 90° keeps its length (no quarter-turn fit, unlike pictures)", () => {
    const c = clipOf("arrow");
    const r0 = elementRect(c, 0, W, H);
    const r90 = elementRect({ ...c, transform: { ...c.transform, rotation: 90 } }, 0, W, H);
    expect(r90.w).toBeCloseTo(r0.w, 6);
    expect(r90.h).toBeCloseTo(r0.h, 6);
    expect(r90.rot).toBe(90);
  });
  const rectOf = (s: { aspect: number; x: number; y: number; scale: number }) => {
    const u = elementUnit(s.aspect, W, H);
    const w = u.w * s.scale;
    const h = u.h * s.scale;
    return { cx: W / 2 + s.x * W, cy: H / 2 + s.y * H, w, h };
  };
  it("stretching a side: the other side stays put", () => {
    const r = { x: 100, y: 300, w: 400, h: 100, rot: 0 };
    const right = rectOf(stretchElement(r, "r", 100, 0, W, H));
    expect(right.w).toBeCloseTo(500, 0);
    expect(right.cx - right.w / 2).toBeCloseTo(100, 0);
    const left = rectOf(stretchElement(r, "l", -100, 30, W, H));
    expect(left.w).toBeCloseTo(500, 0);
    expect(left.cx + left.w / 2).toBeCloseTo(500, 0);
    expect(left.h).toBeCloseTo(100, 0);
    const down = rectOf(stretchElement(r, "b", 0, 50, W, H));
    expect(down.h).toBeCloseTo(150, 0);
    expect(down.cy - down.h / 2).toBeCloseTo(300, 0);
  });
  it("stretching a turned box: along its own side, the other end stays put", () => {
    const a = (30 * Math.PI) / 180;
    const r = { x: 700, y: 400, w: 400, h: 100, rot: 30 };
    const leftMid = (q: { cx: number; cy: number; w: number }) => [q.cx - (q.w / 2) * Math.cos(a), q.cy - (q.w / 2) * Math.sin(a)];
    const before = leftMid({ cx: r.x + r.w / 2, cy: r.y + r.h / 2, w: r.w });
    const s = stretchElement(r, "r", 100 * Math.cos(a), 100 * Math.sin(a), W, H);
    const after = rectOf(s);
    expect(after.w).toBeCloseTo(500, 0);
    const [x1, y1] = leftMid(after);
    expect(x1).toBeCloseTo(before[0], 0);
    expect(y1).toBeCloseTo(before[1], 0);
  });
  it("Alt stretches from the middle; a box never gets thinner than MIN_SIDE", () => {
    const r = { x: 100, y: 300, w: 400, h: 100, rot: 0 };
    const mid = rectOf(stretchElement(r, "r", 50, 0, W, H, true));
    expect(mid.w).toBeCloseTo(500, 0);
    expect(mid.cx).toBeCloseTo(300, 0);
    const thin = rectOf(stretchElement(r, "r", -1000, 0, W, H));
    expect(thin.w).toBeCloseTo(MIN_SIDE, 0);
  });
  it("the export's picture: its shown size, the biggest one when keyframes grow it, capped", () => {
    const c = clipOf("box");
    const u = elementUnit(c.el.aspect, W, H);
    const still = elementWork(c, W, H);
    expect(Math.abs(still.w - u.w * c.transform.scale)).toBeLessThanOrEqual(1);
    expect(still.w % 2).toBe(0);
    // keyframes: from its size to twice as big
    let k = editAt(c, 0, 30, { transform: { scale: c.transform.scale } });
    k = editAt(k, 2, 30, { transform: { scale: c.transform.scale * 2 } });
    expect(elementWork(k, W, H).w).toBeGreaterThan(still.w * 1.9);
    const huge = elementWork({ ...c, el: { ...c.el, aspect: 1 }, transform: { ...c.transform, scale: 5 } }, 3840, 2160);
    expect(Math.max(huge.w, huge.h)).toBeLessThanOrEqual(ELEMENT_MAX_SIDE);
  });
  it("a new progress bar goes across the bottom edge; LIVE in the top left", () => {
    const p = placeElement(150, { w: 1, h: 0.012 }, "bottom", W, H);
    const r = rectOf({ ...p.transform, aspect: p.aspect });
    expect(r.w).toBeCloseTo(W, 0);
    expect(r.cy + r.h / 2).toBeCloseTo(H, 0);
    const l = placeElement(2.4, { h: 0.065 }, "top-left", W, H);
    const lr = rectOf({ ...l.transform, aspect: l.aspect });
    expect(lr.cx - lr.w / 2).toBeCloseTo(Math.round(0.04 * H), 0);
    expect(lr.h).toBeCloseTo(0.065 * H, 0);
  });
  it("a badge is as wide as its words; the side nearest the frame's edge stays put", () => {
    const live = clipOf("live");
    expect(badgeAspect({ ...live.el, text: "LIVE NOW" }, measure)).toBeGreaterThan(badgeAspect(live.el, measure));
    const fitted = { ...live, el: { ...live.el, aspect: badgeAspect(live.el, measure) } };
    const before = elementRect(fitted, 0, W, H);
    const next = refitBadge({ ...fitted, el: { ...fitted.el, text: "LIVE NOW" } }, measure, W, H)!;
    const after = elementRect({ ...fitted, el: { ...fitted.el, aspect: next.aspect }, transform: next.transform }, 0, W, H);
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.h).toBeCloseTo(before.h, 0);
    expect(after.w).toBeGreaterThan(before.w);
    expect(refitBadge(clipOf("box"), measure, W, H)).toBeNull();
  });
  it("a ticker: the label on the left, a strip that covers its window and loops", () => {
    const t = clipOf("ticker");
    const lay = tickerLayout(t.el, 1920, 80, measure);
    expect(lay.winX).toBeGreaterThan(0);
    expect(lay.winX + lay.winW).toBe(1920);
    expect(Number.isInteger(lay.period)).toBe(true);
    expect(lay.stripW).toBe(lay.period * lay.copies);
    expect(lay.stripW).toBeGreaterThanOrEqual(lay.winW);
    expect(lay.stripW).toBeLessThanOrEqual(MAX_STRIP + lay.period);
    expect(tickerShift(0, 100, 500)).toBe(0);
    expect(tickerShift(6, 100, 500)).toBe(100);
    // very long words at 4K: smaller, so one repeat fits the export's limit
    const long = tickerLayout({ ...t.el, text: "W".repeat(200) }, 3840, 162, measure);
    expect(long.period).toBeLessThanOrEqual(MAX_STRIP);
  });
  it("a progress bar fills from 0 to 1 over its clip", () => {
    expect(progressAt(-1, 10)).toBe(0);
    expect(progressAt(5, 10)).toBe(0.5);
    expect(progressAt(12, 10)).toBe(1);
  });
});

describe("editing elements", () => {
  it("a new one goes on a free overlay track that shows: never a hidden or subtitle track", () => {
    let d = doc0();
    d = setTrack(d, "v2", { hidden: true });
    const a = addElement(d, clipOf("box"), 0);
    const onA = findClip(a.doc, a.clipId)!.track;
    expect(onA.id).not.toBe("v2");
    expect(onA.kind === "overlay" && onA.hidden).toBe(false);
    let s = doc0();
    s = setTrack(s, "v2", { name: "Subtitles" });
    const b = addElement(s, clipOf("box"), 0);
    expect(findClip(b.doc, b.clipId)!.track.name ?? "").not.toMatch(/^Subtitles/);
    // (text too)
    const t = addText(d, textClipOf("title"), 0);
    expect(findClip(t.doc, t.clipId)!.track.id).not.toBe("v2");
  });
  it("never goes on Video 1", () => {
    const a = addElement(doc0(), clipOf("star"), 1);
    const moved = moveClip(a.doc, a.clipId, { trackId: mainTrack(a.doc).id, index: 0 });
    expect(moved).toBe(a.doc);
  });
  it("split, duplicate and paste keep its look", () => {
    const a = addElement(doc0(), clipOf("wow"), 0);
    const el = (findClip(a.doc, a.clipId)!.clip as ElementClip).el;
    const sp = splitClip(a.doc, a.clipId, 2);
    expect((findClip(sp.doc, sp.newId!)!.clip as ElementClip).el).toEqual(el);
    const du = duplicateClip(a.doc, a.clipId);
    expect((findClip(du.doc, du.clipId!)!.clip as ElementClip).el).toEqual(el);
    const pa = pasteClip(a.doc, { clip: findClip(a.doc, a.clipId)!.clip, kind: "overlay" }, 8);
    const pasted = findClip(pa.doc, pa.clipId)!;
    expect((pasted.clip as ElementClip).el).toEqual(el);
    expect(pasted.track.kind).toBe("overlay");
  });
  it("elements and text both turn with keyframes", () => {
    let c = clipOf("arrow");
    c = editAt(c, 0, 30, { transform: { rotation: 0 } });
    c = editAt(c, 2, 30, { transform: { rotation: 90 } });
    expect(motionAt(c, 2).rotation).toBe(90);
    expect(motionAt(c, 1).rotation).toBeGreaterThan(0);
    let t = { ...textClipOf("title"), id: "t1" };
    t = editAt(t, 0, 30, { transform: { rotation: 45 } });
    expect(motionAt(t, 0).rotation).toBe(45);
  });
});

describe("broadcast news and motion elements", () => {
  it("motion elements move by themselves (continuous 60fps render)", () => {
    expect(movesByItself({ kind: "pulse" })).toBe(true);
    expect(movesByItself({ kind: "audioWave" })).toBe(true);
    expect(movesByItself({ kind: "ticker" })).toBe(true);
    expect(movesByItself({ kind: "progress" })).toBe(true);
    expect(movesByItself({ kind: "locationBug" })).toBe(true);
    expect(movesByItself({ kind: "lowerThird" })).toBe(false);
    expect(movesByItself({ kind: "badge" })).toBe(false);
  });

  it("all 8 news presets exist with correct kinds and groups", () => {
    const ids = ["live-pulse", "audio-wave", "market-ticker", "breaking-lower-third", "location-bug", "developing", "fact-check", "special-report"];
    for (const id of ids) {
      const preset = elementPreset(id);
      expect(preset, `Preset ${id} should exist`).toBeDefined();
      expect(preset!.group).toBe("news");
    }
    expect(elementPreset("live-pulse")!.el.kind).toBe("pulse");
    expect(elementPreset("audio-wave")!.el.kind).toBe("audioWave");
    expect(elementPreset("breaking-lower-third")!.el.kind).toBe("lowerThird");
    expect(elementPreset("location-bug")!.el.kind).toBe("locationBug");
  });

  it("lowerThird and locationBug support subText, subTextColor, subFill in schema", () => {
    const lt = elementPreset("breaking-lower-third")!;
    expect(lt.el.subText).toBeTruthy();
    expect(lt.el.subFill).toBe("#0b1220");
    expect(lt.el.label).toBe("BREAKING NEWS");

    const bug = elementPreset("location-bug")!;
    expect(bug.el.text).toBe("NEW DELHI");
    expect(bug.el.subText).toBe("LIVE 10:45 AM");
  });

  it("Brand Kit schema validates brand video assets list", () => {
    const brand = brandSchema.parse({
      name: "Acme News",
      colors: [],
      fonts: [],
      videos: [
        { id: "11111111-1111-4111-8111-111111111111", name: "Intro Sting.mp4", duration: 3.5, width: 1920, height: 1080 },
        { id: "22222222-2222-4222-8222-222222222222", name: "News Ident.mp4", duration: 5, width: 3840, height: 2160 },
      ],
    });
    expect(brand.videos).toHaveLength(2);
    expect(brand.videos![0].name).toBe("Intro Sting.mp4");
  });
});

