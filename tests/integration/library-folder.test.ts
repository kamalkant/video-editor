import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// its own storage and music folder (never the real ones)
const tmp = mkdtempSync(join(tmpdir(), "VDO-libf-"));
process.env.VDO_STORAGE = join(tmp, "storage");
const music = join(tmp, "My Music");
mkdirSync(join(music, "Calm"), { recursive: true });
execFileSync("ffmpeg", [
  "-hide_banner",
  "-loglevel",
  "error",
  "-f",
  "lavfi",
  "-i",
  "sine=f=330:d=12",
  "-metadata",
  "title=Morning Walk",
  "-metadata",
  "artist=Me",
  "-c:a",
  "aac",
  join(music, "Calm", "walk.m4a"),
]);
execFileSync("ffmpeg", [
  "-hide_banner",
  "-loglevel",
  "error",
  "-f",
  "lavfi",
  "-i",
  "sine=f=900:d=1",
  "-c:a",
  "aac",
  join(music, "beep.m4a"),
]);
writeFileSync(join(music, "notes.txt"), "not audio");
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("your music folder", () => {
  it("is indexed (title, artist, mood from the folder; short sounds are effects) and only its files are served", async () => {
    const lib = await import("@/lib/library");
    await expect(lib.setLibraryFolder("relative/path")).rejects.toThrow(
      /full path/,
    );
    await expect(lib.setLibraryFolder(join(tmp, "nope"))).rejects.toThrow(
      /doesn't exist/,
    );
    await lib.setLibraryFolder(music);
    const items = await lib.indexFolder(music);
    expect(items).toHaveLength(2);
    const walk = items.find((x) => x.title === "Morning Walk")!;
    expect(walk).toMatchObject({
      artist: "Me",
      mood: "Calm",
      kind: "music",
      source: "folder",
    });
    expect(items.find((x) => x.kind === "sfx")?.title).toBe("beep");
    expect(await lib.libraryPath(walk.id)).toBe(
      join(music, "Calm", "walk.m4a"),
    );
    expect(await lib.libraryPath("0123456789abcdef")).toBeNull();
    // another folder: the old files are not served any more
    mkdirSync(join(tmp, "Other"));
    await lib.setLibraryFolder(join(tmp, "Other"));
    expect(await lib.libraryPath(walk.id)).toBeNull();
  }, 60_000);
});
