import { afterEach, describe, expect, it, vi } from "vitest";
import { opfsReadBlob, opfsWriteBlob } from "@/lib/storage/opfs";

/**
 * Safari before 26 has the browser's private file system (OPFS) but no createWritable(): the copy of a file
 * is written to IndexedDB instead. The empty file getFileHandle({ create }) had already made stayed there,
 * and reading the copy back found it: after a reload every video kept in Safari was 0 bytes (the preview
 * and the export had nothing to read).
 */
type File0 = { data: Blob };
function fakeOpfs({ writable }: { writable: boolean }) {
  const dirs = new Map<string, unknown>();
  const dir = (): unknown => {
    const files = new Map<string, File0>();
    const subdirs = new Map<string, unknown>();
    return {
      async getDirectoryHandle(name: string, o?: { create?: boolean }) {
        if (!subdirs.has(name)) {
          if (!o?.create) throw new DOMException("missing", "NotFoundError");
          subdirs.set(name, dir());
        }
        return subdirs.get(name);
      },
      async getFileHandle(name: string, o?: { create?: boolean }) {
        if (!files.has(name)) {
          if (!o?.create) throw new DOMException("missing", "NotFoundError");
          files.set(name, { data: new Blob([]) });
        }
        const f = files.get(name)!;
        return {
          getFile: async () => f.data,
          ...(writable
            ? { createWritable: async () => ({ write: async (b: Blob) => void (f.data = b), close: async () => undefined }) }
            : {}),
        };
      },
      async removeEntry(name: string) {
        if (!files.delete(name) && !subdirs.delete(name)) throw new DOMException("missing", "NotFoundError");
      },
    };
  };
  const root = dir();
  dirs.set("/", root);
  vi.stubGlobal("navigator", { storage: { getDirectory: async () => root } });
}

describe("a file's copy in the browser", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads back what was written where createWritable is missing (Safari before 26)", async () => {
    fakeOpfs({ writable: false });
    const acct = `safari-${crypto.randomUUID()}`;
    await opfsWriteBlob(acct, "media/a.mp4", new Blob(["hello video"]));
    const back = await opfsReadBlob(acct, "media/a.mp4");
    expect(back && (await back.text())).toBe("hello video");
  });

  it("reads the IndexedDB copy past an empty file left by an older write", async () => {
    fakeOpfs({ writable: false });
    const acct = `old-${crypto.randomUUID()}`;
    await opfsWriteBlob(acct, "media/a.mp4", new Blob(["hello video"]));
    // (what the editor left before the fix: an empty file next to the copy in IndexedDB)
    const root = await navigator.storage.getDirectory();
    const d = await (await (await (await root.getDirectoryHandle("VDO")).getDirectoryHandle("users")).getDirectoryHandle(acct)).getDirectoryHandle("media");
    await d.getFileHandle("a.mp4", { create: true });
    const back = await opfsReadBlob(acct, "media/a.mp4");
    expect(back && (await back.text())).toBe("hello video");
  });

  it("still reads from OPFS where it can be written", async () => {
    fakeOpfs({ writable: true });
    const acct = `chrome-${crypto.randomUUID()}`;
    await opfsWriteBlob(acct, "media/a.mp4", new Blob(["hello video"]));
    const back = await opfsReadBlob(acct, "media/a.mp4");
    expect(back && (await back.text())).toBe("hello video");
  });
});
