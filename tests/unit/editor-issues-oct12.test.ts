import { describe, expect, it, vi } from "vitest";
import { filmCount, filmFrameW, filmIndex, filmSlots, FILM_COLS, FILM_H } from "@/lib/editor/film";

// 1. the timeline film made in the browser must match the server's layout (lib/ffmpeg/preview renderFilm),
// or the timeline's tiles (filmTiles) would show the wrong frames
describe("browser-made film layout", () => {
  it("same frame count, frame size and grid as the server's; frame i shows the middle of slot i", () => {
    const s = filmSlots(20, 30, 1920, 1080);
    expect(s.n).toBe(filmCount(20, 30));
    expect(s.fw).toBe(filmFrameW(1920, 1080));
    expect(s.canvasW).toBe(FILM_COLS * s.fw);
    expect(s.canvasH).toBe(Math.ceil(s.n / FILM_COLS) * FILM_H);
    for (const i of [0, 7, 16, s.n - 1]) {
      const slot = s.at(i);
      expect(filmIndex(slot.t, 20, s.n)).toBe(i); // the timeline asks for frame i at that time
      expect(slot.x).toBe((i % FILM_COLS) * s.fw);
      expect(slot.y).toBe(Math.floor(i / FILM_COLS) * FILM_H);
    }
  });
});

// 4. projects listed from this browser had no picture: only the workspace's own assets counted as known
describe("project covers", () => {
  it("a project's first video is its cover, wherever the file lives", async () => {
    vi.resetModules();
    vi.doMock("@/lib/storage/db", async (orig) => ({
      ...(await orig<typeof import("@/lib/storage/db")>()),
      dbListProjects: async () => [
        { id: "p1", name: "Trip", updatedAt: 1, createdAt: 1, accountCode: "a", jobId: null, doc: { version: 2, canvas: { width: 1920, height: 1080, fps: 30, background: "#000000" }, output: {}, tracks: [{ id: "main", kind: "main", clips: [{ id: "c1", type: "video", mediaId: "11111111-1111-4111-8111-111111111111", in: 0, out: 2, ops: [] }] }] } },
      ],
      dbListAssets: async () => [],
    }));
    const { AccountWorkspace } = await import("@/lib/storage/workspace");
    const ws = new AccountWorkspace("a", "u", "e@x");
    const [p] = await ws.listProjects();
    expect(p?.coverId).toBe("11111111-1111-4111-8111-111111111111");
    vi.doUnmock("@/lib/storage/db");
  });
});

