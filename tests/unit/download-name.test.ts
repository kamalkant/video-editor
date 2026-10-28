import { describe, expect, it } from "vitest";
import { downloadNameOf } from "@/lib/export/fileName";

/** A downloaded export is named after its project ("video.mp4" every time made "video (3).mp4" in Downloads). */
describe("downloadNameOf", () => {
  it("names the main file after the project, keeping its extension", () => {
    expect(downloadNameOf("Goa trip", "video.mp4")).toBe("Goa trip.mp4");
    expect(downloadNameOf("Goa trip", "video.webm")).toBe("Goa trip.webm");
    expect(downloadNameOf("Goa trip", "frame.png")).toBe("Goa trip.png");
  });
  it("adds what the other files are", () => {
    expect(downloadNameOf("Goa trip", "poster.png")).toBe("Goa trip - poster.png");
    expect(downloadNameOf("Goa trip", "video-hevc.mp4")).toBe("Goa trip - hevc.mp4");
    expect(downloadNameOf("Goa trip", "ViPlay-website-files.zip")).toBe("Goa trip - ViPlay-website-files.zip");
  });
  it("leaves out what a file name can't hold, and keeps Hindi", () => {
    expect(downloadNameOf('  a/b\\c:d*e?"f<g>h|i  ', "video.mp4")).toBe("a b c d e f g h i.mp4");
    expect(downloadNameOf("मेरी यात्रा", "video.mp4")).toBe("मेरी यात्रा.mp4");
    expect(downloadNameOf("x".repeat(200), "video.mp4")).toBe(`${"x".repeat(80)}.mp4`);
  });
  it("keeps the file's own name without a project name", () => {
    expect(downloadNameOf("", "video.mp4")).toBe("video.mp4");
    expect(downloadNameOf(null, "poster.png")).toBe("poster.png");
    expect(downloadNameOf(" ... ", "video.mp4")).toBe("video.mp4");
  });
});
