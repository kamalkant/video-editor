import { describe, expect, it } from "vitest";
import { ytDlpClientArgs, ytDlpFailure, ytDlpFailureOf, ytDlpFfmpegArgs, ytDlpTail } from "@/lib/import/ytdlp";

// YouTube often refuses servers in data centers (Hostinger): people get told what to do instead
describe("yt-dlp failure messages", () => {
  it("formats user-friendly messages for bot checks and rate limits without mentioning YouTube", () => {
    expect(ytDlpFailure("ERROR: [youtube] abc: Sign in to confirm you're not a bot.")).toMatch(/temporarily blocked or unavailable/);
    expect(ytDlpFailure("ERROR: HTTP Error 429: Too Many Requests")).toMatch(/temporarily blocked or unavailable/);
    expect(ytDlpFailure("ERROR: [youtube] abc: Sign in to confirm you're not a bot.")).not.toMatch(/YouTube/);
  });
  it("keeps the other reasons cleanly without mentioning YouTube", () => {
    expect(ytDlpFailure("Sign in to confirm your age")).toMatch(/age verification or sign-in/);
    expect(ytDlpFailure("Video unavailable")).toMatch(/private or unavailable/);
    expect(ytDlpFailure("")).toMatch(/Could not download/i);
    expect(ytDlpFailure("Sign in to confirm your age")).not.toMatch(/YouTube/);
  });
});

describe("yt-dlp finds FFmpeg", () => {
  it("gets FFmpeg's location only when it is a path; a bare name is found on the PATH by yt-dlp itself", () => {
    // ("--ffmpeg-location ffmpeg" made yt-dlp say "ffmpeg is not installed": online meme clips failed)
    expect(ytDlpFfmpegArgs("ffmpeg")).toEqual([]);
    expect(ytDlpFfmpegArgs("/srv/app/vendor/ffmpeg/ffmpeg")).toEqual(["--ffmpeg-location", "/srv/app/vendor/ffmpeg/ffmpeg"]);
  });
});

describe("why an online clip failed, from all the tries", () => {
  // what viplay.in showed: the last try (the embedded player) says "age", the real reason was a block
  const blocked = { label: "section", stderr: "ERROR: [youtube] It9NKH8OdrM: Sign in to confirm you’re not a bot. Use --cookies-from-browser or --cookies for the authentication." };
  const embeddedAge = { label: "embedded", stderr: "ERROR: [youtube] It9NKH8OdrM: Sign in to confirm your age. This video may be inappropriate for some users." };

  it("the server being blocked wins over the embedded player's age message", () => {
    expect(ytDlpFailureOf([blocked, { label: "full", stderr: "ERROR: HTTP Error 403: Forbidden" }, embeddedAge])).toMatch(/temporarily blocked/);
  });

  it("refused downloads and PO tokens read as a block too", () => {
    expect(ytDlpFailureOf([{ label: "a", stderr: "ERROR: unable to download video data: HTTP Error 403: Forbidden" }])).toMatch(/temporarily blocked/);
    expect(ytDlpFailureOf([{ label: "a", stderr: "WARNING: [youtube] This video requires a GVS PO Token" }])).toMatch(/temporarily blocked/);
    expect(ytDlpFailureOf([{ label: "a", stderr: "The provided YouTube account cookies are no longer valid. They have likely been rotated in the browser" }])).toMatch(/temporarily blocked/);
  });

  it("a real age gate still says so; words like page or usage don't", () => {
    expect(ytDlpFailureOf([embeddedAge])).toMatch(/age verification/);
    expect(ytDlpFailure("ERROR: unable to extract the page; see usage notes")).not.toMatch(/age verification/);
  });

  it("missing tool, unavailable clip, and timeouts", () => {
    expect(ytDlpFailureOf([{ label: "a", stderr: "", code: "ENOENT" }])).toMatch(/downloader|isn't available|isn't installed/);
    expect(ytDlpFailureOf([{ label: "a", stderr: "ERROR: [youtube] x: Video unavailable" }])).toMatch(/private or unavailable/);
    expect(ytDlpFailureOf([{ label: "a", stderr: "", killed: true }, { label: "b", stderr: "", killed: true }])).toMatch(/too long/);
  });

  it("logs keep the end of the answer without the server's folders", () => {
    expect(ytDlpTail("a\nb\nERROR: cannot open /home/u1/domains/viplay.in/x.txt")).toBe("a\nb\nERROR: cannot open …");
  });

  it("with cookies, yt-dlp picks players that accept them", () => {
    expect(ytDlpClientArgs(["--cookies", "/x/cookies.txt"]).join(" ")).not.toMatch(/android|ios/);
    expect(ytDlpClientArgs([]).join(" ")).toMatch(/player_client=/);
  });
});

