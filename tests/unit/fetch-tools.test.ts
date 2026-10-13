import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
// (a plain .mjs script, scripts/fetch-ffmpeg.mjs: importing it only defines its helpers)
import { unzipOne } from "../../scripts/fetch-ffmpeg.mjs";
import { ytDlpJsArgs } from "@/lib/import/ytdlp";

const dir = mkdtempSync(join(tmpdir(), "VDO-unzip-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("the Linux tool fetcher reads Deno's .zip", () => {
  it("takes the one program out of a zip, deflated or stored", () => {
    const body = Buffer.from("#!/bin/sh\necho deno\n".repeat(200));
    writeFileSync(join(dir, "deno"), body);
    writeFileSync(join(dir, "other.txt"), "x");
    execFileSync("zip", ["-q", "-9", "deflated.zip", "other.txt", "deno"], { cwd: dir });
    execFileSync("zip", ["-q", "-0", "stored.zip", "deno"], { cwd: dir });
    expect(unzipOne(readFileSync(join(dir, "deflated.zip")), "deno").equals(body)).toBe(true);
    expect(unzipOne(readFileSync(join(dir, "stored.zip")), "deno").equals(body)).toBe(true);
    expect(() => unzipOne(readFileSync(join(dir, "stored.zip")), "missing")).toThrow(/isn't in the zip/);
    expect(() => unzipOne(Buffer.from("not a zip"), "deno")).toThrow(/not a zip/);
  });
});

describe("yt-dlp's JavaScript runtimes", () => {
  it("deno first when there is one, Node as the fallback, and its own cache folder", () => {
    const before = process.env.DENO_PATH;
    process.env.DENO_PATH = "/srv/vendor/deno/deno";
    try {
      const args = ytDlpJsArgs().join(" ");
      expect(args.indexOf("deno:/srv/vendor/deno/deno")).toBeLessThan(args.indexOf(`node:${process.execPath}`));
      expect(args).toMatch(/--cache-dir \S+yt-dlp-cache/);
    } finally {
      if (before === undefined) delete process.env.DENO_PATH;
      else process.env.DENO_PATH = before;
    }
  });
});
