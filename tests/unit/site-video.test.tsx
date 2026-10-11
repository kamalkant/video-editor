// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SiteVideo } from "@/components/website/media/SiteVideo";
import { SITE_MEDIA } from "@/components/website/media/manifest";

type IOCallback = (entries: Array<{ target: Element; isIntersecting: boolean; intersectionRatio: number }>) => void;
let ioCallback: IOCallback | null = null;
let reduceMotion = false;

function installBrowser() {
  // (the page shares one observer, created once: its callback stays valid across tests)
  class FakeIO {
    constructor(cb: IOCallback) {
      ioCallback = cb;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("IntersectionObserver", FakeIO);
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce") ? reduceMotion : false, addEventListener() {}, removeEventListener() {} }));
  window.matchMedia = globalThis.matchMedia as typeof window.matchMedia;
}
const video = () => document.querySelector("video")!;
const scrollTo = async (ratio: number) =>
  act(async () => ioCallback?.([{ target: video(), isIntersecting: ratio > 0, intersectionRatio: ratio }]));

let play: ReturnType<typeof vi.fn>;
let pause: ReturnType<typeof vi.fn>;
beforeEach(() => {
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: play });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: pause });
  Object.defineProperty(HTMLMediaElement.prototype, "paused", { configurable: true, get: () => play.mock.calls.length === 0 });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  reduceMotion = false;
});

describe("SiteVideo", () => {
  it("every manifest entry is a light copy with a WebP poster", () => {
    for (const m of Object.values(SITE_MEDIA)) {
      expect(m.src).toMatch(/^\/website\/videos\/.+\.mp4$/);
      expect(m.poster).toMatch(/\.webp$/);
      expect(m.bytes).toBeLessThanOrEqual(1.2 * 1024 * 1024);
    }
  });

  it("without browser support it stays a poster: no file loaded, a play button instead", async () => {
    render(<SiteVideo media="podcast" label="Podcast clip" />);
    expect(video().getAttribute("poster")).toBe(SITE_MEDIA.podcast.poster);
    expect(video().getAttribute("src")).toBeNull();
    expect(video().muted).toBe(true);
    expect(video().hasAttribute("playsinline")).toBe(true);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Play preview: Podcast clip" })));
    expect(video().getAttribute("src")).toBe(SITE_MEDIA.podcast.src);
  });

  it("loads near the screen, plays when visible, pauses when scrolled away", async () => {
    installBrowser();
    render(<SiteVideo media="surf" />);
    expect(video().getAttribute("aria-hidden")).toBe("true"); // decorative: no label
    expect(video().getAttribute("src")).toBeNull();
    await scrollTo(0.1); // near, not yet a quarter visible
    expect(video().getAttribute("src")).toBe(SITE_MEDIA.surf.src);
    expect(play).not.toHaveBeenCalled();
    await scrollTo(0.6);
    expect(play).toHaveBeenCalledTimes(1);
    await scrollTo(0);
    expect(pause).toHaveBeenCalled();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("with reduce motion it never starts by itself", async () => {
    reduceMotion = true;
    installBrowser();
    render(<SiteVideo media="globe" label="Globe" />);
    await scrollTo(1);
    expect(play).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Play preview/ })));
    await scrollTo(1);
    expect(play).toHaveBeenCalled();
  });

  it("held paused by the page, it doesn't play even when visible", async () => {
    installBrowser();
    render(<SiteVideo media="newsroom" paused />);
    await scrollTo(1);
    expect(play).not.toHaveBeenCalled();
  });
});
