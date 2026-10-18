import { describe, expect, it } from "vitest";
import { isWebCodecsSupported, canExportLocally } from "@/lib/export/localExport";
import { docDuration, emptyDoc, layersAt, mainStarts, mainTrack, videoClipOf } from "@/lib/edit/doc";

describe("localExport WebCodecs engine", () => {
  it("detects environment capabilities safely", () => {
    // In Node test environment, window/WebCodecs is typically undefined
    const supported = isWebCodecsSupported();
    expect(typeof supported).toBe("boolean");
  });

  it("handles still image formats locally", async () => {
    const pngSupported = await canExportLocally("png", 1920, 1080);
    const jpgSupported = await canExportLocally("jpg", 1920, 1080);
    expect(pngSupported).toBe(true);
    expect(jpgSupported).toBe(true);
  });

  it("handles video formats safely in non-browser environment without crashing", async () => {
    const mp4Supported = await canExportLocally("mp4", 1920, 1080);
    const movAlphaSupported = await canExportLocally("mov-alpha", 1920, 1080);
    expect(typeof mp4Supported).toBe("boolean");
    expect(typeof movAlphaSupported).toBe("boolean");
  });

  it("accurately sequences and composites 60 clips of 10s stitched together", () => {
    const doc = emptyDoc();
    const main = mainTrack(doc);
    const clipCount = 60;
    const clipDuration = 10;

    for (let i = 0; i < clipCount; i++) {
      const mediaId = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
      main.clips.push(
        videoClipOf(
          `clip-${i}`,
          {
            id: mediaId,
            fileName: `clip-${i}.mp4`,
            kind: "video",
            duration: clipDuration,
            width: 1920,
            height: 1080,
            fps: 30,
            hasAudio: true,
            suggestedKey: null,
            keyKind: null,
          },
          [],
        ),
      );
    }

    // Verify 600s total duration
    const duration = docDuration(doc);
    expect(duration).toBe(600);

    // Verify start times
    const starts = mainStarts(main.clips);
    expect(starts.length).toBe(60);
    expect(starts[0]).toBe(0);
    expect(starts[1]).toBe(10);
    expect(starts[59]).toBe(590);

    // Verify layersAt at various timeline points
    const layerAt5 = layersAt(doc, 5);
    expect(layerAt5.length).toBe(1);
    expect(layerAt5[0].clip.id).toBe("clip-0");

    const layerAt15 = layersAt(doc, 15);
    expect(layerAt15.length).toBe(1);
    expect(layerAt15[0].clip.id).toBe("clip-1");

    const layerAt595 = layersAt(doc, 595);
    expect(layerAt595.length).toBe(1);
    expect(layerAt595[0].clip.id).toBe("clip-59");
  });
});
