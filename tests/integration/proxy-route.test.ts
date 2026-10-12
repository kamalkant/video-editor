import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { GET } from "@/app/api/videos/[id]/proxy/route";
import { ensureProxy } from "@/lib/media/proxy";
import { importFile } from "@/lib/videos";

const tmp = mkdtempSync(join(tmpdir(), "VDO-proxy-route-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const get = (id: string, range?: string) =>
  GET(new Request(`http://internal:3000/api/videos/${id}/proxy`, { headers: range ? { range } : {} }), { params: Promise.resolve({ id }) } as never);

// On viplay.in the preview froze on a black frame with Proxy on: /proxy first sent the whole upload, then
// (proxy made) a smaller file under the same URL, so the player's next range was past its end (416)
describe("/api/videos/[id]/proxy", () => {
  it("redirects to /play until the proxy exists (never other bytes under this URL), then serves the proxy", async () => {
    const src = join(tmp, "clip.mp4");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=1920x1080:r=30:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", src]);
    const video = await importFile(src, "clip.mp4");

    const before = await get(video.id);
    expect(before.status).toBe(307);
    // relative: behind the host's proxy request.url is the internal address
    expect(before.headers.get("location")).toBe(`/api/videos/${video.id}/play`);

    await ensureProxy(video);
    const after = await get(video.id, "bytes=0-99");
    expect(after.status).toBe(206);
    expect(after.headers.get("content-type")).toBe("video/mp4");
  }, 120_000);
});
