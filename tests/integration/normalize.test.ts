import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  normalizeArgs,
  normalizeRecording,
  planFor,
} from "@/lib/ffmpeg/normalize";

const tmp = mkdtempSync(join(tmpdir(), "VDO-norm-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const probe = (f: string) =>
  JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,r_frame_rate,width,height:format=duration,format_name",
      "-of",
      "json",
      f,
    ]).toString(),
  ) as {
    streams: {
      codec_type: string;
      codec_name: string;
      r_frame_rate: string;
      width?: number;
    }[];
    format: { duration?: string; format_name: string };
  };

describe("browser recordings are re-encoded for editing", () => {
  it("builds H.264 + AAC at 30 fps for video, AAC for voice", () => {
    const v = normalizeArgs("in.webm", "out", {
      video: { width: 1920, height: 1080 },
      audio: true,
    });
    expect(v).toEqual(
      expect.arrayContaining([
        "-c:v",
        "h264_videotoolbox",
        "-c:a",
        "aac",
        "-r",
        "30",
        "-f",
        "mp4",
      ]),
    );
    expect(v.join(" ")).toContain("fps=30");
    const sw = normalizeArgs(
      "in.webm",
      "out",
      { video: { width: 640, height: 360 }, audio: false },
      "libx264",
    );
    expect(sw).toEqual(expect.arrayContaining(["-c:v", "libx264"]));
    expect(sw).not.toContain("-c:a");
    const a = normalizeArgs("in.webm", "out", { video: null, audio: true });
    expect(a).toEqual(
      expect.arrayContaining(["-vn", "-c:a", "aac", "-f", "ipod"]),
    );
  });

  it("a variable-frame-rate WebM becomes a 30 fps MP4 with a length", async () => {
    // like MediaRecorder: VP8 + Opus in WebM, frames at uneven times
    const src = join(tmp, "rec.webm");
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=s=640x360:r=24:d=2",
      "-f",
      "lavfi",
      "-i",
      "sine=f=300:d=2",
      "-vf",
      "setpts='PTS+0.02*sin(N)/TB'",
      "-fps_mode",
      "vfr",
      "-c:v",
      "libvpx",
      "-b:v",
      "1M",
      "-c:a",
      "libopus",
      "-shortest",
      src,
    ]);
    expect((await planFor(src)).video).toEqual({ width: 640, height: 360 });
    const f = join(tmp, "source");
    copyFileSync(src, f);
    await normalizeRecording(f);
    const p = probe(f);
    expect(p.format.format_name).toContain("mp4");
    expect(Number(p.format.duration)).toBeGreaterThan(1.8);
    const v = p.streams.find((s) => s.codec_type === "video")!;
    expect(v.codec_name).toBe("h264");
    expect(v.r_frame_rate).toBe("30/1");
    expect(
      p.streams.some((s) => s.codec_type === "audio" && s.codec_name === "aac"),
    ).toBe(true);
  }, 60_000);

  it("a voice recording becomes M4A", async () => {
    const src = join(tmp, "voice");
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=f=200:d=1.5",
      "-c:a",
      "libopus",
      "-f",
      "webm",
      src,
    ]);
    await normalizeRecording(src);
    const p = probe(src);
    expect(p.streams).toHaveLength(1);
    expect(p.streams[0].codec_name).toBe("aac");
    expect(Number(p.format.duration)).toBeGreaterThan(1.3);
  }, 60_000);
});
