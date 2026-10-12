import { describe, expect, it } from "vitest";
import { dataRoot } from "@/lib/dataRoot";
import { limitThreads } from "@/lib/ffmpeg/run";

// Hostinger runs each deploy from a new folder: a database kept inside it was gone after every deploy
// (accounts "invalid", the admin reset, uploads lost)
describe("dataRoot", () => {
  it("on Hostinger, keeps data beside hbuilds, so it outlives deploys", () => {
    expect(dataRoot("/home/u1/domains/viplay.in/hbuilds/versions/01a1-uuid/nodejs", {})).toBe("/home/u1/domains/viplay.in/viplay-data");
  });
  it("VIPLAY_DATA_DIR wins; elsewhere it's the project folder", () => {
    expect(dataRoot("/home/u1/domains/viplay.in/hbuilds/versions/x/nodejs", { VIPLAY_DATA_DIR: "/srv/viplay" })).toBe("/srv/viplay");
    expect(dataRoot("/Users/me/VDO", {})).toBe("/Users/me/VDO");
  });
});

// Shared hosting limits threads per account: FFmpeg's one-per-core default failed every job with
// "Resource temporarily unavailable" (thumbnails blank, exports failed)
describe("limitThreads", () => {
  it("caps threads for each input, the filters and the output", () => {
    expect(limitThreads(["-ss", "1", "-i", "/a.mp4", "-i", "/b.png", "-vf", "scale=320:-2", "-c:v", "mjpeg", "pipe:1"], 2)).toEqual([
      "-filter_threads", "2", "-filter_complex_threads", "2",
      "-ss", "1", "-threads", "2", "-i", "/a.mp4", "-threads", "2", "-i", "/b.png", "-vf", "scale=320:-2", "-c:v", "mjpeg", "-threads", "2", "pipe:1",
    ]);
  });
  it("leaves queries, explicit thread counts and 'no limit' alone", () => {
    expect(limitThreads(["-encoders"], 2)).toEqual(["-encoders"]);
    expect(limitThreads(["-i", "a", "-threads", "8", "b"], 2)).toEqual(["-i", "a", "-threads", "8", "b"]);
    expect(limitThreads(["-i", "a", "b"], 0)).toEqual(["-i", "a", "b"]);
  });
});
