import { describe, expect, it } from "vitest";
import { ytDlpFailure, ytDlpFfmpegArgs } from "@/lib/import/ytdlp";

// YouTube often refuses servers in data centers (Hostinger): people get told what to do instead
describe("yt-dlp failure messages", () => {
  it("says YouTube is blocking the server for bot checks and rate limits", () => {
    expect(ytDlpFailure("ERROR: [youtube] abc: Sign in to confirm you're not a bot.")).toMatch(/blocking downloads from this server/);
    expect(ytDlpFailure("ERROR: HTTP Error 429: Too Many Requests")).toMatch(/blocking downloads from this server/);
  });
  it("keeps the other reasons", () => {
    expect(ytDlpFailure("Sign in to confirm your age")).toMatch(/asks to sign in/);
    expect(ytDlpFailure("Video unavailable")).toMatch(/private or unavailable/);
    expect(ytDlpFailure("")).toMatch(/couldn't be downloaded/);
  });
});

describe("yt-dlp finds FFmpeg", () => {
  it("gets FFmpeg's location only when it is a path; a bare name is found on the PATH by yt-dlp itself", () => {
    // ("--ffmpeg-location ffmpeg" made yt-dlp say "ffmpeg is not installed": online meme clips failed)
    expect(ytDlpFfmpegArgs("ffmpeg")).toEqual([]);
    expect(ytDlpFfmpegArgs("/srv/app/vendor/ffmpeg/ffmpeg")).toEqual(["--ffmpeg-location", "/srv/app/vendor/ffmpeg/ffmpeg"]);
  });
});
