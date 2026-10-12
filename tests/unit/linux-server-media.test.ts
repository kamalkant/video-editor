import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyDoc, type MediaLite, type TimelineDoc } from "@/lib/edit/doc";
import { addMedia } from "@/lib/edit/docEdit";

// The site runs on Linux hosts (Hostinger): no Apple encoders there. Uploads, working copies and exports must
// use what a normal FFmpeg has, and the Safari-only see-through file must not block everything else.
const realPlatform = process.platform;
const onPlatform = async (platform: NodeJS.Platform) => {
  Object.defineProperty(process, "platform", { value: platform });
  vi.resetModules();
};
afterEach(() => {
  Object.defineProperty(process, "platform", { value: realPlatform });
  vi.doUnmock("@/lib/ffmpeg/run");
  vi.resetModules();
});

const V = "11111111-1111-4111-8111-111111111111";
const vid: MediaLite = { id: V, kind: "video", fileName: "v.mp4", width: 1280, height: 720, fps: 30, duration: 6, hasAudio: true, suggestedKey: null, keyKind: null };
const doc = (): TimelineDoc => addMedia({ ...emptyDoc(), canvas: { width: 1280, height: 720, fps: 30, background: "#000000" } }, vid, { id: "v1" }).doc;

describe("on a Linux server", () => {
  it("working copies use libx264, not Apple's hardware encoder", async () => {
    await onPlatform("linux");
    const run = await import("@/lib/ffmpeg/run");
    expect(run.APPLE_MEDIA).toBe(false);
    expect(run.FAST_H264).toBe("libx264");
    expect(run.fastH264Args(4000).join(" ")).toBe("-c:v libx264 -preset veryfast -crf 20");
  });

  it("an HEVC export uses libx265", async () => {
    await onPlatform("linux");
    const { buildComposeArgs } = await import("@/lib/render/compose");
    const s = buildComposeArgs(doc(), { [V]: { path: "/v.mp4", hasAudio: true, width: 1280, height: 720 } }, "hevc", "/out.mp4", { progress: false }).join(" ");
    expect(s).toContain("-c:v libx265");
    expect(s).toContain("-tag:v hvc1");
    expect(s).not.toContain("videotoolbox");
  });

  it("FFmpeg without Apple's encoders still counts as ready (only Safari's see-through file is off)", async () => {
    await onPlatform("linux");
    const encoders = " V..... libvpx-vp9 x\n V..... libx264 x\n V..... libx265 x\n";
    const filters = ["chromakey", "despill", "alphaextract", "alphamerge", "overlay", "lut", "erosion", "dilation", "gblur", "scale"].map((f) => ` ... ${f} x`).join("\n") + "\n";
    const run = (testJob: () => Buffer) => ({
      APPLE_MEDIA: false,
      FFMPEG: "/srv/vendor/ffmpeg/ffmpeg",
      FfmpegError: class extends Error {
        constructor(message: string, readonly code: number | null, readonly stderrTail: string) {
          super(message);
        }
      },
      runFfmpeg: async (args: string[]) => ({
        stdout: args.includes("lavfi") ? testJob() : Buffer.from(args[0] === "-encoders" ? encoders : args[0] === "-filters" ? filters : "ffmpeg version 7.0.2"),
      }),
    });
    vi.doMock("@/lib/ffmpeg/run", () => run(() => Buffer.alloc(2000)));
    const { getCapabilities } = await import("@/lib/ffmpeg/capabilities");
    expect(await getCapabilities(true)).toMatchObject({ ok: true, safariAlpha: false, ffmpegVersion: "7.0.2", message: null });

    // ...but a real job that fails (a host limiting threads, say) is reported, with FFmpeg's reason, not its folders
    vi.resetModules();
    vi.doMock("@/lib/ffmpeg/run", async () => {
      const m = run(() => Buffer.alloc(0));
      return { ...m, runFfmpeg: async (args: string[]) => {
        if (args.includes("lavfi")) throw new m.FfmpegError("exited", 1, "x\npthread_create failed: Resource temporarily unavailable in /home/u1/app/x\n");
        return m.runFfmpeg(args);
      } };
    });
    const again = await (await import("@/lib/ffmpeg/capabilities")).getCapabilities(true);
    expect(again.ok).toBe(false);
    expect(again.message).toContain("pthread_create failed: Resource temporarily unavailable");
    expect(again.message).not.toContain("/home/u1");
  });

  it("with no FFmpeg at all, the message doesn't tell the server to `brew install`", async () => {
    await onPlatform("linux");
    vi.doMock("@/lib/ffmpeg/run", () => ({ APPLE_MEDIA: false, FFMPEG: "ffmpeg", runFfmpeg: async () => { throw new Error("ENOENT"); } }));
    const { getCapabilities } = await import("@/lib/ffmpeg/capabilities");
    const caps = await getCapabilities(true);
    expect(caps.ok).toBe(false);
    expect(caps.message).not.toMatch(/brew/);
    expect(caps.message).toMatch(/FFMPEG_PATH/);
  });
});

describe("on a Mac", () => {
  it("keeps Apple's fast encoders", async () => {
    await onPlatform("darwin");
    const run = await import("@/lib/ffmpeg/run");
    expect(run.FAST_H264).toBe("h264_videotoolbox");
    const { buildComposeArgs } = await import("@/lib/render/compose");
    expect(buildComposeArgs(doc(), { [V]: { path: "/v.mp4", hasAudio: true, width: 1280, height: 720 } }, "hevc", "/out.mp4", { progress: false }).join(" ")).toContain("hevc_videotoolbox");
  });
});
