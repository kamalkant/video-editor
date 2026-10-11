import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DENOISE, isDenoiseLevel } from "@/lib/audio/denoise";
import { everyNth, findBeats } from "@/lib/audio/beats";
import { chaptersFromMarkers, chapterTime, youtubeChapters } from "@/lib/edit/chapters";
import { cleanChapters } from "@/lib/ai/chapters";
import { mainFrameAt } from "@/lib/edit/frameAt";
import { emptyDoc, type MediaLite, type TimelineDoc } from "@/lib/edit/doc";
import { addMedia, setClip } from "@/lib/edit/docEdit";
import { buildComposeArgs, type ComposeMedia } from "@/lib/render/compose";
import { SOCIAL_SET, videoPreset } from "@/lib/export/presets";

const V = "11111111-1111-4111-8111-111111111111";
const vid: MediaLite = { id: V, kind: "video", fileName: "v.mp4", width: 1280, height: 720, fps: 30, duration: 60, hasAudio: true, suggestedKey: null, keyKind: null };
const media: ComposeMedia = { [V]: { path: "/v.mp4", hasAudio: true, width: 1280, height: 720 } };
const base = (): TimelineDoc => addMedia({ ...emptyDoc(), canvas: { width: 1280, height: 720, fps: 30, background: "#000000" } }, vid, { id: "v1" }).doc;

describe("Studio voice", () => {
  it("is a clean-up level the clip, the preview route and the export all accept", () => {
    expect(isDenoiseLevel("studio")).toBe(true);
    const d = setClip(base(), "v1", { denoise: "studio" });
    const args = buildComposeArgs(d, media, "mp4", "/out.mp4", { progress: false }).join(" ");
    expect(args).toContain(DENOISE.studio);
  });

  it("runs in FFmpeg and brings a quiet recording up to a speech level", () => {
    const dir = mkdtempSync(join(tmpdir(), "VDO-studio-voice-"));
    const quiet = join(dir, "quiet.wav");
    const out = join(dir, "out.wav");
    // a quiet, noisy "voice": a 220 Hz tone at -40 dB with a little noise
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=f=220:d=4", "-f", "lavfi", "-i", "anoisesrc=d=4:a=0.003", "-filter_complex", "[0]volume=0.01[a];[a][1]amix=inputs=2", quiet]);
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", quiet, "-af", DENOISE.studio, out]);
    expect(existsSync(out)).toBe(true);
    /** The mean loudness FFmpeg measures, in dB. */
    const vol = (f: string) => {
      const r = execFileSync("sh", ["-c", `ffmpeg -hide_banner -i "${f}" -af volumedetect -f null - 2>&1 | grep mean_volume`]).toString();
      return Number(/mean_volume:\s*(-?[\d.]+)/.exec(r)?.[1]);
    };
    expect(vol(out)).toBeGreaterThan(vol(quiet) + 10);
    expect(readFileSync(out).byteLength).toBeGreaterThan(1000);
  });
});

describe("one click, three sizes", () => {
  it("covers YouTube 16:9, Shorts 9:16 and square", () => {
    expect(SOCIAL_SET.map((id) => videoPreset(id)).map((p) => `${p!.width}x${p!.height}`)).toEqual(["1920x1080", "1080x1920", "1080x1080"]);
  });
});

describe("YouTube chapters", () => {
  it("formats times the way YouTube reads them", () => {
    expect([chapterTime(0), chapterTime(65.4), chapterTime(3723)]).toEqual(["0:00", "1:05", "1:02:03"]);
  });

  it("markers become chapters; the first starts at 0:00", () => {
    const ch = chaptersFromMarkers([
      { id: "m2", t: 95, label: "The result", color: "blue" },
      { id: "m1", t: 30, label: "Setup", color: "blue" },
    ]);
    expect(ch).toEqual([
      { t: 0, title: "Intro" },
      { t: 30, title: "Setup" },
      { t: 95, title: "The result" },
    ]);
    expect(youtubeChapters(ch, 200)).toEqual({ text: "0:00 Intro\n0:30 Setup\n1:35 The result", problems: [] });
  });

  it("says what would stop YouTube from showing them", () => {
    const { problems } = youtubeChapters([{ t: 0, title: "Intro" }, { t: 5, title: "Too soon" }], 60);
    expect(problems.some((p) => p.includes("at least 3"))).toBe(true);
    expect(problems.some((p) => p.includes("Intro") && p.includes("10 seconds"))).toBe(true);
  });

  it("cleans what the AI suggests: first at 0, 10 s apart, inside the video", () => {
    const out = cleanChapters(
      [
        { start: 3, title: "Hello" },
        { start: 8, title: "too close" },
        { start: 40, title: "Main part" },
        { start: 300, title: "past the end" },
        { start: 55, title: "" },
      ],
      60
    );
    expect(out).toEqual([
      { t: 0, title: "Hello" },
      { t: 40, title: "Main part" },
    ]);
  });
});

describe("beat markers", () => {
  /** Short clicks every `period` seconds, like a metronome. */
  const clicks = (bpm: number, seconds: number, rate = 22050, offset = 0.1) => {
    const s = new Float32Array(Math.round(seconds * rate));
    const period = 60 / bpm;
    for (let t = offset; t < seconds; t += period) {
      const i0 = Math.round(t * rate);
      for (let i = 0; i < 300 && i0 + i < s.length; i++) s[i0 + i] = Math.sin(i * 0.3) * Math.exp(-i / 80);
    }
    for (let i = 0; i < s.length; i++) s[i] += (Math.random() - 0.5) * 0.001;
    return s;
  };

  it.each([120, 90, 140])("finds %i BPM and beats on the clicks", (bpm) => {
    const r = findBeats(clicks(bpm, 12), 22050);
    expect(Math.abs(r.bpm - bpm)).toBeLessThan(3);
    const period = 60 / bpm;
    // every beat within 40 ms of a click
    for (const b of r.beats) {
      const k = Math.round((b - 0.1) / period);
      expect(Math.abs(b - (0.1 + k * period))).toBeLessThan(0.04);
    }
    expect(r.beats.length).toBeGreaterThan(12 / period - 3);
  });

  it("works on sound decoded by FFmpeg the way the route reads it (f32le)", () => {
    const dir = mkdtempSync(join(tmpdir(), "VDO-beats-"));
    const click = join(dir, "click.wav");
    // one 50 ms beep then silence, half a second long, looped 16 times: 120 BPM
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=f=1000:d=0.05,apad=pad_dur=0.45", "-t", "0.5", click]);
    const pcm = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-stream_loop", "15", "-i", click, "-ac", "1", "-ar", "22050", "-f", "f32le", "pipe:1"], { maxBuffer: 64 * 1024 * 1024 });
    const samples = new Float32Array(new Uint8Array(pcm).buffer.slice(0, Math.floor(pcm.byteLength / 4) * 4));
    const r = findBeats(samples, 22050);
    expect(Math.abs(r.bpm - 120)).toBeLessThan(3);
    expect(r.beats.length).toBeGreaterThanOrEqual(13);
  });

  it("silence has no beat; every 2nd / 4th thin the markers", () => {
    expect(findBeats(new Float32Array(22050 * 5), 22050).beats).toEqual([]);
    expect(everyNth([0, 1, 2, 3, 4, 5, 6, 7, 8], 4)).toEqual([0, 4, 8]);
  });
});

describe("thumbnail frame", () => {
  it("is the source second Video 1 shows at the playhead (trim and speed applied)", () => {
    let d = setClip(base(), "v1", { in: 10, out: 30, speed: 2 });
    expect(mainFrameAt(d, 3)).toEqual({ mediaId: V, src: 16 });
    expect(mainFrameAt(d, 99)).toBeNull();
    d = setClip(d, "v1", { reversed: true });
    expect(mainFrameAt(d, 3)).toEqual({ mediaId: V, src: 24 });
  });
});
