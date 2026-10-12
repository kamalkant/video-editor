import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureFfmpeg } from "@/lib/ffmpeg/ensure";

// Hostinger copies the built site into a new folder for each version: the FFmpeg fetched at install
// arrived without its "executable" bit, so every upload failed ("This video can't be used")
describe("ensureFfmpeg", () => {
  const saved = { ffmpeg: process.env.FFMPEG_PATH, ffprobe: process.env.FFPROBE_PATH };
  afterEach(() => {
    for (const [k, v] of [["FFMPEG_PATH", saved.ffmpeg], ["FFPROBE_PATH", saved.ffprobe]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("puts back a lost executable bit and points FFMPEG_PATH / FFPROBE_PATH at the working files", () => {
    delete process.env.FFMPEG_PATH;
    delete process.env.FFPROBE_PATH;
    const root = mkdtempSync(join(tmpdir(), "VDO-ensure-"));
    const vendor = join(root, "vendor", "ffmpeg");
    mkdirSync(vendor, { recursive: true });
    for (const tool of ["ffmpeg", "ffprobe"]) {
      writeFileSync(join(vendor, tool), "#!/bin/sh\nexit 0\n");
      chmodSync(join(vendor, tool), 0o644); // as the host left it
    }
    ensureFfmpeg(root);
    expect(process.env.FFMPEG_PATH).toBe(join(vendor, "ffmpeg"));
    expect(process.env.FFPROBE_PATH).toBe(join(vendor, "ffprobe"));
  });

  it("leaves an FFMPEG_PATH that's already set alone", () => {
    process.env.FFMPEG_PATH = "/opt/ffmpeg/bin/ffmpeg";
    ensureFfmpeg(mkdtempSync(join(tmpdir(), "VDO-ensure-")));
    expect(process.env.FFMPEG_PATH).toBe("/opt/ffmpeg/bin/ffmpeg");
  });
});
