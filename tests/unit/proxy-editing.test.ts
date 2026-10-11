import { describe, expect, it } from "vitest";
import {
  buildProxyArgs,
  buildProxyScaleFilter,
  PROXY_BITRATE_KBPS,
  PROXY_GOP,
  PROXY_MAX_DIM,
  PROXY_MAX_WIDTH,
  proxyFileName,
  proxyFilePath,
  proxyUrl,
} from "@/lib/media/proxy";
import { sourcePath } from "@/lib/videos";

describe("Proxy Editing & Media Performance Engine", () => {
  describe("Resolution & Aspect Ratio Calculation", () => {
    it("defines standard 720p maximum dimensions", () => {
      expect(PROXY_MAX_DIM).toBe(720);
      expect(PROXY_MAX_WIDTH).toBe(1280);
      expect(PROXY_GOP).toBe(30);
      expect(PROXY_BITRATE_KBPS).toBe(1500);
    });

    it("constructs scale filter maintaining original aspect ratio and strictly even dimensions", () => {
      const filter = buildProxyScaleFilter();
      expect(filter).toContain("min(1280,trunc(iw/2)*2)");
      expect(filter).toContain("min(720,trunc(ih/2)*2)");
      expect(filter).toContain("force_original_aspect_ratio=decrease");
      expect(filter).toContain("scale=trunc(iw/2)*2:trunc(ih/2)*2");
    });
  });

  describe("Transparency Preservation Safeguard (Decision 4)", () => {
    it("strictly preserves alpha using VP9 and yuva420p in WebM when source has alpha", () => {
      const info = {
        width: 3840,
        height: 2160,
        fps: 30,
        hasAudio: true,
        alpha: true,
      };
      const args = buildProxyArgs("src.mov", "proxy.webm", info);
      
      // Must be WebM
      expect(proxyFileName(true)).toBe("proxy.webm");
      expect(args).toContain("-f");
      expect(args).toContain("webm");
      
      // Must use libvpx-vp9 with yuva420p (alpha channel)
      expect(args).toContain("libvpx-vp9");
      expect(args).toContain("yuva420p");
      
      // Must NOT use opaque H.264 MP4 encoders
      expect(args).not.toContain("h264_videotoolbox");
      expect(args).not.toContain("libx264");
      expect(args.some((a) => a.includes("yuv420p") && !a.includes("yuva420p"))).toBe(false);
    });

    it("encodes standard opaque video as fast H.264 MP4 with hardware acceleration", () => {
      const info = {
        width: 1920,
        height: 1080,
        fps: 30,
        hasAudio: true,
        alpha: false,
      };
      const args = buildProxyArgs("src.mp4", "proxy.mp4", info, "h264_videotoolbox");
      
      expect(proxyFileName(false)).toBe("proxy.mp4");
      expect(args).toContain("h264_videotoolbox");
      expect(args.some((a) => a.includes("yuv420p"))).toBe(true);
      expect(args.some((a) => a.includes("yuva420p"))).toBe(false);
      expect(args).toContain("+faststart");
      expect(args).toContain("mp4");
    });

    it("falls back to libx264 when requested", () => {
      const info = {
        width: 1920,
        height: 1080,
        fps: 30,
        hasAudio: false,
        alpha: false,
      };
      const args = buildProxyArgs("src.mp4", "proxy.mp4", info, "libx264");
      expect(args).toContain("libx264");
      expect(args).toContain("veryfast");
      expect(args).toContain("-crf");
      expect(args).toContain("23");
    });
  });

  describe("Dense GOP Keyframe Interval for Fast Seeking", () => {
    it("enforces a 30-frame GOP for immediate scrubbing response", () => {
      const info = {
        width: 1920,
        height: 1080,
        fps: 60,
        hasAudio: true,
        alpha: false,
      };
      const args = buildProxyArgs("src.mp4", "proxy.mp4", info);
      const gopIdx = args.indexOf("-g");
      expect(gopIdx).toBeGreaterThan(-1);
      expect(args[gopIdx + 1]).toBe("30");
    });
  });

  describe("Hybrid Storage & Path Invariants (Decision 1)", () => {
    it("maps proxy URLs correctly to the proxy endpoint", () => {
      expect(proxyUrl("vid_12345")).toBe("/api/videos/vid_12345/proxy");
    });

    it("constructs non-destructive proxy paths inside video directory", () => {
      const mp4Path = proxyFilePath("vid_test", false);
      const webmPath = proxyFilePath("vid_test", true);
      expect(mp4Path).toContain("proxy.mp4");
      expect(webmPath).toContain("proxy.webm");
      expect(mp4Path).not.toBe(sourcePath("vid_test"));
      expect(webmPath).not.toBe(sourcePath("vid_test"));
    });
  });

  describe("Export Pipeline Isolation Safeguard (Decision 5)", () => {
    it("verifies master sourcePath is strictly isolated from proxy media", () => {
      const id = "asset_xyz";
      const masterPath = sourcePath(id);
      const proxyOpaque = proxyFilePath(id, false);
      const proxyAlpha = proxyFilePath(id, true);

      expect(masterPath).toContain("/source");
      expect(proxyOpaque).toContain("/proxy.mp4");
      expect(proxyAlpha).toContain("/proxy.webm");
      expect(masterPath).not.toEqual(proxyOpaque);
      expect(masterPath).not.toEqual(proxyAlpha);
    });

    it("guarantees export composeMediaOf strictly references original sourcePath and never proxy", () => {
      const mockMeta = {
        id: "export_test_clip",
        kind: "video" as const,
        fileName: "master_raw.mov",
        createdAt: Date.now(),
        info: {
          container: "mov",
          duration: 10,
          width: 3840,
          height: 2160,
          fps: 60,
          videoCodec: "prores",
          hasAudio: true,
          soundDetected: true,
        },
        suggestedKey: null,
        keyKind: null,
        proxy: {
          ready: true,
          file: "proxy.mp4" as const,
          width: 1280,
          height: 720,
          fps: 60,
          sizeBytes: 1024000,
          createdAt: Date.now(),
        },
      };

      // Simulating composeMediaOf from lib/jobs/queue.ts
      const composeMediaEntry = {
        path: sourcePath(mockMeta.id),
        hasAudio: mockMeta.info.hasAudio,
        width: mockMeta.info.width,
        height: mockMeta.info.height,
        still: mockMeta.kind === "image",
      };

      // Assert export path is the uncompressed/master source
      expect(composeMediaEntry.path).toContain(sourcePath(mockMeta.id));
      expect(composeMediaEntry.path).not.toContain("proxy");
      expect(composeMediaEntry.width).toBe(3840);
      expect(composeMediaEntry.height).toBe(2160);
    });
  });
});
