import { describe, expect, it } from "vitest";
import {
  buildEmbedSnippet,
  DETECTION_JS,
  isWebKitUA,
} from "@/lib/embed/snippet";

type Case = [
  name: string,
  ua: string,
  platform: string,
  maxTouchPoints: number,
  webkit: boolean,
];

const UAS: Case[] = [
  [
    "Safari Mac",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15",
    "MacIntel",
    0,
    true,
  ],
  [
    "iPhone Safari",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1",
    "iPhone",
    5,
    true,
  ],
  [
    "iPhone Chrome",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1",
    "iPhone",
    5,
    true,
  ],
  [
    "iPad desktop mode",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15",
    "MacIntel",
    5,
    true,
  ],
  [
    "Chrome Mac",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
    "MacIntel",
    0,
    false,
  ],
  [
    "Edge Windows",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0",
    "Win32",
    0,
    false,
  ],
  [
    "Firefox Windows",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
    "Win32",
    0,
    false,
  ],
  [
    "Android Chrome",
    "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36",
    "Linux armv8l",
    5,
    false,
  ],
];

describe("WebKit detection (which file each browser gets)", () => {
  for (const [name, ua, platform, touch, webkit] of UAS) {
    it(`${name} → ${webkit ? ".mov" : ".webm"}`, () => {
      expect(isWebKitUA(ua, platform, touch)).toBe(webkit);
      // the text pasted into websites must agree with the function
      const fn = new Function("ua", "navigator", `return ${DETECTION_JS};`);
      expect(fn(ua, { platform, maxTouchPoints: touch })).toBe(webkit);
    });
  }
});

describe("embed snippet options", () => {
  const base = {
    folder: "/videos",
    webmName: "a.webm",
    movName: "a.mov",
    posterName: "p.png",
    width: 640,
    height: 360,
    withSound: false,
  };
  it("defaults: pause button, reduced motion respected, poster", () => {
    const s = buildEmbedSnippet(base);
    expect(s).toContain('id="VDO-pause"');
    expect(s).toContain("prefers-reduced-motion: reduce");
    expect(s).not.toMatch(/<video[^>]* autoplay/);
    expect(s).toContain('poster="/videos/p.png"');
    expect(s).toContain("playsinline");
  });
  it("options off: plain autoplay, no buttons", () => {
    const s = buildEmbedSnippet({
      ...base,
      pauseButton: false,
      respectReducedMotion: false,
    });
    expect(s).toMatch(/<video id="VDO-avatar" autoplay/);
    expect(s).not.toContain("VDO-controls");
    expect(s).not.toContain("prefers-reduced-motion");
  });
  it("sound button when the avatar talks", () => {
    expect(buildEmbedSnippet({ ...base, withSound: true })).toContain(
      "Turn sound on",
    );
  });
});
