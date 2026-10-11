import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { TEMPLATE_AUDIO_TRACKS, TEMPLATE_VIDEO_CLIPS } from "@/lib/templates/templateMediaAssets";
import { listLibrary } from "@/lib/library";

describe("Template Media & Audio Integration", () => {
  it("has all 8 broadcast audio files physically present in public/templates/audio", () => {
    expect(TEMPLATE_AUDIO_TRACKS.length).toBeGreaterThanOrEqual(8);
    for (const track of TEMPLATE_AUDIO_TRACKS) {
      const fullPath = join(process.cwd(), "public", track.url);
      expect(existsSync(fullPath), `Audio file missing: ${fullPath}`).toBe(true);
    }
  });

  it("has all 12 broadcast video loops physically present in public/templates/media", () => {
    expect(TEMPLATE_VIDEO_CLIPS.length).toBeGreaterThanOrEqual(12);
    for (const clip of TEMPLATE_VIDEO_CLIPS) {
      const fullPath = join(process.cwd(), "public", clip.url);
      expect(existsSync(fullPath), `Video file missing: ${fullPath}`).toBe(true);
    }
  });

  it("registers broadcast audio items in the library with correct moods and sources", async () => {
    const { items } = await listLibrary();
    const broadcastItems = items.filter((x) => x.id.startsWith("broadcast-"));
    expect(broadcastItems.length).toBeGreaterThanOrEqual(8);

    const newsroom = broadcastItems.find((x) => x.id === "broadcast-theme-newsroom");
    expect(newsroom).toBeDefined();
    expect(newsroom?.title).toBe("Broadcast Newsroom Fanfare");
    expect(newsroom?.mood).toBe("News");
    expect(newsroom?.duration).toBe(20);

    const breaking = broadcastItems.find((x) => x.id === "broadcast-theme-breaking");
    expect(breaking).toBeDefined();
    expect(breaking?.title).toBe("Urgent Breaking News Alarm");
    expect(breaking?.mood).toBe("Dramatic");
  });
});
