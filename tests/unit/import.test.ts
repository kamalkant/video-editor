import { describe, expect, it } from "vitest";
import { youTubeAllowed } from "@/lib/import/jobs";
import { allowedUrl, bestFile, mapPexels, mapPixabay } from "@/lib/import/stock";
import { isoDuration, mapYouTube } from "@/lib/import/youtube";

describe("Import: reading the libraries' answers", () => {
  it("Pexels: title from the page, the author, our own thumbnail proxy", () => {
    const it = mapPexels({ id: 857195, width: 1920, height: 1080, duration: 12, url: "https://www.pexels.com/video/city-traffic-at-night-857195/", image: "https://images.pexels.com/videos/857195/x.jpeg", user: { name: "Jane", url: "https://www.pexels.com/@jane" } });
    expect(it).toMatchObject({ source: "pexels", id: "857195", title: "City traffic at night", author: "Jane", license: "free", duration: 12 });
    expect(it.thumb).toBe("/api/import/thumb?u=" + encodeURIComponent("https://images.pexels.com/videos/857195/x.jpeg"));
  });

  it("Pixabay: tags as the title and the author's page", () => {
    const it = mapPixabay({ id: 125, pageURL: "https://pixabay.com/videos/id-125/", tags: "ocean, waves, beach, sea", duration: 20, user: "bob", user_id: 7, videos: { medium: { url: "https://cdn.pixabay.com/v.mp4", width: 1280, height: 720, thumbnail: "https://cdn.pixabay.com/t.jpg" } } });
    expect(it).toMatchObject({ title: "Ocean, waves, beach", author: "bob", authorUrl: "https://pixabay.com/users/bob-7/", width: 1280 });
  });

  it("YouTube: length from ISO 8601, Creative Commons licence, and HTML entities in titles", () => {
    expect(isoDuration("PT1H2M3S")).toBe(3723);
    expect(isoDuration("PT45S")).toBe(45);
    expect(isoDuration("P1DT1M")).toBe(86460);
    expect(isoDuration("junk")).toBe(0);
    const it = mapYouTube({ id: "abcdefghijk", snippet: { title: "Tom &amp; Jerry&#39;s", channelTitle: "My channel", channelId: "UC1", thumbnails: { medium: { url: "https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg" } } }, contentDetails: { duration: "PT3M" }, status: { license: "creativeCommon" } });
    expect(it).toMatchObject({ title: "Tom & Jerry's", author: "My channel", license: "cc", duration: 180, pageUrl: "https://www.youtube.com/watch?v=abcdefghijk" });
  });

  it("picks the biggest MP4 up to 1080 on its short side", () => {
    const files = [
      { link: "a", width: 3840, height: 2160, file_type: "video/mp4" },
      { link: "b", width: 1920, height: 1080, file_type: "video/mp4" },
      { link: "c", width: 1280, height: 720, file_type: "video/mp4" },
      { link: "d", width: 1920, height: 1080, file_type: "video/webm" },
    ];
    expect(bestFile(files)).toBe("b");
    expect(bestFile([{ link: "big", width: 3840, height: 2160 }])).toBe("big");
    expect(bestFile([])).toBeNull();
    // tall videos: 1080 × 1920 counts as 1080
    expect(bestFile([{ link: "tall", width: 1080, height: 1920 }, { link: "tall4k", width: 2160, height: 3840 }])).toBe("tall");
  });

  it("fetches only from the libraries' own https hosts", () => {
    expect(allowedUrl("https://videos.pexels.com/video-files/1/a.mp4")).not.toBeNull();
    expect(allowedUrl("https://cdn.pixabay.com/video/a.mp4")).not.toBeNull();
    expect(allowedUrl("https://i.ytimg.com/vi/x/mqdefault.jpg")).not.toBeNull();
    expect(allowedUrl("http://videos.pexels.com/a.mp4")).toBeNull();
    expect(allowedUrl("https://evil.com/pexels.com")).toBeNull();
    expect(allowedUrl("https://pexels.com.evil.com/a")).toBeNull();
    expect(allowedUrl("https://127.0.0.1/a")).toBeNull();
    expect(allowedUrl("not a url")).toBeNull();
  });

  it("YouTube downloads need your OK, and Creative Commons is checked", () => {
    expect(youTubeAllowed({ license: "youtube", duration: 60 }, null)).toMatch(/Confirm/);
    expect(youTubeAllowed({ license: "youtube", duration: 60 }, "cc")).toMatch(/isn't Creative Commons/);
    expect(youTubeAllowed({ license: "cc", duration: 60 }, "cc")).toBeNull();
    expect(youTubeAllowed({ license: "youtube", duration: 60 }, "mine")).toBeNull();
    expect(youTubeAllowed({ license: "cc", duration: 3600 }, "cc")).toMatch(/minutes long/);
  });
});
