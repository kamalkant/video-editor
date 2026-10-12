import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { zipFiles } from "@/lib/jobs/queue";
import { readZipArchive } from "@/lib/storage/VDO/container";

// The website pack was zipped with /usr/bin/zip, which Linux hosts (Hostinger) don't have
describe("website pack zip", () => {
  it("zips the files that were made, in process, and skips the Safari file when there's none", async () => {
    const dir = mkdtempSync(join(tmpdir(), "VDO-zip-"));
    writeFileSync(join(dir, "avatar.webm"), Buffer.from("webm-bytes"));
    writeFileSync(join(dir, "poster.png"), Buffer.from("png-bytes"));
    const out = join(dir, "ViPlay-website-files.zip");
    await zipFiles(dir, out, ["avatar.webm", "avatar-safari.mov", "poster.png"]);
    const entries = await readZipArchive(readFileSync(out));
    expect(entries.map((e) => e.path)).toEqual(["avatar.webm", "poster.png"]);
    expect(Buffer.from(entries[0]!.data).toString()).toBe("webm-bytes");
  });
});
