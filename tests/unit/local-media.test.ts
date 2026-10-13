// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const opfs = vi.hoisted(() => ({ files: new Map<string, Blob>() }));
vi.mock("@/lib/storage/opfs", () => ({
  opfsWriteBlob: async (acct: string, path: string, b: Blob) => (opfs.files.set(`${acct}/${path}`, b), path),
  opfsReadBlob: async (acct: string, path: string) => opfs.files.get(`${acct}/${path}`) ?? null,
  opfsDelete: async (acct: string, path: string) => opfs.files.delete(`${acct}/${path}`),
}));

import * as L from "@/lib/media/localMedia";
import { ApiError, type VideoMeta } from "@/lib/api/types";

let n = 0;
beforeEach(() => {
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => `blob:test/${++n}`, revokeObjectURL: vi.fn() }));
  localStorage.clear();
  opfs.files.clear();
  L.resetLocalMedia();
});
afterEach(() => {
  L.resetLocalMedia();
  vi.useRealTimers();
});

const file = (name = "clip.mp4", size = 1000) => new File([new Uint8Array(size)], name, { type: "video/mp4" });
const id = () => crypto.randomUUID();
const probe = { kind: "video" as const, width: 1920, height: 1080, duration: 6.5, poster: null };
const meta = (i: string): VideoMeta => ({ id: i, kind: "video", fileName: "clip.mp4", createdAt: 0, info: { container: "mp4", videoCodec: "h264", width: 1920, height: 1080, fps: 25, duration: 6.48, hasAudio: false, audioCodec: null, soundDetected: false, colorTransfer: null }, suggestedKey: null, keyKind: null });
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("local-first import", () => {
  it("a file plays from this computer at once; the timeline gets the browser's details until the server's", () => {
    const i = id();
    L.addLocal(i, file(), "video", null);
    expect(L.localSrc(i)).toMatch(/^blob:/);
    expect(L.notOnServer(i)).toBe(true);
    const m = L.provisionalMeta(i, file("My clip!.mp4"), probe);
    expect(m).toMatchObject({ id: i, kind: "video", fileName: "My clip_.mp4", info: { width: 1920, height: 1080, duration: 6.5, fps: 30, hasAudio: true } });
  });

  it("the server's limits are checked before the file goes on the timeline", () => {
    expect(L.overLimit({ ...probe, duration: 3600 })).toMatch(/minutes long/);
    expect(L.overLimit({ ...probe, width: 7680, height: 4320 })).toMatch(/7680 × 4320/);
    expect(L.overLimit(probe)).toBeNull();
    expect(L.kindOfFile({ name: "a.MOV", type: "" })).toBe("video");
    expect(L.kindOfFile({ name: "a.txt", type: "text/plain" })).toBeNull();
  });

  it("uploads in the background: progress, then the server's details; requests for it wait meanwhile", async () => {
    let finish!: (m: VideoMeta) => void;
    L.setTransport((i, _f, _n, onProgress) => {
      onProgress(500, 1000);
      return new Promise((r) => (finish = r));
    });
    const got: VideoMeta[] = [];
    L.onLocalUploaded((m) => got.push(m));
    const i = id();
    L.addLocal(i, file(), "video", null);
    L.uploadLocal(i);
    await tick();
    expect(L.localItem(i)?.progress).toBe(0.5);
    expect(L.pendingAmong([i])).toHaveLength(1);
    // the upload gate: a request for server work on it waits for the upload
    const realFetch = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", realFetch);
    const uninstall = L.installUploadGate();
    const req = fetch(`/api/videos/${i}/thumb`);
    await tick();
    expect(realFetch).not.toHaveBeenCalled();
    finish(meta(i));
    await req;
    expect(realFetch).toHaveBeenCalledTimes(1);
    uninstall();
    expect(got.map((m) => m.id)).toEqual([i]);
    expect(L.localItem(i)?.state).toBe("uploaded");
    expect(L.localThumb(i)).toBeNull(); // the server's thumbnail from now on
    expect(L.localSrc(i)).toMatch(/^blob:/); // still plays from this computer
  });

  it("a file the server refuses fails at once (no retries); a network error is retried", async () => {
    vi.useFakeTimers();
    const failures: { permanent: boolean }[] = [];
    L.onLocalUploadFailed((f) => failures.push(f));
    L.setTransport(async () => {
      throw new ApiError(422, "too_long", "Too long.");
    });
    const a = id();
    L.addLocal(a, file(), "video", null);
    L.uploadLocal(a);
    await vi.runAllTimersAsync();
    expect(failures).toEqual([expect.objectContaining({ id: a, permanent: true })]);

    let calls = 0;
    L.setTransport(async (i) => {
      if (++calls < 3) throw new ApiError(0, "network", "Offline.");
      return meta(i);
    });
    const b = id();
    L.addLocal(b, file(), "video", null);
    L.uploadLocal(b);
    await vi.runAllTimersAsync();
    expect(calls).toBe(3);
    expect(L.localItem(b)?.state).toBe("uploaded");
  });
});

describe("a copy in the browser (survives a reload)", () => {
  it("kept, then after a reload the file plays from it again; it isn't sent until a server feature needs it", async () => {
    L.setLocalAccount("acct1");
    const i = id();
    const f = file("holiday.mp4");
    L.addLocal(i, f, "video", null);
    expect(await L.persistLocal(i, f, { ...probe, name: "holiday.mp4" })).toBe(true);

    // a reload: nothing in memory
    L.resetLocalMedia();
    L.setLocalAccount("acct1");
    const sent: string[] = [];
    L.setTransport(async (x) => (sent.push(x), meta(x)));
    const unknown = await L.restoreLocal([i, id()], async () => false);
    expect(L.localSrc(i)).toMatch(/^blob:/);
    expect(unknown).toEqual([expect.objectContaining({ id: i, fileName: "holiday.mp4", duration: 6.5 })]);
    await tick();
    expect(sent).toEqual([]);
    expect(L.localItem(i)?.state).toBe("local");
    // the export (or an AI tool) needs it: now it's sent
    expect(await L.ensureOnServer([i])).toEqual({ ok: true, failed: [] });
    expect(sent).toEqual([i]);
  });

  it("an uploaded file's copy plays locally without a new upload; a deleted asset's copy goes", async () => {
    L.setLocalAccount("acct1");
    const i = id();
    L.setTransport(async (x) => meta(x));
    const f = file();
    L.addLocal(i, f, "video", null);
    L.uploadLocal(i);
    await tick();
    await L.persistLocal(i, f, { ...probe, name: "clip.mp4" });
    L.resetLocalMedia();
    L.setLocalAccount("acct1");
    const transport = vi.fn(async (x: string) => meta(x));
    L.setTransport(transport);
    expect(await L.restoreLocal([i], async () => true)).toEqual([]);
    expect(L.localItem(i)?.state).toBe("uploaded");
    expect(transport).not.toHaveBeenCalled();
    await L.forgetLocal(i);
    expect(L.localSrc(i)).toBeNull();
    expect(opfs.files.size).toBe(0);
  });

  it("copies of uploaded files stay under the budget (oldest first); never-uploaded ones stay", async () => {
    L.setLocalAccount("acct1");
    const ids = [id(), id(), id()];
    for (const [k, x] of ids.entries()) {
      L.addLocal(x, file("a.mp4", 600), "video", null, k < 2 ? "uploaded" : "uploading");
      await L.persistLocal(x, file("a.mp4", 600), { ...probe, name: "a.mp4" });
      L.releaseLocal(x, true);
    }
    await L.enforceBudget("acct1", 1000);
    const left = [...opfs.files.keys()];
    expect(left.some((k) => k.endsWith(ids[0]!))).toBe(false);
    expect(left.some((k) => k.endsWith(ids[2]!))).toBe(true);
  });

  it("restores media asset thumbnail from OPFS on second-time login/reload without needing timeline restoration", async () => {
    L.setLocalAccount("acct1");
    const i = id();
    const posterBlob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    const f = file("veo.mp4");
    L.addLocal(i, f, "video", posterBlob, "local");
    await L.persistLocal(i, f, { ...probe, poster: posterBlob, name: "veo.mp4" });
    expect(L.localThumb(i)).toMatch(/^blob:/);

    // Simulate second time login in a fresh session: reset in-memory items
    L.resetLocalMedia();
    expect(L.localItem(i)).toBeUndefined();

    // On second time login, setLocalAccount preloads saved posters from OPFS
    L.setLocalAccount("acct1");
    await tick();

    // Thumbnail should be restored from OPFS even though item is not on timeline
    expect(L.localThumb(i)).toMatch(/^blob:/);
  });
});
