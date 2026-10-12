import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: { id: "owner-1" } as null | { id: string } }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/session")>()), getCurrentUser: async () => auth.user }));

import { PUT } from "@/app/api/videos/[id]/route";
import { cleanupOld, storagePath, videoDir } from "@/lib/storage";
import { getVideo } from "@/lib/videos";

const tmp = mkdtempSync(join(tmpdir(), "VDO-client-id-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const clip = join(tmp, "clip.mp4");
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=320x240:r=25:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", clip]);

const uuid = () => crypto.randomUUID();
const put = (id: string) =>
  PUT(new Request(`http://x/api/videos/${id}`, { method: "PUT", body: readFileSync(clip), headers: { "content-type": "video/mp4", "x-file-name": "clip.mp4" } }), { params: Promise.resolve({ id }) } as never);

// The editor's local-first import: the clip is on the timeline under an id the browser chose, and this
// upload (in the background) puts the file on the server under that same id
describe("PUT /api/videos/[id]: an upload under the browser's id", () => {
  it("stores the file under that id, for its owner; sending it again returns the same upload", async () => {
    auth.user = { id: "owner-1" };
    const id = uuid();
    const first = await put(id);
    expect(first.status).toBe(201);
    const meta = await first.json();
    expect(meta).toMatchObject({ id, userId: "owner-1", kind: "video" });
    const again = await put(id);
    expect(again.status).toBe(200);
    expect((await again.json()).id).toBe(id);
  });

  it("someone else's id: 409, nothing returned or replaced", async () => {
    auth.user = { id: "owner-1" };
    const id = uuid();
    await put(id);
    auth.user = { id: "stranger" };
    const res = await put(id);
    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).not.toContain("owner-1");
    expect((await getVideo(id))?.userId).toBe("owner-1");
  });

  it("a folder left by an upload that stopped halfway is replaced; a bad id is refused", async () => {
    auth.user = { id: "owner-1" };
    const id = uuid();
    mkdirSync(videoDir(id), { recursive: true });
    writeFileSync(join(videoDir(id), "source"), "half a file");
    expect((await put(id)).status).toBe(201);
    expect((await put("../../etc")).status).toBe(400);
  });

  it("signed out: 401", async () => {
    auth.user = null;
    expect((await put(uuid())).status).toBe(401);
  });
});

// Projects are saved in the browser, so the server can't tell which uploads they use: the hourly cleanup
// removed every upload after 24 h, and projects lost their media
describe("cleanup keeps people's uploads", () => {
  it("an owned upload older than a day stays; an anonymous one goes", async () => {
    auth.user = { id: "owner-1" };
    const owned = uuid();
    await put(owned);
    const anon = uuid();
    mkdirSync(videoDir(anon), { recursive: true });
    writeFileSync(join(videoDir(anon), "meta.json"), JSON.stringify({ id: anon }));
    const old = (Date.now() - 3 * 24 * 3600 * 1000) / 1000;
    utimesSync(videoDir(owned), old, old);
    utimesSync(videoDir(anon), old, old);
    await cleanupOld();
    expect(existsSync(storagePath("videos", owned, "meta.json"))).toBe(true);
    expect(existsSync(videoDir(anon))).toBe(false);
  });
});
