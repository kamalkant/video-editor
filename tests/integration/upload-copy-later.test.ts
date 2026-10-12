import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { GET as play } from "@/app/api/videos/[id]/play/route";
import { storagePath } from "@/lib/storage";
import { getVideo, saveUpload, whenPlayable } from "@/lib/videos";

const tmp = mkdtempSync(join(tmpdir(), "VDO-copy-later-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const bodyOf = (path: string) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new Uint8Array(readFileSync(path)));
      c.close();
    },
  });

// An iPhone (HEVC) or AVI upload waited for its whole preview copy to be made before the editor got it
describe("an upload that needs a preview copy", () => {
  it("answers before the copy is made; the copy follows in the background, and /play serves it", async () => {
    const src = join(tmp, "old.avi");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=320x240:r=25:d=2", "-c:v", "mpeg4", src]);
    const meta = await saveUpload(bodyOf(src) as never, "video/x-msvideo", "old.avi", null, false, "user-1");
    expect(meta.playablePending).toBe(true);
    expect(meta.playable).toBeUndefined();

    const done = await whenPlayable(meta);
    expect(done.playable).toBe("playable.mp4");
    expect(done.playablePending).toBeUndefined();
    expect(existsSync(storagePath("videos", meta.id, "playable.mp4"))).toBe(true);
    expect((await getVideo(meta.id))?.playable).toBe("playable.mp4");

    const res = await play(new Request("http://x", { headers: { range: "bytes=0-99" } }), { params: Promise.resolve({ id: meta.id }) } as never);
    expect(res.status).toBe(206);
    expect(res.headers.get("content-type")).toBe("video/mp4");
  }, 120_000);

  it("an MP4 needs no copy: nothing pending", async () => {
    const src = join(tmp, "plain.mp4");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=320x240:r=25:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", src]);
    const meta = await saveUpload(bodyOf(src) as never, "video/mp4", "plain.mp4", null, false, "user-1");
    expect(meta.playablePending).toBeUndefined();
    expect(meta.playable).toBeUndefined();
  }, 60_000);
});
