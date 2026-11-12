import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyDoc, videoClipOf, type MediaLite, type TimelineDoc } from "@/lib/edit/doc";
import { DEFAULT_OUTPUT } from "@/lib/edit/spec";
import { cutsOnKeyframes, joinArgs, muxArgs, partArgs, passthroughPlan, type PassInfo } from "@/lib/export/passthrough";

const ID = "11111111-1111-4111-8111-111111111111";
const m: MediaLite = { id: ID, kind: "video", fileName: "a.mp4", width: 640, height: 360, fps: 30, duration: 6, hasAudio: true, suggestedKey: null, keyKind: null };
const info: PassInfo = { width: 640, height: 360, fps: 30, videoCodec: "h264", audioCodec: "aac", hasAudio: true };
const look = () => info;

function cuts(parts: [number, number][], patch: Record<string, unknown> = {}): TimelineDoc {
  const d = emptyDoc(DEFAULT_OUTPUT, { width: 640, height: 360, fps: 30, background: "#000000" });
  const main = d.tracks.find((t) => t.kind === "main")!;
  (main as { clips: unknown[] }).clips = parts.map(([a, b], i) => ({ ...videoClipOf(`c${i}`, m, [], a, b), ...patch }));
  return d;
}

describe("smart render (stream copy)", () => {
  it("plain cuts of one file can be copied", () => {
    expect(passthroughPlan(cuts([[0, 2], [3, 5]]), look)).toEqual({ mediaId: ID, parts: [{ in: 0, out: 2 }, { in: 3, out: 5 }], withSound: true });
  });
  it("anything drawn, slowed, moved or added makes it encode", () => {
    expect(passthroughPlan(cuts([[0, 2]], { speed: 2 }), look)).toBeNull();
    expect(passthroughPlan(cuts([[0, 2]], { transform: { fit: "fit", x: 0.1, y: 0, scale: 1 } }), look)).toBeNull();
    expect(passthroughPlan(cuts([[0, 2]], { fadeIn: 0.5 }), look)).toBeNull();
    expect(passthroughPlan(cuts([[0, 2]], { transitionIn: { type: "crossfade", duration: 0.5 } }), look)).toBeNull();
    expect(passthroughPlan(cuts([[0, 2]], { volume: 0.5 }), look)).toBeNull();
    expect(passthroughPlan(cuts([[0, 2]], { ops: [{ id: "key", type: "chromaKey", enabled: true, params: {} }] }), look)).toBeNull();
    const withText = cuts([[0, 2]]);
    (withText.tracks.find((t) => t.kind === "overlay") as { clips: unknown[] }).clips = [{ id: "t1", type: "text", start: 0 }];
    expect(passthroughPlan(withText, look)).toBeNull();
    expect(passthroughPlan({ ...cuts([[0, 2]]), canvas: { width: 1280, height: 720, fps: 30, background: "#000000" } }, look)).toBeNull();
    expect(passthroughPlan(cuts([[0, 2]]), () => ({ ...info, videoCodec: "hevc" }))).toBeNull();
    expect(passthroughPlan({ ...cuts([[0, 2]]), output: { ...DEFAULT_OUTPUT, resolution: 720 } }, look)).toBeNull();
  });
  it("a part must start on a keyframe", () => {
    expect(cutsOnKeyframes([{ in: 0 }, { in: 3 }], [0, 1, 2, 3, 4], 30)).toBe(true);
    expect(cutsOnKeyframes([{ in: 0 }, { in: 2.5 }], [0, 1, 2, 3, 4], 30)).toBe(false);
  });

  it("copies the parts with real ffmpeg: right length, same codec and size, no encoder", () => {
    const dir = mkdtempSync(join(tmpdir(), "vdo-pass-"));
    try {
      const src = join(dir, "src.mp4");
      execFileSync("ffmpeg", ["-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=6", "-f", "lavfi", "-i", "sine=f=440:d=6", "-c:v", "libx264", "-g", "30", "-keyint_min", "30", "-sc_threshold", "0", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-y", src]);
      const parts = [{ in: 1, out: 2.5 }, { in: 3, out: 5 }, { in: 0, out: 1 }];
      const names: string[] = [];
      for (const [i, p] of parts.entries()) {
        const args = partArgs(src, p, 30, join(dir, `p${i}.mp4`));
        expect(args).not.toContain("libx264");
        execFileSync("ffmpeg", ["-loglevel", "error", ...args]);
        names.push(`p${i}.mp4`);
      }
      writeFileSync(join(dir, "list.txt"), names.map((n) => `file '${n}'`).join("\n") + "\n");
      execFileSync("ffmpeg", ["-loglevel", "error", ...joinArgs(join(dir, "list.txt"), join(dir, "v.mp4"))]);
      const out = join(dir, "out.mp4");
      const mux = muxArgs(join(dir, "v.mp4"), src, parts, true, out);
      expect(mux).not.toContain("libx264");
      execFileSync("ffmpeg", ["-loglevel", "error", ...mux]);
      const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", out]).toString());
      const v = probe.streams.find((s: { codec_type: string }) => s.codec_type === "video");
      expect(v.codec_name).toBe("h264");
      expect([v.width, v.height]).toEqual([640, 360]);
      expect(probe.streams.some((s: { codec_type: string }) => s.codec_type === "audio")).toBe(true);
      // 4.5 s of parts: the picture exactly (135 frames), the sound within a frame of it
      expect(Number(v.nb_frames)).toBe(135);
      const a = probe.streams.find((s: { codec_type: string }) => s.codec_type === "audio");
      expect(Math.abs(Number(a.duration) - 4.5)).toBeLessThan(1 / 30 + 0.025);
      expect(Math.abs(Number(probe.format.duration) - 4.5)).toBeLessThan(0.06);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
