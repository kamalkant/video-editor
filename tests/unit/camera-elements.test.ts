import { describe, expect, it } from "vitest";
import { elementLookSchema, type ElementClip } from "@/lib/edit/doc";
import {
  ELEMENT_GROUPS,
  ELEMENTS,
  elementClipOf,
  elementName,
  elementPreset,
  searchElements,
} from "@/lib/elements/catalog";
import { movesByItself } from "@/lib/elements/draw";

const W = 1920;
const H = 1080;
const canvas = { width: W, height: H };

describe("camera & viewfinder elements (lib/elements/catalog & lib/elements/draw)", () => {
  it("includes 'camera' in ELEMENT_GROUPS", () => {
    const group = ELEMENT_GROUPS.find((g) => g.id === "camera");
    expect(group).toBeDefined();
    expect(group?.label).toBe("Camera & Viewfinders");
  });

  it("all 5 camera presets exist with correct kinds, groups, and attributes", () => {
    const expected = [
      { id: "camera-viewfinder", kind: "viewfinder", group: "camera" },
      { id: "focus-target", kind: "focusTarget", group: "camera" },
      { id: "camera-battery", kind: "battery", group: "camera" },
      { id: "cctv-hud", kind: "viewfinder", group: "camera" },
      { id: "camcorder-vhs", kind: "viewfinder", group: "camera" },
    ];

    for (const item of expected) {
      const p = elementPreset(item.id);
      expect(p).toBeDefined();
      expect(p?.group).toBe(item.group);
      expect(p?.el.kind).toBe(item.kind);
    }

    const vf = elementPreset("camera-viewfinder")!;
    expect(vf.el.batteryLevel).toBe(85);
    expect(vf.el.aperture).toBe("f 1.8");
    expect(vf.el.resolutionTag).toBe("4K HD");
    expect(vf.el.timecodeOffset).toBe(38.4);
    expect(vf.seconds).toBe("whole");

    const focus = elementPreset("focus-target")!;
    expect(focus.el.aspect).toBe(1);

    const bat = elementPreset("camera-battery")!;
    expect(bat.el.batteryLevel).toBe(85);
    expect(bat.el.aspect).toBe(2.2);

    const cctv = elementPreset("cctv-hud")!;
    expect(cctv.el.text).toBe("CAM 02");
    expect(cctv.el.resolutionTag).toBe("1080P");

    const vhs = elementPreset("camcorder-vhs")!;
    expect(vhs.el.text).toBe("PLAY ▶");
    expect(vhs.el.aperture).toBe("SP");
    expect(vhs.el.resolutionTag).toBe("AUTO");
  });

  it("movesByItself returns true for viewfinder and focusTarget for continuous frame updates", () => {
    const vfPreset = elementPreset("camera-viewfinder")!;
    expect(movesByItself(vfPreset.el)).toBe(true);

    const focusPreset = elementPreset("focus-target")!;
    expect(movesByItself(focusPreset.el)).toBe(true);

    const batPreset = elementPreset("camera-battery")!;
    expect(movesByItself(batPreset.el)).toBe(false);

    const boxPreset = elementPreset("box")!;
    expect(movesByItself(boxPreset.el)).toBe(false);
  });

  it("searchElements finds camera presets by keywords", () => {
    const searchVf = searchElements("viewfinder").presets.map((p) => p.id);
    expect(searchVf).toContain("camera-viewfinder");
    expect(searchVf).toContain("cctv-hud");
    expect(searchVf).toContain("camcorder-vhs");

    const searchBattery = searchElements("battery").presets.map((p) => p.id);
    expect(searchBattery).toContain("camera-battery");
    expect(searchBattery).toContain("camera-viewfinder");

    const searchCam = searchElements("camera").presets.map((p) => p.id);
    expect(searchCam).toContain("camera-viewfinder");
    expect(searchCam).toContain("cctv-hud");
    expect(searchCam).toContain("camcorder-vhs");

    const searchCrosshair = searchElements("crosshair").presets.map((p) => p.id);
    expect(searchCrosshair).toContain("focus-target");
    expect(searchCrosshair).toContain("camera-viewfinder");
  });

  it("elementLookSchema parses and validates camera-specific fields", () => {
    const parsed = elementLookSchema.parse({
      kind: "viewfinder",
      aspect: 1.777,
      fill: "none",
      stroke: "#ffffff",
      strokeWidth: 0.02,
      batteryLevel: 92,
      aperture: "f 2.8",
      resolutionTag: "4K HD",
      timecodeOffset: 125.5,
    });

    expect(parsed.batteryLevel).toBe(92);
    expect(parsed.aperture).toBe("f 2.8");
    expect(parsed.resolutionTag).toBe("4K HD");
    expect(parsed.timecodeOffset).toBe(125.5);
  });

  it("elementClipOf creates valid clip for viewfinder and focus target", () => {
    const vfPreset = elementPreset("camera-viewfinder")!;
    const clip = elementClipOf(vfPreset, canvas, 15) as ElementClip;
    expect(clip.type).toBe("element");
    expect(clip.el.preset).toBe("camera-viewfinder");
    expect(clip.duration).toBe(15);
    expect(clip.transform.scale).toBeGreaterThan(0);

    const focusPreset = elementPreset("focus-target")!;
    const focusClip = elementClipOf(focusPreset, canvas, 15) as ElementClip;
    expect(focusClip.type).toBe("element");
    expect(focusClip.el.preset).toBe("focus-target");
  });

  it("elementName displays preset label or customized text", () => {
    const vfPreset = elementPreset("camera-viewfinder")!;
    const vfClip = elementClipOf(vfPreset, canvas, 10) as ElementClip;
    expect(elementName(vfClip)).toBe("Camera viewfinder");

    // When customized text is provided
    const customVf = {
      el: { ...vfClip.el, text: "CAM 04 - EXTERIOR" },
    };
    expect(elementName(customVf)).toBe("CAM 04 - EXTERIOR");

    const cctvPreset = elementPreset("cctv-hud")!;
    const cctvClip = elementClipOf(cctvPreset, canvas, 10) as ElementClip;
    expect(elementName(cctvClip)).toBe("CCTV camera");
  });
});
