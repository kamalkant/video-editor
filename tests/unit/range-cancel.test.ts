import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileResponse } from "@/lib/http/range";

/**
 * A <video> cancels its range requests all the time (a seek, a new source). The file stream must stop
 * quietly then: Readable.toWeb went on pushing into the cancelled stream and threw "Invalid state:
 * Controller is already closed" as an uncaught exception on the server.
 */
describe("fileResponse when the browser stops reading", () => {
  const errors: unknown[] = [];
  const onError = (e: unknown) => errors.push(e);
  afterEach(() => {
    process.off("uncaughtException", onError);
    process.off("unhandledRejection", onError);
  });

  it("stops the file stream without an uncaught error", async () => {
    process.on("uncaughtException", onError);
    process.on("unhandledRejection", onError);
    const dir = mkdtempSync(join(tmpdir(), "range-cancel-"));
    const file = join(dir, "big.bin");
    writeFileSync(file, Buffer.alloc(8 * 1024 * 1024, 7));
    for (let i = 0; i < 20; i++) {
      const res = await fileResponse(file, "video/mp4", "bytes=0-");
      const reader = res.body!.getReader();
      await reader.read();
      await reader.cancel();
    }
    // (what the old stream pushed after the cancel arrives a moment later)
    await new Promise((r) => setTimeout(r, 300));
    expect(errors).toEqual([]);
  });

  it("still serves the whole range", async () => {
    const dir = mkdtempSync(join(tmpdir(), "range-full-"));
    const file = join(dir, "f.bin");
    writeFileSync(file, Buffer.from("0123456789"));
    const res = await fileResponse(file, "video/mp4", "bytes=2-5");
    expect(res.status).toBe(206);
    expect(await res.text()).toBe("2345");
    expect((await (await fileResponse(file, "video/mp4", null)).text())).toBe("0123456789");
  });

  it("names a download in any language (Hindi too), with a plain-letters fallback", async () => {
    const dir = mkdtempSync(join(tmpdir(), "range-name-"));
    const file = join(dir, "f.bin");
    writeFileSync(file, Buffer.from("x"));
    const cd = (await fileResponse(file, "video/mp4", null, { downloadName: 'मेरी "यात्रा".mp4' })).headers.get("content-disposition")!;
    expect(cd).toContain(`filename*=UTF-8''${encodeURIComponent("मेरी यात्रा.mp4")}`);
    expect(cd).toMatch(/^attachment; filename="[\x20-\x7e]+"; /);
    expect(cd).not.toMatch(/[^\x20-\x7e]/);
  });
});
