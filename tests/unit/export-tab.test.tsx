// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useExportTab } from "@/lib/export/useExportTab";

/**
 * While an export runs, the tab says how far it is (you can work in another tab), says when it's ready if you
 * aren't looking, and the screen is kept awake (a sleeping laptop stops a browser export).
 */
describe("useExportTab", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows the progress in the tab's title, and the project name otherwise", () => {
    const { rerender } = renderHook((p) => useExportTab(p), { initialProps: { projectName: "Goa trip", running: true, pct: 42, done: false, jobId: "j1" } });
    expect(document.title).toBe("42% · Exporting · Goa trip");
    rerender({ projectName: "Goa trip", running: false, pct: null as unknown as number, done: false, jobId: "j1" });
    expect(document.title).toBe("Goa trip · ViPlay Studio");
  });

  it("says the export is ready when the tab isn't being looked at, until it is", () => {
    let hidden = true;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    const { rerender } = renderHook((p) => useExportTab(p), { initialProps: { projectName: "Goa trip", running: true, pct: 99, done: false, jobId: "j2" } });
    rerender({ projectName: "Goa trip", running: false, pct: 100, done: true, jobId: "j2" });
    expect(document.title).toBe("✓ Export ready · Goa trip");
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(document.title).toBe("Goa trip · ViPlay Studio");
  });

  it("keeps the screen awake while it runs, and lets go after", async () => {
    const release = vi.fn(async () => undefined);
    const request = vi.fn(async () => ({ released: false, release }));
    Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
    const { rerender } = renderHook((p) => useExportTab(p), { initialProps: { projectName: "x", running: true, pct: 1, done: false, jobId: "j3" } });
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith("screen"));
    rerender({ projectName: "x", running: false, pct: 100, done: true, jobId: "j3" });
    await vi.waitFor(() => expect(release).toHaveBeenCalled());
  });
});
