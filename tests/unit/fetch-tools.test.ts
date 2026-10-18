import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
// (a plain .mjs script, scripts/fetch-ffmpeg.mjs: importing it only defines its helpers)
import { fetchArchive, untarXzJs, unzipOne } from "../../scripts/fetch-ffmpeg.mjs";

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


describe("the Linux tool fetcher takes FFmpeg 9 out of BtbN's .tar.xz", () => {
  it("checks the SHA-256, keeps just ffmpeg + ffprobe, and skips a second download", async () => {
    const top = join(dir, "ffmpeg-n9.0-test-linux64-gpl-9.0");
    mkdirSync(join(top, "bin"), { recursive: true });
    for (const t of ["ffmpeg", "ffprobe", "ffplay"]) writeFileSync(join(top, "bin", t), `#!/bin/sh\necho ${t}\n`);
    execFileSync("tar", ["-cJf", "ff.tar.xz", "ffmpeg-n9.0-test-linux64-gpl-9.0"], { cwd: dir });
    const body = readFileSync(join(dir, "ff.tar.xz"));
    const sha = createHash("sha256").update(body).digest("hex");
    let hits = 0;
    const server = createServer((_req, res) => (hits++, res.end(body)));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/ff.tar.xz`;
    const tools = [
      { name: "ffmpeg", out: join(dir, "vendor", "ffmpeg") },
      { name: "ffprobe", out: join(dir, "vendor", "ffprobe") },
    ];
    try {
      await expect(fetchArchive(tools, [url, "0".repeat(64)])).rejects.toThrow(/checksum mismatch/);
      expect(await fetchArchive(tools, [url, sha])).toBe("downloaded (opened with tar)");
      expect(readFileSync(join(dir, "vendor", "ffprobe"), "utf8")).toContain("echo ffprobe");
      expect(await fetchArchive(tools, [url, sha])).toBe("kept");
      expect(hits).toBe(2);
    } finally {
      server.close();
    }
  });
});

describe("a host without xz: the .tar.xz is opened in JS", () => {
  it("finds both programs under any folder (also past a long GNU name) and writes them byte for byte", async () => {
    const top = join(dir, "js-" + "x".repeat(120)); // a name longer than tar's 100 characters
    mkdirSync(join(top, "bin"), { recursive: true });
    const big = Buffer.alloc(700_000, 7); // more than one decompressed chunk, not a multiple of 512
    writeFileSync(join(top, "bin", "ffmpeg"), big);
    writeFileSync(join(top, "bin", "ffprobe"), "probe");
    writeFileSync(join(top, "bin", "ffplay"), "play");
    execFileSync("tar", ["--format=gnutar", "-cJf", "js.tar.xz", top.split("/").pop()!], { cwd: dir });
    const out = mkdtempSync(join(dir, "out-"));
    expect(await untarXzJs(join(dir, "js.tar.xz"), out, ["/bin/ffmpeg", "/bin/ffprobe"])).toBe("js");
    expect(readFileSync(join(out, "ffmpeg")).equals(big)).toBe(true);
    expect(readFileSync(join(out, "ffprobe"), "utf8")).toBe("probe");
    await expect(untarXzJs(join(dir, "js.tar.xz"), out, ["/bin/missing"])).rejects.toThrow(/no \/bin\/missing/);
  });
});
