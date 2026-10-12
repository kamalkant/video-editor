import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: { id: "owner-1" } as null | { id: string } }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/session")>()), getCurrentUser: async () => auth.user }));

import { POST as start } from "@/app/api/uploads/route";
import { DELETE as cancel, GET as status, PUT as chunk } from "@/app/api/uploads/[uploadId]/route";
import { POST as finish } from "@/app/api/uploads/[uploadId]/finish/route";
import { uploadInChunks } from "@/lib/api/chunkedUpload";
import { ApiError } from "@/lib/api/types";
import { MAX_CHUNK_BYTES, pruneSessions } from "@/lib/uploads/chunked";
import { storagePath } from "@/lib/storage";
import { getVideo, sourcePath } from "@/lib/videos";

const tmp = mkdtempSync(join(tmpdir(), "VDO-chunked-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const clipPath = join(tmp, "clip.mp4");
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=320x240:r=25:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", clipPath]);
const clipBytes = readFileSync(clipPath);
const clip = () => new Blob([clipBytes], { type: "video/mp4" });
// an editor's export: ProRes in a .mov (browsers can't play it, so it is uploaded and gets a playable copy)
const movPath = join(tmp, "Sequence-03.mov");
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=25:d=1", "-f", "lavfi", "-i", "sine=f=440:d=1", "-c:v", "prores_ks", "-profile:v", "2", "-c:a", "pcm_s16le", "-shortest", movPath]);
afterEach(() => {
  vi.unstubAllGlobals();
  auth.user = { id: "owner-1" };
});

type Fault = (path: string, init: RequestInit, n: number) => Response | "drop" | null;

/** fetch → the real route handlers (a fault can fail a request, as a proxy or the network would). */
function serve(fault?: Fault) {
  const calls: { method: string; path: string }[] = [];
  const f = vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = new URL(url, "http://x");
    const method = (init.method ?? "GET").toUpperCase();
    calls.push({ method, path: u.pathname + u.search });
    const injected = fault?.(u.pathname + u.search, init, calls.length);
    if (injected === "drop") throw new TypeError("Failed to fetch");
    if (injected) return injected;
    if (init.signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    const req = new Request(u, { method, headers: init.headers, body: init.body as BodyInit | undefined, signal: init.signal ?? undefined, ...(init.body ? { duplex: "half" } : {}) } as RequestInit);
    const m = /^\/api\/uploads\/([^/]+)(\/finish)?$/.exec(u.pathname);
    if (u.pathname === "/api/uploads" && method === "POST") return start(req);
    if (!m) return new Response("no route", { status: 404 });
    const ctx = { params: Promise.resolve({ uploadId: m[1]! }) };
    if (m[2]) return finish(req, ctx);
    if (method === "PUT") return chunk(req, ctx);
    if (method === "GET") return status(req, ctx);
    if (method === "DELETE") return cancel(req, ctx);
    return new Response("no route", { status: 405 });
  });
  vi.stubGlobal("fetch", f);
  return calls;
}
const fast = { backoffMs: [1, 1, 1, 1, 1, 1], timeoutMs: 5_000, firstChunk: 64 * 1024, minChunk: 8 * 1024 };

describe("uploads in chunks (big files through hosting proxies)", () => {
  it("a file sent in chunks becomes an upload, like a one-request upload", async () => {
    const calls = serve();
    const progress: number[] = [];
    const meta = await uploadInChunks(clip(), { name: "clip.mp4", timing: fast }, (sent) => progress.push(sent));
    expect(meta).toMatchObject({ kind: "video", fileName: "clip.mp4", userId: "owner-1" });
    expect(readFileSync(sourcePath(meta.id)).equals(clipBytes)).toBe(true);
    const puts = calls.filter((c) => c.method === "PUT");
    expect(puts.length).toBe(Math.ceil(clipBytes.length / fast.firstChunk));
    expect(puts.map((c) => Number(new URL(c.path, "http://x").searchParams.get("offset")))).toEqual(puts.map((_, k) => k * fast.firstChunk));
    expect(progress.at(-1)).toBe(clipBytes.length);
    // (nothing left behind)
    expect(existsSync(storagePath("uploads"))).toBe(true);
  });

  it("a ProRes .mov (an editor's export) goes in chunks too, and gets a copy the browser can play", async () => {
    const calls = serve();
    const mov = new Blob([readFileSync(movPath)], { type: "video/quicktime" });
    const meta = await uploadInChunks(mov, { name: "Sequence-03.mov", timing: fast }, () => undefined);
    expect(meta).toMatchObject({ kind: "video", fileName: "Sequence-03.mov", info: { videoCodec: "prores" } });
    expect(meta.playablePending || meta.playable).toBeTruthy();
    expect(readFileSync(sourcePath(meta.id)).length).toBe(mov.size);
    expect(calls.filter((c) => c.method === "PUT").length).toBeGreaterThan(1);
  });

  it("under the editor's id (local-first), and sending it again returns that upload", async () => {
    serve();
    const id = crypto.randomUUID();
    const a = await uploadInChunks(clip(), { name: "mine.mp4", id, timing: fast }, () => undefined);
    expect(a.id).toBe(id);
    const b = await uploadInChunks(clip(), { name: "mine.mp4", id, timing: fast }, () => undefined);
    expect(b.id).toBe(id);
    expect(await getVideo(id)).not.toBeNull();
  });

  it("a proxy refusing big chunks (413): smaller ones", async () => {
    const calls = serve((path, init) => (init.method === "PUT" && init.body instanceof Blob && init.body.size > 16 * 1024 ? new Response("<html>Request Entity Too Large</html>", { status: 413 }) : null));
    const meta = await uploadInChunks(clip(), { name: "clip.mp4", timing: fast }, () => undefined);
    expect(readFileSync(sourcePath(meta.id)).equals(clipBytes)).toBe(true);
    expect(calls.some((c) => c.method === "PUT")).toBe(true);
  });

  it("a dropped chunk and a proxy 502 are sent again; the upload goes on from what arrived", async () => {
    let dropped = 0;
    serve((path, init) => {
      if (init.method !== "PUT") return null;
      if (path.includes("offset=65536") && dropped < 2) return dropped++ === 0 ? "drop" : new Response("bad gateway", { status: 502 });
      return null;
    });
    const meta = await uploadInChunks(clip(), { name: "clip.mp4", timing: fast }, () => undefined);
    expect(dropped).toBe(2);
    expect(readFileSync(sourcePath(meta.id)).equals(clipBytes)).toBe(true);
  });

  it("a chunk that arrived though its answer was lost isn't added twice", async () => {
    let lost = false;
    serve();
    const inner = globalThis.fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>;
    vi.stubGlobal("fetch", async (u: string, i: RequestInit = {}) => {
      const res = await inner(u, i);
      // the first chunk's answer never comes back (it was stored)
      if (!lost && i.method === "PUT") {
        lost = true;
        throw new TypeError("Failed to fetch");
      }
      return res;
    });
    const meta = await uploadInChunks(clip(), { name: "clip.mp4", timing: fast }, () => undefined);
    expect(readFileSync(sourcePath(meta.id)).equals(clipBytes)).toBe(true);
  });

  it("the server's refusal stops it with its message (signed out)", async () => {
    serve();
    auth.user = null;
    await expect(uploadInChunks(clip(), { name: "clip.mp4", timing: fast }, () => undefined)).rejects.toMatchObject({ status: 401 });
  });

  it("canceled: the server forgets what arrived", async () => {
    const ctl = new AbortController();
    const calls = serve((path, init) => {
      if (init.method === "PUT" && path.includes("offset=65536")) ctl.abort();
      return null;
    });
    await expect(uploadInChunks(clip(), { name: "clip.mp4", timing: fast }, () => undefined, ctl.signal)).rejects.toBeInstanceOf(ApiError);
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
  });
});

describe("the session rules", () => {
  const begin = async (size: number, extra: Record<string, unknown> = {}) => {
    const r = await start(new Request("http://x/api/uploads", { method: "POST", body: JSON.stringify({ name: "a.mp4", type: "video/mp4", size, ...extra }) }));
    return { r, id: ((await r.clone().json()) as { uploadId?: string }).uploadId! };
  };
  const put = (id: string, offset: number, body: Uint8Array) =>
    chunk(new Request(`http://x/api/uploads/${id}?offset=${offset}`, { method: "PUT", body, duplex: "half" } as RequestInit), { params: Promise.resolve({ uploadId: id }) });
  const ctx = (id: string) => ({ params: Promise.resolve({ uploadId: id }) });

  it("a chunk in the wrong place: 409 with how much arrived", async () => {
    const { id } = await begin(10);
    expect((await put(id, 0, new Uint8Array(4))).status).toBe(200);
    const wrong = await put(id, 0, new Uint8Array(4));
    expect(wrong.status).toBe(409);
    expect(await wrong.json()).toMatchObject({ received: 4 });
  });

  it("finishing before everything arrived is refused; too big or the wrong type is refused at the start", async () => {
    const { id } = await begin(10);
    await put(id, 0, new Uint8Array(4));
    expect((await finish(new Request("http://x", { method: "POST" }), ctx(id))).status).toBe(409);
    expect((await begin(3 * 1024 * 1024 * 1024)).r.status).toBe(413);
    expect((await start(new Request("http://x/api/uploads", { method: "POST", body: JSON.stringify({ name: "a.txt", type: "text/plain", size: 10 }) }))).status).toBe(415);
    expect((await begin(10, { id: "not-an-id" })).r.status).toBe(400);
  });

  it("a chunk bigger than the limit is refused; nothing of it is kept", async () => {
    const { id } = await begin(MAX_CHUNK_BYTES + 10);
    const big = await put(id, 0, new Uint8Array(MAX_CHUNK_BYTES + 1));
    expect(big.status).toBe(413);
    expect(await (await status(new Request("http://x"), ctx(id))).json()).toMatchObject({ received: 0 });
  });

  it("someone else's upload looks like a missing one", async () => {
    const { id } = await begin(10);
    auth.user = { id: "someone-else" };
    expect((await put(id, 0, new Uint8Array(4))).status).toBe(404);
    expect((await status(new Request("http://x"), ctx(id))).status).toBe(404);
  });

  it("sessions nobody finished within a day are deleted", async () => {
    const { id } = await begin(10);
    expect(await pruneSessions(Date.now() + 2 * 24 * 3600 * 1000)).toBeGreaterThanOrEqual(1);
    expect((await status(new Request("http://x"), ctx(id))).status).toBe(404);
  });
});
