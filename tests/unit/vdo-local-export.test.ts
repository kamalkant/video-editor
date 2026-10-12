import { afterEach, describe, expect, it } from "vitest";
import { emptyDoc, mainTrack, videoClipOf } from "@/lib/edit/doc";
import { newProject } from "@/lib/projects/model";
import { exportVDO, readZipArchive } from "@/lib/storage/VDO";
import { localWorkspaceManager } from "@/lib/storage/workspace";
import { addLocal, resetLocalMedia } from "@/lib/media/localMedia";

afterEach(() => resetLocalMedia());

describe("a portable .vdo of files imported from this computer", () => {
  it("packs the file from this computer: nothing is downloaded back from the server", async () => {
    const ws = await localWorkspaceManager.openWorkspace("ACC_LOCAL_EXPORT", "usr-le", "le@test.com");
    const mediaId = "4f1d5a7e-2c3b-4d5e-8f90-1a2b3c4d5e6f";
    const bytes = "the user's own video bytes";
    addLocal(mediaId, new File([bytes], "holiday.mp4", { type: "video/mp4" }), "video", new Blob(["cover"], { type: "image/jpeg" }), "uploaded");

    const doc = emptyDoc();
    mainTrack(doc).clips = [videoClipOf("clip-le-1", { id: mediaId, fileName: "holiday.mp4", kind: "video", duration: 4, width: 1280, height: 720, fps: 25, hasAudio: true, suggestedKey: null, keyKind: null }, [])];
    const proj = newProject({ id: "12121212-1212-4121-8121-121212121212", name: "Holiday", doc, now: Date.now(), jobId: null });

    const g = globalThis as unknown as { window?: unknown; fetch: typeof fetch };
    const originalWindow = g.window;
    const originalFetch = g.fetch;
    const requested: string[] = [];
    try {
      g.window = {};
      g.fetch = (async (url: string | URL | Request) => {
        requested.push(url.toString());
        return new Response("Not found", { status: 404 });
      }) as typeof fetch;
      const blob = await exportVDO(proj, ws, { portable: true });
      const entries = await readZipArchive(await blob.arrayBuffer());
      const media = entries.find((e) => e.path === `assets/videos/${mediaId}.mp4`);
      expect(media).toBeDefined();
      expect(new TextDecoder().decode(media!.data)).toBe(bytes);
      // the cover is the frame taken in the browser
      expect(entries.some((e) => e.path === `thumbnails/${mediaId}.jpg`)).toBe(true);
      const manifest = JSON.parse(new TextDecoder().decode(entries.find((e) => e.path === "assets/manifest.json")!.data));
      expect(manifest[0]).toMatchObject({ id: mediaId, name: "holiday.mp4", type: "video", mimeType: "video/mp4" });
      expect(requested.filter((u) => u.includes(mediaId))).toEqual([]);
    } finally {
      g.window = originalWindow;
      g.fetch = originalFetch;
    }
  });
});
