import { describe, expect, it } from "vitest";
import { emptyDoc, findClip, type ElementClip, type MediaLite, type TimelineDoc } from "@/lib/edit/doc";
import { addBlank, addElement, addMedia, addText, setClip } from "@/lib/edit/docEdit";
import { elementClipOf, elementPreset } from "@/lib/elements/catalog";
import { elementWork } from "@/lib/elements/geometry";
import { buildComposeArgs, type ComposeMedia } from "@/lib/render/compose";
import { textClipOf } from "@/lib/text/layout";

// Clips without keyframes must export exactly as before keyframes existed (the graphs are pinned).
const V = "11111111-1111-4111-8111-111111111111";
const P = "33333333-3333-4333-8333-333333333333";
const media: ComposeMedia = { [V]: { path: "/v.mp4", hasAudio: true, width: 1280, height: 720 }, [P]: { path: "/p.png", hasAudio: false, width: 800, height: 600, still: true } };
const vid: MediaLite = { id: V, kind: "video", fileName: "v.mp4", width: 1280, height: 720, fps: 30, duration: 6, hasAudio: true, suggestedKey: null, keyKind: null };
const pic: MediaLite = { id: P, kind: "image", fileName: "p.png", width: 800, height: 600, fps: 0, duration: 0, hasAudio: false, suggestedKey: null, keyKind: null };

function project(): TimelineDoc {
  let d: TimelineDoc = { ...emptyDoc(), canvas: { width: 1280, height: 720, fps: 30, background: "#000000" } };
  d = addMedia(d, vid, { id: "v1" }).doc;
  d = addMedia(d, vid, { id: "v2" }).doc;
  d = setClip(d, "v2", { transitionIn: { type: "slideLeft", duration: 0.5 } });
  d = addMedia(d, pic, { at: 1, id: "p1" }).doc;
  d = setClip(d, "p1", { transform: { fit: "fit", x: 0.2, y: -0.1, scale: 0.4, rotation: 30, crop: { l: 0.1, t: 0, r: 0, b: 0.05 } }, mask: { shape: "rounded", radius: 0.1, feather: 4 }, anim: { in: "slide", out: "fade" }, fadeIn: 0.3 });
  d = addText(d, { ...textClipOf("lowerThird"), text: "Hi" }, 0.5, "t1").doc;
  return d;
}

describe("export graphs without keyframes don't change", () => {
  it("video, transition, picture (crop, turn, mask, animation), text", () => {
    const args = buildComposeArgs(project(), media, "mp4", "/out.mp4", { progress: false, textOf: () => "/t.png" });
    expect(args.join(" ")).toMatchSnapshot();
  });
});

describe("elements: drawn by the browser, placed like a picture", () => {
  const W = 1280;
  const H = 720;
  const base = (): TimelineDoc => addMedia({ ...emptyDoc(), canvas: { width: W, height: H, fps: 30, background: "#000000" } }, vid, { id: "v1" }).doc;
  it("a turned element: drawn at its size (no resize), turned with premultiplied alpha", () => {
    const box = elementClipOf(elementPreset("box")!, { width: W, height: H });
    const d = addElement(base(), { ...box, transform: { ...box.transform, rotation: 30 } }, 0.5, "e1").doc;
    const c = findClip(d, "e1")!.clip as ElementClip;
    const work = elementWork(c, W, H);
    const s = buildComposeArgs(d, media, "mp4", "/out.mp4", { progress: false, elementOf: () => ({ png: "/e.png", ...work }) }).join(" ");
    expect(s).toContain("premultiply=inplace=1,rotate=");
    expect(s).not.toContain(`scale=${work.w}:${work.h}:flags=bicubic`);
    expect(s).toMatchSnapshot();
  });
  it("a progress bar (a sliding window, rounded ends) and a news ticker (its words sliding over the band)", () => {
    let d = base();
    const bar = elementClipOf(elementPreset("progress")!, { width: W, height: H }, 6);
    d = addElement(d, { ...bar, el: { ...bar.el, radius: 0.5 } }, 0, "e1").doc;
    d = addElement(d, elementClipOf(elementPreset("ticker")!, { width: W, height: H }), 1, "e2").doc;
    const s = buildComposeArgs(d, media, "mp4", "/out.mp4", {
      progress: false,
      elementOf: (c) => (c.el.kind === "progress" ? { png: "/bar.png", w: 1280, h: 8, mask: "/shape.png" } : { png: "/band.png", w: 1280, h: 54, strip: { png: "/words.png", w: 2400, x: 150, win: 1130, speed: 118.8 } }),
    }).join(" ");
    expect(s).toContain("crop=w=1280:h=8:x='1280*(1-min(1\\,t/6))':y=0");
    expect(s).toContain("alphaextract");
    expect(s).toContain("hstack=inputs=2,crop=w=1130:h=54:x='mod(118.8*t\\,2400)':y=0");
    expect(s).toMatchSnapshot();
  });
});

describe("blank scenes: a color on Video 1, placed like a picture", () => {
  it("video → blank (a crossfade into it) → video", () => {
    let d: TimelineDoc = addMedia({ ...emptyDoc(), canvas: { width: 1280, height: 720, fps: 30, background: "#000000" } }, vid, { id: "v1" }).doc;
    d = addMedia(d, vid, { id: "v2" }).doc;
    d = addBlank(d, 1, { id: "b1", fill: "#112233" }).doc;
    d = setClip(d, "b1", { transitionIn: { type: "crossfade", duration: 0.5 }, fadeOut: 0.3 });
    const s = buildComposeArgs(d, media, "mp4", "/out.mp4", { progress: false }).join(" ");
    expect(s).toContain("color=c=0x112233:s=1280x720:r=30:d=3.000,format=rgba");
    // (no -i for it: the two videos only)
    expect(s.match(/ -i \/v\.mp4/g)?.length).toBe(4);
    expect(s).toMatchSnapshot();
  });
});

describe("transform tools in the export: warps, pivot and blend modes (pinned)", () => {
  const W = 1280;
  const H = 720;
  const withPic = (patch: Record<string, unknown>, background = "#000000"): TimelineDoc => {
    let d: TimelineDoc = { ...emptyDoc(), canvas: { width: W, height: H, fps: 30, background } };
    d = addMedia(d, vid, { id: "v1" }).doc;
    d = addMedia(d, pic, { at: 1, id: "p1" }).doc;
    return setClip(d, "p1", patch);
  };
  const graph = (d: TimelineDoc, kind: "mp4" | "webm" = "mp4") => buildComposeArgs(d, media, kind, `/out.${kind}`, { progress: false }).join(" ");
  it("a still clip with a skew or a corner pin: one premultiplied perspective warp with its turn (no rotate)", () => {
    const s = graph(withPic({ transform: { fit: "fit", x: 0.1, y: 0, scale: 0.5, rotation: 20, skewX: 15, corners: { tl: { x: 0.1, y: 0 }, tr: { x: 0, y: 0 }, br: { x: 0, y: 0.1 }, bl: { x: 0, y: 0 } } } }));
    expect(s).toMatch(/pad=\d+:\d+:\d+:\d+:color=black@0,format=gbrap,premultiply=inplace=1,perspective=x0=[-\d.]+:y0=[-\d.]+:x1=.*:sense=destination:interpolation=linear,unpremultiply=inplace=1/);
    expect(s).not.toContain("rotate=a=");
    expect(s).toMatchSnapshot();
  });
  it("a pivot moves the middle (still clips: in the numbers; moving ones: in the overlay's expressions)", () => {
    const still = graph(withPic({ transform: { fit: "fit", x: 0, y: 0, scale: 0.5, rotation: 90, pivot: { x: 0, y: 0 } } }));
    expect(still).toMatchSnapshot();
    const moving = graph(
      withPic({
        transform: { fit: "fit", x: 0, y: 0, scale: 0.5, pivot: { x: 0, y: 1 } },
        keyframes: [
          { t: 0, x: 0, y: 0, scale: 0.5, rotation: 0, opacity: 1 },
          { t: 1, x: 0, y: 0, scale: 0.5, rotation: 45, opacity: 1 },
        ],
      }),
    );
    expect(moving).toMatch(/overlay=x='.*cos\(/);
    expect(moving).toMatchSnapshot();
  });
  it("keyframed skew and width: size per axis, a square, then one perspective a frame from (in-1)/fps", () => {
    const s = graph(
      withPic({
        transform: { fit: "fit", x: 0, y: 0, scale: 0.5 },
        keyframes: [
          { t: 0, x: 0, y: 0, scale: 0.5, rotation: 0, opacity: 1, skewX: 0, scaleX: 1 },
          { t: 1, x: 0, y: 0, scale: 0.5, rotation: 10, opacity: 1, skewX: 20, scaleX: 1.5 },
        ],
      }),
    );
    expect(s).toContain(":eval=frame:flags=bicubic,pad=w=");
    expect(s).toContain("((in-1)/30)");
    expect(s).toContain(":sense=destination:interpolation=linear:eval=frame,unpremultiply=inplace=1");
    expect(s).toMatchSnapshot();
  });
  it("blend modes: lut2 with the W3C formula (MP4); on a transparent WebM, Normal where nothing is behind (maskedmerge)", () => {
    const mp4 = graph(withPic({ transform: { fit: "fit", x: 0, y: 0, scale: 0.5 }, blend: "multiply" }));
    expect(mp4).toContain("lut2=c0='clip(round(255*((x/255)*(y/255)))\\,0\\,255)'");
    expect(mp4).toMatchSnapshot();
    let d = withPic({ transform: { fit: "fit", x: 0, y: 0, scale: 0.5 }, blend: "screen" }, "transparent");
    d = { ...d, tracks: d.tracks.map((t) => (t.kind === "main" ? { ...t, clips: [] } : t)) };
    const webm = graph(d, "webm");
    expect(webm).toContain("maskedmerge=planes=7");
    // a blend on a Video 1 clip is ignored (it's the base)
    const main = graph(setClip(withPic({}), "v1", { blend: "screen" }));
    expect(main).not.toContain("lut2");
  });
});
