import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { STARTER, starterArgs } from "@/lib/library";

const tmp = mkdtempSync(join(tmpdir(), "VDO-lib-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("music library starter set (made by FFmpeg, nothing downloaded)", () => {
  it("every recipe makes a sound file of the right length, not silent", () => {
    for (const r of STARTER) {
      const out = join(tmp, `${r.name}.m4a`);
      execFileSync("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        ...starterArgs(r, out),
      ]);
      const d = Number(
        execFileSync("ffprobe", [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "csv=p=0",
          out,
        ]).toString(),
      );
      // (echoes may ring on a little)
      expect(d, r.name).toBeGreaterThan(r.d - 0.1);
      expect(d, r.name).toBeLessThan(r.d + 0.5);
      let stderr = "";
      try {
        stderr = execFileSync("sh", [
          "-c",
          `ffmpeg -hide_banner -i '${out}' -af volumedetect -f null - 2>&1 | grep max_volume`,
        ]).toString();
      } catch {
        /* no match */
      }
      const max = Number(/max_volume: (-?[\d.]+) dB/.exec(stderr)?.[1] ?? -99);
      expect(max, `${r.name} is silent`).toBeGreaterThan(-40);
    }
  }, 120_000);
});
