import { describe, expect, it } from "vitest";
import { playableArgs, playableFile, playableMode } from "@/lib/ffmpeg/playable";
import { precheck, VIDEO_ACCEPT } from "@/lib/api/upload";
import { checkProbe } from "@/lib/ffmpeg/probe";

const v = (container: string, videoCodec: string, audioCodec: string | null = "aac", alpha = false) => ({ container, videoCodec, audioCodec, hasAudio: !!audioCodec, alpha });

describe("a playable copy for the preview", () => {
  it("only when a browser can't play the upload", () => {
    expect(playableMode("video", v("mp4", "h264"))).toBe("none");
    expect(playableMode("video", v("webm", "vp9", "opus"))).toBe("none");
    expect(playableMode("video", v("webm", "av1", null))).toBe("none");
    // H.264 in another box (MKV shows as webm, AVI) or with PCM sound (camera .mov): copied as it is, new sound
    expect(playableMode("video", v("webm", "h264"))).toBe("remux");
    expect(playableMode("video", v("avi", "h264", "mp3"))).toBe("remux");
    expect(playableMode("video", v("mp4", "h264", "pcm_s16le"))).toBe("remux");
    // anything else: H.264 / AAC
    expect(playableMode("video", v("mp4", "prores", "pcm_s24le"))).toBe("mp4");
    expect(playableMode("video", v("mp4", "hevc"))).toBe("mp4");
    expect(playableMode("video", v("avi", "mpeg4", "mp3"))).toBe("mp4");
    // see-through: VP9 with alpha, so the preview stays see-through
    expect(playableMode("video", v("mp4", "prores", null, true))).toBe("webm-alpha");
    expect(playableMode("video", v("webm", "vp9", "opus", true))).toBe("none");
    // pictures and sounds play as they are
    expect(playableMode("image", v("image", "png", null, true))).toBe("none");
    expect(playableMode("audio", v("wav", "none", "pcm_s16le"))).toBe("none");
    expect(playableFile("webm-alpha")).toBe("playable.webm");
    expect(playableFile("mp4")).toBe("playable.mp4");
    expect(playableFile("none")).toBeNull();
  });
  it("the copy keeps the size and frame rate (no fps filter), and a remux doesn't re-encode the picture", () => {
    const mp4 = playableArgs("in.mov", "out.mp4", "mp4", { width: 1920, height: 1080, hasAudio: true }).join(" ");
    expect(mp4).toContain("h264_videotoolbox");
    expect(mp4).not.toMatch(/fps=|-r /);
    expect(playableArgs("in.mov", "out.mp4", "mp4", { width: 1920, height: 1080, hasAudio: false }, "libx264").join(" ")).toContain("libx264");
    expect(playableArgs("in.mkv", "out.mp4", "remux", { width: 1920, height: 1080, hasAudio: true }).join(" ")).toContain("-c:v copy");
    expect(playableArgs("in.mov", "out.webm", "webm-alpha", { width: 1920, height: 1080, hasAudio: false }).join(" ")).toContain("yuva420p");
  });
});

describe("every common video file is taken", () => {
  const f = (name: string, type = "") => new File([new Uint8Array(4)], name, { type });
  it("MP4, MOV, WebM, M4V, MKV and AVI pass the check before sending; other files don't", () => {
    for (const n of ["a.mp4", "a.mov", "a.webm", "a.m4v", "a.mkv", "a.avi", "A.MOV"]) expect(precheck(f(n)), n).toBeNull();
    expect(precheck(f("clip", "video/x-matroska"))).toBeNull();
    expect(precheck(f("a.exe"))).toBe("unsupported_type");
    expect(precheck(f("a.txt", "text/plain"))).toBe("unsupported_type");
    expect(VIDEO_ACCEPT).toContain(".mkv");
    expect(VIDEO_ACCEPT).toContain("video/x-msvideo");
  });
  it("the probe takes AVI and notes see-through pictures", () => {
    const probe = (format_name: string, pix_fmt: string) => checkProbe({ format: { format_name, duration: "2" }, streams: [{ codec_type: "video", codec_name: "prores", width: 640, height: 360, avg_frame_rate: "25/1", pix_fmt }] });
    expect(probe("avi", "yuv420p").container).toBe("avi");
    expect(probe("mov,mp4,m4a,3gp,3g2,mj2", "yuva444p10le").alpha).toBe(true);
    expect(probe("mov,mp4,m4a,3gp,3g2,mj2", "yuv422p10le").alpha).toBeUndefined();
    expect(() => probe("flv", "yuv420p")).toThrow(/MKV or AVI/);
  });
});
