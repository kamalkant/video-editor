import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteVideo, importFile } from "@/lib/videos";
import {
  createCustom,
  listCustomWithStatus,
  templatesUsing,
  updateCustom,
} from "@/lib/templates/custom";
import { DELETE as deleteAsset } from "@/app/api/videos/[id]/route";
import { BROADCAST_TEMPLATES } from "@/lib/templates/newsTemplates";

const tmp = mkdtempSync(join(tmpdir(), "VDO-tplfiles-"));
const ff = (...args: string[]) =>
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
let n = 0;
const imp = (file: string, name: string) => {
  const c = join(tmp, `c${n++}-${file}`);
  copyFileSync(join(tmp, file), c);
  return importFile(c, name);
};
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

beforeAll(() => {
  ff(
    "-f",
    "lavfi",
    "-i",
    "testsrc2=s=640x360:r=25:d=1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    join(tmp, "wide.mp4"),
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
    join(tmp, "tall.mp4"),
  );
  ff(
    "-f",
    "lavfi",
    "-i",
    "sine=f=330:d=1",
    "-c:a",
    "aac",
    join(tmp, "theme.m4a"),
  );
}, 60_000);
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("a template's files", () => {
  it("can be removed from My Assets while keeping the template functional", async () => {
    const v = await imp("wide.mp4", "show.mp4");
    const a = await imp("theme.m4a", "theme.m4a");
    const t = await createCustom({
      name: "Evening show",
      baseId: null,
      videoId: v.id,
      audioId: a.id,
    });
    expect((await templatesUsing(v.id)).map((x) => x.id)).toEqual([t.id]);
    expect((await templatesUsing(a.id)).map((x) => x.id)).toEqual([t.id]);
    for (const id of [v.id, a.id]) {
      const r = await deleteAsset(
        new Request("http://x", { method: "DELETE" }),
        ctx(id),
      );
      expect(r.status).toBe(204);
    }
    const listed = (await listCustomWithStatus()).find((x) => x.id === t.id)!;
    expect(listed.missing).toBeUndefined();
  });
  it("a template whose files were deleted anyway says so, and gets a new video and sound in place", async () => {
    const v = await imp("wide.mp4", "gone.mp4");
    const a = await imp("theme.m4a", "gone.m4a");
    const base = BROADCAST_TEMPLATES.find((x) => x.aspectRatio === "16:9")!;
    const t = await createCustom({
      name: "Lost files",
      baseId: base.id,
      videoId: v.id,
      audioId: a.id,
    });
    // (e.g. deleted before this guard existed)
    await deleteVideo(v.id);
    await deleteVideo(a.id);
    const listed = (await listCustomWithStatus()).find((x) => x.id === t.id)!;
    expect(listed.missing).toEqual({ video: true, audio: true });
    // a new video: it must fit the base look's shape
    const tall = await imp("tall.mp4", "tall.mp4");
    await expect(updateCustom(t.id, { videoId: tall.id })).rejects.toThrow(
      /made for 16:9/,
    );
    const wide = await imp("wide.mp4", "new.mp4");
    const sound = await imp("theme.m4a", "new.m4a");
    await expect(updateCustom(t.id, { videoId: sound.id })).rejects.toThrow(
      /video file/,
    );
    const fixed = await updateCustom(t.id, {
      videoId: wide.id,
      audioId: sound.id,
    });
    expect(fixed).toMatchObject({
      name: "Lost files",
      baseId: base.id,
      aspectRatio: "16:9",
      video: { assetId: wide.id },
      audio: { assetId: sound.id },
    });
    expect(
      (await listCustomWithStatus()).find((x) => x.id === t.id)!.missing,
    ).toBeUndefined();
    // and the sound can be taken off
    expect((await updateCustom(t.id, { audioId: null })).audio).toBeUndefined();
  });
});
