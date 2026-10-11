import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeSyntheticClip } from "../fixtures";

const tmp = mkdtempSync(join(tmpdir(), "VDO-ai-"));
process.env.VDO_STORAGE = join(tmp, "storage");
const grey = join(tmp, "grey.mp4");
const mac = process.platform === "darwin";

type Mods = {
  videos: typeof import("@/lib/videos");
  masks: typeof import("@/lib/ai/masks");
  preview: typeof import("@/lib/ffmpeg/preview");
  encode: typeof import("@/lib/ffmpeg/encode");
  spec: typeof import("@/lib/edit/spec");
  ai: typeof import("@/lib/ops/aiMatte");
};
let m: Mods;

beforeAll(async () => {
  // a blue ellipse moving over a grey room: no green screen, one clear subject
  makeSyntheticClip(grey, { bg: "0x808080", audio: false, duration: 2 });
  m = {
    videos: await import("@/lib/videos"),
    masks: await import("@/lib/ai/masks"),
    preview: await import("@/lib/ffmpeg/preview"),
    encode: await import("@/lib/ffmpeg/encode"),
    spec: await import("@/lib/edit/spec"),
    ai: await import("@/lib/ops/aiMatte"),
  };
}, 120_000);
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const alphaAt = (png: Buffer, x: number, y: number) => {
  const raw = execFileSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-vf",
      `crop=1:1:${x}:${y},format=rgba`,
      "-f",
      "rawvideo",
      "pipe:1",
    ],
    { input: png },
  );
  return raw[3];
};

describe.skipIf(!mac)(
  "AI Removal (Apple Vision) on a clip without a green screen",
  () => {
    it("previews one frame at once, makes the whole-clip mask, and exports a transparent WebM", async () => {
      const body = Readable.toWeb(
        createReadStream(grey),
      ) as unknown as WebReadableStream<Uint8Array>;
      const video = await m.videos.saveUpload(
        body,
        "video/mp4",
        "grey.mp4",
        null,
      );
      expect(video.keyKind).toBeNull();
      const params = { ...m.ai.aiMatte.defaults, mode: "subject" as const };
      const spec = {
        ...m.spec.DEFAULT_SPEC,
        ops: [{ id: "ai", type: "aiMatte" as const, enabled: true, params }],
      };

      // before the mask exists: a one-frame mask made on the spot
      const one = await m.masks.previewMaskForSpec(video, spec, 1);
      expect(one?.raw).toEqual({ w: 1280, h: 720 });
      const { png } = await m.preview.renderPreview(
        m.videos.sourcePath(video.id),
        video.info,
        spec,
        1,
        undefined,
        one,
      );
      // t=1: the ellipse is around x = 430+250*sin(1.6)+210 ≈ 890, y ≈ 360
      expect(alphaAt(png, 890, 360)).toBeGreaterThan(240);
      expect(alphaAt(png, 30, 30)).toBeLessThan(10);

      // the whole clip, one mask frame per video frame
      const mp = m.ai.maskParamsOf(params);
      const file = await m.masks.ensureMask(video, mp);
      expect(existsSync(file)).toBe(true);
      const meta = await m.masks.readMaskMeta(video.id, m.masks.maskKey(mp));
      expect(meta?.frames).toBe(48);
      expect((await m.masks.maskStatus(video, mp)).state).toBe("ready");

      // export: the mask is merged as alpha
      const out = join(tmp, "ai.webm");
      execFileSync(
        "ffmpeg",
        m.encode.buildEncodeArgs(
          "webm",
          spec,
          video.info,
          m.videos.sourcePath(video.id),
          out,
          { progress: false, mask: file },
        ),
      );
      const frame = execFileSync("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-c:v",
        "libvpx-vp9",
        "-ss",
        "1",
        "-i",
        out,
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
      expect(frame[30 * 1280 + 30]).toBeLessThan(10);
      expect(frame[360 * 1280 + 890]).toBeGreaterThan(240);
      const frames = execFileSync("ffprobe", [
        "-v",
        "error",
        "-count_frames",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=nb_read_frames",
        "-of",
        "csv=p=0",
        out,
      ])
        .toString()
        .trim();
      expect(Number(frames)).toBe(48);

      // the playing preview: picture on top, mask underneath
      const packed = await m.masks.ensurePacked(video, mp);
      const size = execFileSync("ffprobe", [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=p=0",
        packed,
      ])
        .toString()
        .trim();
      expect(size).toBe("1280,1440");
    }, 300_000);
  },
);
