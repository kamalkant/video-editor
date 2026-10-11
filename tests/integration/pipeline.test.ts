import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeBlackBgClip, makeSyntheticClip } from "../fixtures";

const tmp = mkdtempSync(join(tmpdir(), "VDO-it-"));
process.env.VDO_STORAGE = join(tmp, "storage");

type Mods = {
  videos: typeof import("@/lib/videos");
  jobs: typeof import("@/lib/jobs/queue");
  preview: typeof import("@/lib/ffmpeg/preview");
  settings: typeof import("@/lib/settings");
  caps: typeof import("@/lib/ffmpeg/capabilities");
  storage: typeof import("@/lib/storage");
  spec: typeof import("@/lib/edit/spec");
  estimate: typeof import("@/lib/ffmpeg/estimate");
  cropbox: typeof import("@/lib/ffmpeg/cropbox");
};
let m: Mods;
const clip = join(tmp, "veo.mp4");
const grey = join(tmp, "grey.mp4");

function upload(path: string, type = "video/mp4") {
  const body = Readable.toWeb(
    createReadStream(path),
  ) as unknown as WebReadableStream<Uint8Array>;
  return m.videos.saveUpload(body, type, "veo.mp4", null);
}

/** Decode one frame's alpha plane (160 px wide). */
function alphaOf(file: string, t: number, webm: boolean): Buffer {
  return execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    ...(webm ? ["-c:v", "libvpx-vp9"] : []),
    "-ss",
    String(t),
    "-i",
    file,
    "-frames:v",
    "1",
    "-vf",
    "alphaextract,scale=160:90",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "gray",
    "pipe:1",
  ]);
}

/** Mean RGB of a small patch (inside the skin area of the subject at t=2). */
function patchRgb(file: string, webm: boolean): number[] {
  const b = execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    ...(webm ? ["-c:v", "libvpx-vp9"] : []),
    "-ss",
    "2",
    "-i",
    file,
    "-frames:v",
    "1",
    "-vf",
    "crop=10:10:620:170",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "pipe:1",
  ]);
  const sum = [0, 0, 0];
  for (let i = 0; i < b.length; i += 3)
    for (let c = 0; c < 3; c++) sum[c] += b[i + c];
  return sum.map((s) => s / (b.length / 3));
}

beforeAll(async () => {
  makeSyntheticClip(clip);
  makeSyntheticClip(grey, { bg: "0x808080", audio: false, duration: 2 });
  m = {
    videos: await import("@/lib/videos"),
    jobs: await import("@/lib/jobs/queue"),
    preview: await import("@/lib/ffmpeg/preview"),
    settings: await import("@/lib/settings"),
    caps: await import("@/lib/ffmpeg/capabilities"),
    storage: await import("@/lib/storage"),
    spec: await import("@/lib/edit/spec"),
    estimate: await import("@/lib/ffmpeg/estimate"),
    cropbox: await import("@/lib/ffmpeg/cropbox"),
  };
});

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("pipeline on a synthetic Veo clip", () => {
  it("reports HEVC alpha support on this Mac", async () => {
    const c = await m.caps.getCapabilities();
    expect(c.message).toBeNull();
    expect(c.ok).toBe(true);
  });

  it("uploads, probes and auto-detects the key color", async () => {
    const v = await upload(clip);
    expect(v.info).toMatchObject({
      width: 1280,
      height: 720,
      fps: 24,
      hasAudio: true,
      soundDetected: true,
    });
    expect(v.keyKind).toBe("green");
    const [r, g, b] = [1, 3, 5].map((i) =>
      parseInt(v.suggestedKey!.slice(i, i + 2), 16),
    );
    expect(
      Math.abs(r - 0x12) + Math.abs(g - 0xaf) + Math.abs(b - 0x34),
    ).toBeLessThan(24);
  });

  it("finds no key on a grey background (soft result)", async () => {
    const v = await upload(grey);
    expect(v.suggestedKey).toBeNull();
    expect(v.info.hasAudio).toBe(false);
  });

  it("rejects a text file renamed to .mp4", async () => {
    const txt = join(tmp, "fake.mp4");
    execFileSync("sh", ["-c", `echo hello > '${txt}'`]);
    await expect(upload(txt)).rejects.toMatchObject({ code: "unreadable" });
  });

  it("renders an exact preview and flags a see-through subject", async () => {
    const v = await upload(clip);
    const ok = await m.preview.renderPreview(
      m.videos.sourcePath(v.id),
      v.info,
      m.spec.DEFAULT_SPEC,
      2,
    );
    expect(ok.png.subarray(1, 4).toString()).toBe("PNG");
    expect(ok.stats.seeThroughPct).not.toBeNull();
    expect(ok.stats.seeThroughPct!).toBeLessThan(
      m.settings.SEE_THROUGH_WARN_PCT,
    );
    expect(ok.stats.transparentPct).toBeGreaterThan(60);
    const bad = await m.preview.renderPreview(
      m.videos.sourcePath(v.id),
      v.info,
      m.spec.specFromSettings({
        ...m.settings.DEFAULTS,
        similarity: 0.2,
        blend: 0.25,
      }),
      2,
    );
    expect(bad.stats.seeThroughPct!).toBeGreaterThan(
      m.settings.SEE_THROUGH_WARN_PCT,
    );
  });

  it("makes both web files with real transparency, a poster and a zip", async () => {
    const v = await upload(clip);
    const job = await m.jobs.createJob(v.id, m.spec.DEFAULT_SPEC);
    let j = job;
    for (
      let i = 0;
      i < 240 && (j.state === "queued" || j.state === "running");
      i++
    ) {
      await new Promise((r) => setTimeout(r, 500));
      j = (await m.jobs.getJob(job.id))!;
    }
    expect(j.error).toBeNull();
    expect(j.state).toBe("done");
    const kinds = j.files.map((f) => f.kind).sort();
    expect(kinds).toEqual(["mov", "poster", "webm", "zip"]);
    const dir = m.storage.jobDir(j.id);
    const webm = join(dir, "avatar.webm");
    const mov = join(dir, "avatar-safari.mov");

    const codecs = (f: string) =>
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_name,codec_tag_string",
        "-of",
        "csv=p=0",
        f,
      ]).toString();
    expect(codecs(webm)).toMatch(/vp9[\s\S]*opus/);
    expect(codecs(mov)).toMatch(/hevc,hvc1[\s\S]*aac/);

    for (const [f, isWebm] of [
      [webm, true],
      [mov, false],
    ] as const) {
      const a = alphaOf(f, 2, isWebm);
      expect(a[0]).toBeLessThan(10); // top-left corner is background → transparent
      expect(Math.max(...a)).toBeGreaterThan(245); // the subject is solid
    }
    // the colors of the two files match each other and the source (BT.709 both sides)
    const src = patchRgb(clip, false);
    const w = patchRgb(webm, true);
    const h = patchRgb(mov, false);
    for (let c = 0; c < 3; c++) {
      expect(Math.abs(w[c] - src[c])).toBeLessThan(8);
      expect(Math.abs(h[c] - src[c])).toBeLessThan(8);
    }
    const size = (k: string) => j.files.find((f) => f.kind === k)!.size;

    // the size estimate (2 s sample, scaled) lands near the real sizes
    const est = await m.estimate.estimateSizes(
      v.id,
      m.videos.sourcePath(v.id),
      v.info,
      m.spec.DEFAULT_SPEC,
    );
    for (const k of ["webm", "mov"] as const) {
      const ratio = est[k] / size(k);
      expect(
        ratio,
        `${k} estimate ${est[k]} vs real ${size(k)}`,
      ).toBeGreaterThan(0.65);
      expect(ratio, `${k} estimate ${est[k]} vs real ${size(k)}`).toBeLessThan(
        1.35,
      );
    }
    expect(size("webm")).toBeLessThan(1_500_000);
    expect(size("mov")).toBeLessThan(2_500_000);

    // Apple's decoder (what Safari uses) must see the transparency too
    const swift = join(process.cwd(), "scripts/check-hevc-alpha.swift");
    if (existsSync(swift)) {
      try {
        const out = execFileSync("swift", [swift, mov], { encoding: "utf8" });
        expect(out).toContain("TRANSPARENT");
      } catch (err: any) {
        if (err?.message?.includes("Xcode license") || err?.stderr?.includes("Xcode license")) {
          console.warn("Skipping Swift alpha check: Xcode license not accepted");
        } else {
          throw err;
        }
      }
    }
  });

  it("crops to the area the person covers; smaller file, still transparent", async () => {
    const v = await upload(clip);
    const spec = structuredClone(m.spec.DEFAULT_SPEC);
    spec.output.crop = { enabled: true, padding: 10 };
    const box = await m.cropbox.findCropBox(
      v.id,
      m.videos.sourcePath(v.id),
      v.info,
      spec,
    );
    // the subject moves x 180→680 and is 420×560 (soft edge), so the union + 10 px ≈ 176,76 928×568
    expect(box).not.toBeNull();
    for (const [k, want] of Object.entries({ x: 176, y: 76, w: 928, h: 568 }))
      expect(Math.abs(box![k as "x"] - want), k).toBeLessThanOrEqual(8);

    const plain = await m.jobs.createJob(v.id, m.spec.DEFAULT_SPEC);
    const cropped = await m.jobs.createJob(v.id, spec);
    const wait = async (id: string) => {
      for (let i = 0; i < 240; i++) {
        const j = (await m.jobs.getJob(id))!;
        if (j.state !== "queued" && j.state !== "running") return j;
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error("timeout");
    };
    const [a, b] = [await wait(plain.id), await wait(cropped.id)];
    expect(b.error).toBeNull();
    expect(b.output).toMatchObject({ width: box!.w, height: box!.h });
    const sz = (j: typeof a, k: string) =>
      j.files.find((f) => f.kind === k)!.size;
    expect(sz(b, "webm")).toBeLessThan(sz(a, "webm"));
    const webm = join(m.storage.jobDir(b.id), "avatar.webm");
    const dims = execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0",
      "-select_streams",
      "v:0",
      webm,
    ])
      .toString()
      .trim();
    expect(dims).toBe(`${box!.w},${box!.h}`);
    const alpha = execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-c:v",
      "libvpx-vp9",
      "-ss",
      "2",
      "-i",
      webm,
      "-frames:v",
      "1",
      "-vf",
      "alphaextract",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "gray",
      "pipe:1",
    ]);
    let lo = 255;
    let hi = 0;
    for (const x of alpha) {
      if (x < lo) lo = x;
      if (x > hi) hi = x;
    }
    expect(lo).toBeLessThan(10);
    expect(hi).toBeGreaterThan(245);
  });

  it("exports only the kept parts of a cut clip, with the sound in step", async () => {
    const v = await upload(clip);
    // keep 0–1 s and 2–4 s: 3 seconds, 72 frames
    const spec = m.spec.parseSpec(
      {
        ...m.spec.DEFAULT_SPEC,
        timeline: {
          clips: [
            { id: "a", in: 0, out: 1 },
            { id: "b", in: 2, out: 4 },
          ],
        },
      },
      m.settings.limitsOf(v.info),
    );
    const job = await m.jobs.createJob(v.id, spec);
    let j = job;
    for (
      let i = 0;
      i < 240 && (j.state === "queued" || j.state === "running");
      i++
    ) {
      await new Promise((r) => setTimeout(r, 500));
      j = (await m.jobs.getJob(job.id))!;
    }
    expect(j.error).toBeNull();
    for (const name of ["avatar.webm", "avatar-safari.mov"]) {
      const f = join(m.storage.jobDir(j.id), name);
      const probe = execFileSync("ffprobe", [
        "-v",
        "error",
        "-count_frames",
        "-show_entries",
        "stream=codec_type,nb_read_frames:format=duration",
        "-of",
        "json",
        f,
      ]).toString();
      const info = JSON.parse(probe) as {
        streams: { codec_type: string; nb_read_frames: string }[];
        format: { duration: string };
      };
      expect(
        Number(
          info.streams.find((x) => x.codec_type === "video")!.nb_read_frames,
        ),
        name,
      ).toBe(72);
      expect(Number(info.format.duration), name).toBeGreaterThan(2.9);
      expect(Number(info.format.duration), name).toBeLessThan(3.15);
    }
    // the first kept frame after the cut is the source frame at 2 s (the subject moved in between)
    const webm = join(m.storage.jobDir(j.id), "avatar.webm");
    const frameAt = (f: string, t: number, decoder: string[]) =>
      execFileSync("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        ...decoder,
        "-ss",
        String(t),
        "-i",
        f,
        "-frames:v",
        "1",
        "-vf",
        "scale=64:36,format=gray",
        "-f",
        "rawvideo",
        "pipe:1",
      ]);
    const out = frameAt(webm, 1.0, ["-c:v", "libvpx-vp9"]);
    const src2 = frameAt(clip, 2.0, []);
    const src1 = frameAt(clip, 1.0, []);
    const diff = (a: Buffer, b: Buffer) =>
      a.reduce((acc, x, i) => acc + Math.abs(x - b[i]), 0) / a.length;
    expect(diff(out, src2)).toBeLessThan(diff(out, src1));
  });

  it("removes a black background (fire/sparks) and keeps the glow", async () => {
    const fire = join(tmp, "fire.mp4");
    makeBlackBgClip(fire);
    const v = await upload(fire);
    expect(v.keyKind).toBe("black");
    expect(v.suggestedKey).toBeNull();
    const spec = structuredClone(m.spec.DEFAULT_SPEC);
    spec.ops = [
      { ...spec.ops[0], enabled: false },
      {
        id: "black",
        type: "blackKey",
        enabled: true,
        params: { threshold: 0.03, restoreColor: true },
      },
    ] as typeof spec.ops;
    const job = await m.jobs.createJob(v.id, spec);
    let j = job;
    for (
      let i = 0;
      i < 240 && (j.state === "queued" || j.state === "running");
      i++
    ) {
      await new Promise((r) => setTimeout(r, 500));
      j = (await m.jobs.getJob(job.id))!;
    }
    expect(j.error).toBeNull();
    const webm = join(m.storage.jobDir(j.id), "avatar.webm");
    // t=0: glow centre at x=400+150, y=210+150
    const px = (x: number, y: number) =>
      execFileSync("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-c:v",
        "libvpx-vp9",
        "-i",
        webm,
        "-frames:v",
        "1",
        "-vf",
        `crop=2:2:${x}:${y},format=rgba`,
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        "pipe:1",
      ]);
    expect(px(20, 20)[3]).toBeLessThan(10); // black corner → transparent
    expect(px(550, 360)[3]).toBeGreaterThan(240); // glow centre → solid
    const halo = px(550 + 120, 360); // dim outer glow: partly transparent but still bright orange
    expect(halo[3]).toBeGreaterThan(20);
    expect(halo[3]).toBeLessThan(230);
    expect(halo[0]).toBeGreaterThan(200); // brightness restored (not dim brown)
  });
});
