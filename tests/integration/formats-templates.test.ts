import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi, afterAll, beforeAll, describe, expect, it } from "vitest";
import { importFile, sourcePath } from "@/lib/videos";
import { storagePath, projectReferences } from "@/lib/storage";
import {
  createCustom,
  deleteCustom,
  listCustom,
  rememberUpload,
  updateCustom,
} from "@/lib/templates/custom";
import { listLibrary } from "@/lib/library";
import { POST as libraryAdd } from "@/app/api/library/[id]/add/route";
import { GET as mediaGet } from "@/app/api/templates/media/route";
import { BROADCAST_TEMPLATES } from "@/lib/templates/newsTemplates";

// these routes store files: they need a signed-in user (lib/auth/requireUser)
vi.mock("@/lib/auth/session", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/session")>()),
  getCurrentUser: async () => ({ id: "test-user", email: "t@example.com", name: "Test", role: "user", status: "active" }),
}));


const tmp = mkdtempSync(join(tmpdir(), "VDO-formats-"));
const ff = (...args: string[]) =>
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
const at = (n: string) => join(tmp, n);
const probe = (file: string) =>
  JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-of",
      "json",
      file,
    ]).toString(),
  ) as {
    streams: {
      codec_type: string;
      codec_name: string;
      pix_fmt?: string;
      tags?: Record<string, string>;
    }[];
  };
// (importFile moves the file: import a copy)
let n = 0;
const imp = (file: string, name: string) => {
  const c = at(`copy-${n++}-${file}`);
  copyFileSync(at(file), c);
  return importFile(c, name);
};
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

beforeAll(() => {
  // a see-through ProRes 4444 .mov (a sting), an MPEG-4 .avi, an H.264 .mkv, a normal MP4, a sound
  ff(
    "-f",
    "lavfi",
    "-i",
    "color=c=red@0.5:s=320x180:r=25:d=1,format=yuva444p10le",
    "-c:v",
    "prores_ks",
    "-profile:v",
    "4444",
    "-pix_fmt",
    "yuva444p10le",
    at("sting.mov"),
  );
  ff(
    "-f",
    "lavfi",
    "-i",
    "testsrc2=s=320x180:r=25:d=1",
    "-f",
    "lavfi",
    "-i",
    "sine=d=1",
    "-c:v",
    "mpeg4",
    "-c:a",
    "mp3",
    "-shortest",
    at("old.avi"),
  );
  ff(
    "-f",
    "lavfi",
    "-i",
    "testsrc2=s=320x180:r=25:d=1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    at("clip.mkv"),
  );
  ff(
    "-f",
    "lavfi",
    "-i",
    "testsrc2=s=640x360:r=25:d=1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    at("plain.mp4"),
  );
  ff(
    "-f",
    "lavfi",
    "-i",
    "testsrc2=s=360x640:r=25:d=1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    at("tall.mp4"),
  );
  ff("-f", "lavfi", "-i", "sine=f=330:d=2", "-c:a", "aac", at("theme.m4a"));
}, 120_000);
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("every common video format (real FFmpeg)", () => {
  it("a see-through ProRes .mov gets a VP9-with-alpha copy for the preview; the original stays for the export", async () => {
    const m = await imp("sting.mov", "sting.mov");
    expect(m.info.alpha).toBe(true);
    expect(m.playable).toBe("playable.webm");
    const copy = probe(
      storagePath("videos", m.id, "playable.webm"),
    ).streams.find((s) => s.codec_type === "video")!;
    expect(copy.codec_name).toBe("vp9");
    expect(copy.tags?.alpha_mode ?? copy.tags?.ALPHA_MODE).toBe("1");
    expect(probe(sourcePath(m.id)).streams[0].codec_name).toBe("prores");
  });
  it("an MPEG-4 .avi gets an H.264 MP4 copy; an H.264 .mkv is only re-boxed; an MP4 has no copy", async () => {
    const avi = await imp("old.avi", "old.avi");
    expect(avi.info.container).toBe("avi");
    expect(avi.playable).toBe("playable.mp4");
    const s = probe(storagePath("videos", avi.id, "playable.mp4")).streams;
    expect(s.find((x) => x.codec_type === "video")!.codec_name).toBe("h264");
    expect(s.find((x) => x.codec_type === "audio")!.codec_name).toBe("aac");
    const mkv = await imp("clip.mkv", "clip.mkv");
    expect(mkv.playable).toBe("playable.mp4");
    expect(
      probe(storagePath("videos", mkv.id, "playable.mp4")).streams[0]
        .codec_name,
    ).toBe("h264");
    const mp4 = await imp("plain.mp4", "plain.mp4");
    expect(mp4.playable).toBeUndefined();
    expect(existsSync(storagePath("videos", mp4.id, "playable.mp4"))).toBe(
      false,
    );
  });
});

describe("your own templates (server)", () => {
  it("made from your video, sound and a base look; kept by the clean-up; listed, renamed, deleted", async () => {
    const video = await imp("plain.mp4", "show.mp4");
    const sound = await imp("theme.m4a", "theme.m4a");
    const base = BROADCAST_TEMPLATES.find((t) => t.aspectRatio === "16:9")!;
    const t = await createCustom({
      name: "My show",
      baseId: base.id,
      videoId: video.id,
      audioId: sound.id,
    });
    expect(t).toMatchObject({
      category: "My Templates",
      aspectRatio: "16:9",
      baseId: base.id,
      video: { assetId: video.id, width: 640, height: 360 },
      audio: { assetId: sound.id },
    });
    expect((await listCustom()).map((x) => x.id)).toContain(t.id);
    const refs = (await projectReferences())!;
    expect(refs.videos.has(video.id) && refs.videos.has(sound.id)).toBe(true);
    // its sound is in the Audio library ("My uploads"), and adding it doesn't copy the file
    const item = (await listLibrary()).items.find(
      (x) => x.id === `upload-${sound.id}`,
    );
    expect(item).toMatchObject({ source: "upload", mood: "My show" });
    const added = await (
      await libraryAdd(new Request("http://x"), ctx(`upload-${sound.id}`))
    ).json();
    expect(added.id).toBe(sound.id);
    expect((await updateCustom(t.id, { name: "Evening show" })).name).toBe(
      "Evening show",
    );
    expect(await deleteCustom(t.id)).toBe(true);
    expect(await listCustom()).toEqual([]);
  });
  it("refuses a missing file, a sound as the video, and a look made for another shape", async () => {
    const tall = await imp("tall.mp4", "tall.mp4");
    const sound = await imp("theme.m4a", "theme2.m4a");
    const wide = BROADCAST_TEMPLATES.find((t) => t.aspectRatio === "16:9")!;
    await expect(
      createCustom({
        name: "X",
        baseId: null,
        videoId: "44444444-4444-4444-8444-444444444444",
      }),
    ).rejects.toThrow(/no longer here/);
    await expect(
      createCustom({ name: "X", baseId: null, videoId: sound.id }),
    ).rejects.toThrow(/video file/);
    await expect(
      createCustom({ name: "X", baseId: wide.id, videoId: tall.id }),
    ).rejects.toThrow(/made for 16:9/);
    expect(
      (await createCustom({ name: "Tall", baseId: null, videoId: tall.id }))
        .aspectRatio,
    ).toBe("9:16");
  });
  it("clips uploaded in the template pane come back after a reload, with their files", async () => {
    const clip = await imp("plain.mp4", "loop.mp4");
    await rememberUpload(clip.id, "video");
    const data = await (await mediaGet()).json();
    const tile = data.clips.find(
      (c: { assetId?: string }) => c.assetId === clip.id,
    );
    expect(tile).toMatchObject({
      url: `/api/videos/${clip.id}/play`,
      thumbUrl: `/api/videos/${clip.id}/thumb`,
      isCustom: true,
    });
    expect((await projectReferences())!.videos.has(clip.id)).toBe(true);
  });
});
