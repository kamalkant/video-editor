// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// the browser's private storage, in memory (reads can be held back to see what happens meanwhile)
const opfs = vi.hoisted(() => ({ files: new Map<string, Blob>(), gate: null as Promise<void> | null }));
vi.mock("@/lib/storage/opfs", () => ({
  opfsWriteBlob: async (acct: string, path: string, b: Blob) => (opfs.files.set(`${acct}/${path}`, b), path),
  opfsReadBlob: async (acct: string, path: string) => {
    if (opfs.gate) await opfs.gate;
    return opfs.files.get(`${acct}/${path}`) ?? null;
  },
  opfsDelete: async (acct: string, path: string) => opfs.files.delete(`${acct}/${path}`),
}));

import * as L from "@/lib/media/localMedia";
import { inOrder } from "@/lib/media/inOrder";
import type { VideoMeta } from "@/lib/api/types";

let n = 0;
beforeEach(() => {
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => `blob:test/${++n}`, revokeObjectURL: vi.fn() }));
  localStorage.clear();
  opfs.files.clear();
  opfs.gate = null;
  L.resetLocalMedia();
});
afterEach(() => {
  L.resetLocalMedia();
  vi.useRealTimers();
});

const file = (name = "clip.mp4", size = 1000) => new File([new Uint8Array(size)], name, { type: "video/mp4" });
const id = () => crypto.randomUUID();
const probe = { kind: "video" as const, width: 1280, height: 720, duration: 4, poster: null };
const meta = (i: string): VideoMeta => ({ id: i, kind: "video", fileName: "clip.mp4", createdAt: 0, info: { container: "mp4", videoCodec: "h264", width: 1280, height: 720, fps: 25, duration: 4, hasAudio: false, audioCodec: null, soundDetected: false, colorTransfer: null }, suggestedKey: null, keyKind: null });
const tick = () => new Promise((r) => setTimeout(r, 0));

/** A file kept in the browser, then a reload (nothing in memory). */
async function keptThenReload(opts: { uploaded: boolean; poster?: Blob | null }) {
  L.setLocalAccount("acct1");
  const i = id();
  const f = file("holiday.mp4");
  L.addLocal(i, f, "video", opts.poster ?? null, opts.uploaded ? "uploaded" : "uploading");
  await L.persistLocal(i, f, { ...probe, poster: opts.poster ?? null, name: "holiday.mp4" });
  L.resetLocalMedia();
  L.setLocalAccount("acct1");
  return i;
}

describe("reopening a project: the files play from this computer at once", () => {
  it("plays from the copy before the server has answered whether it still has the file", async () => {
    const i = await keptThenReload({ uploaded: true });
    let answer!: (v: boolean) => void;
    const serverHas = vi.fn(() => new Promise<boolean>((r) => (answer = r)));
    const done = L.restoreLocal([i], serverHas);
    await tick();
    await tick();
    expect(L.localSrc(i)).toMatch(/^blob:/);
    expect(L.localItem(i)?.state).toBe("uploaded");
    answer(true);
    expect(await done).toEqual([]);
  });

  it("while the copy is read back, the player is told to wait for it (no server download meanwhile)", async () => {
    const i = await keptThenReload({ uploaded: true });
    let release!: () => void;
    opfs.gate = new Promise((r) => (release = r));
    const done = L.restoreLocal([i], async () => true);
    expect(L.restorePending(i)).toBe(true);
    expect(L.localSrc(i)).toBeNull();
    release();
    await done;
    expect(L.restorePending(i)).toBe(false);
    expect(L.localSrc(i)).toMatch(/^blob:/);
  });

  it("a file the server lost is sent again; one it has is not", async () => {
    const lost = await keptThenReload({ uploaded: true });
    const sent: string[] = [];
    L.setTransport(async (x) => (sent.push(x), meta(x)));
    const unknown = await L.restoreLocal([lost], async () => false);
    expect(unknown.map((m) => m.id)).toEqual([lost]);
    await tick();
    expect(sent).toEqual([lost]);
  });

  it("the frame taken at import is kept with the copy: thumbnails need no server request after a reload", async () => {
    const poster = new Blob(["jpeg"], { type: "image/jpeg" });
    const i = await keptThenReload({ uploaded: true, poster });
    await L.restoreLocal([i], async () => true);
    expect(L.localThumb(i)).toMatch(/^blob:/);
    expect(L.localPosterOf(i)).toBe(poster);
  });

  it("a video's own frame stays its thumbnail after the upload", async () => {
    L.setTransport(async (x) => meta(x));
    const i = id();
    L.addLocal(i, file(), "video", new Blob(["jpeg"], { type: "image/jpeg" }));
    L.uploadLocal(i);
    await tick();
    expect(L.localItem(i)?.state).toBe("uploaded");
    expect(L.localThumb(i)).toMatch(/^blob:/);
  });

  it("files of an imported .vdo package play from the account's storage, without another upload", () => {
    const transport = vi.fn(async (x: string) => meta(x));
    L.setTransport(transport);
    const i = id();
    L.adoptLocal(i, new Blob(["v"], { type: "video/mp4" }), "intro.mp4", "video");
    expect(L.localSrc(i)).toMatch(/^blob:/);
    expect(L.notOnServer(i)).toBe(false);
    expect(transport).not.toHaveBeenCalled();
  });
});

describe("less work competing with playback", () => {
  it("upload progress redraws at most every 5 percent (or after a quarter second)", () => {
    expect(L.progressWorthShowing(0, 0.01, 10)).toBe(false);
    expect(L.progressWorthShowing(0, 0.05, 10)).toBe(true);
    expect(L.progressWorthShowing(0.1, 0.12, 300)).toBe(true);
    expect(L.progressWorthShowing(0.1, 0.105, 300)).toBe(false); // (same whole percent)
  });

  it("the uploads' progress still arrives", async () => {
    L.setTransport(async (x, _f, _n, onProgress) => {
      for (let k = 1; k <= 100; k++) onProgress(k * 10, 1000);
      return meta(x);
    });
    const seen: number[] = [];
    const off = L.subscribeLocal(() => seen.push(L.localItem(i)?.progress ?? 0));
    const i = id();
    L.addLocal(i, file(), "video", null);
    L.uploadLocal(i);
    await tick();
    off();
    // 100 progress events → about 20 redraws, and it ends uploaded
    expect(seen.length).toBeLessThan(30);
    expect(L.localItem(i)?.state).toBe("uploaded");
  });
});

describe("importing several files", () => {
  it("they are looked at together, and land in the order they were picked", async () => {
    const started: string[] = [];
    const taken: string[] = [];
    const delays: Record<string, number> = { a: 30, b: 5, c: 1 };
    await inOrder(
      ["a", "b", "c"],
      async (x) => {
        started.push(x);
        await new Promise((r) => setTimeout(r, delays[x]));
        return x.toUpperCase();
      },
      (_x, r) => taken.push(r),
    );
    expect(started).toEqual(["a", "b", "c"]); // all started before the first finished
    expect(taken).toEqual(["A", "B", "C"]);
  });

  it("the first one lands as soon as it is ready, before slower ones finish", async () => {
    const taken: string[] = [];
    let finishB!: () => void;
    const run = inOrder(
      ["a", "b"],
      (x) => (x === "a" ? Promise.resolve(x) : new Promise<string>((r) => (finishB = () => r(x)))),
      (_x, r) => taken.push(r),
    );
    await tick();
    expect(taken).toEqual(["a"]);
    finishB();
    await run;
    expect(taken).toEqual(["a", "b"]);
  });

  it("one that fails is skipped; the others still land", async () => {
    const taken: string[] = [];
    await inOrder(
      ["a", "b", "c"],
      async (x) => {
        if (x === "b") throw new Error("unreadable");
        return x;
      },
      (_x, r) => taken.push(r),
    );
    expect(taken).toEqual(["a", "c"]);
  });
});
