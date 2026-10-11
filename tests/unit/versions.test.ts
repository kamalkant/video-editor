import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { docFromSpec, mainTrack, type MediaLite } from "@/lib/edit/doc";
import { addMedia } from "@/lib/edit/docEdit";
import { DEFAULT_SPEC } from "@/lib/edit/spec";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "55555555-5555-4555-8555-555555555555";
const lite = (id: string): MediaLite => ({
  id,
  kind: "video",
  fileName: "clip.mp4",
  width: 1280,
  height: 720,
  fps: 24,
  duration: 4,
  hasAudio: false,
  suggestedKey: "#12AF34",
  keyKind: "green",
});
const meta = (id: string) => ({
  id,
  fileName: "clip.mp4",
  createdAt: 1,
  info: { width: 1280, height: 720, fps: 24, duration: 4, hasAudio: false },
  suggestedKey: "#12AF34",
  keyKind: "green",
});

describe("saved versions of a project", () => {
  let root: string;
  let store: typeof import("@/lib/projects/store");
  let versions: typeof import("@/lib/projects/versions");
  let storage: typeof import("@/lib/storage");

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "VDO-versions-"));
    process.env.VDO_STORAGE = root;
    storage = await import("@/lib/storage");
    store = await import("@/lib/projects/store");
    versions = await import("@/lib/projects/versions");
    for (const id of [A, B, C]) {
      mkdirSync(join(root, "videos", id), { recursive: true });
      writeFileSync(
        join(root, "videos", id, "meta.json"),
        JSON.stringify(meta(id)),
      );
    }
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("save (named or 'Version N'), list newest first, get the timeline back, delete", async () => {
    const p = await store.createProject({
      name: "Talk",
      doc: docFromSpec(DEFAULT_SPEC, lite(A)),
    });
    const v1 = await versions.saveVersion(p.id, {}, 1000);
    expect(v1).toMatchObject({
      name: "Version 1",
      auto: false,
      clips: 1,
      duration: 4,
      missing: 0,
    });
    // the project changes after the first version
    await store.updateProject(p.id, { doc: addMedia(p.doc, lite(B)).doc });
    const v2 = await versions.saveVersion(
      p.id,
      { name: "  Two   clips " },
      2000,
    );
    expect(v2.name).toBe("Two clips");
    const auto = await versions.saveVersion(
      p.id,
      { name: "Before restoring", auto: true },
      3000,
    );
    expect(auto.auto).toBe(true);
    expect((await versions.saveVersion(p.id, {}, 4000)).name).toBe("Version 3"); // automatic ones don't count
    expect((await versions.listVersions(p.id)).map((v) => v.name)).toEqual([
      "Version 3",
      "Before restoring",
      "Two clips",
      "Version 1",
    ]);

    const got = (await versions.getVersion(p.id, v1.id))!;
    expect(mainTrack(got.doc).clips).toHaveLength(1);
    expect(got.media.map((m) => m.id)).toEqual([A]);
    expect(
      mainTrack((await versions.getVersion(p.id, v2.id))!.doc).clips,
    ).toHaveLength(2);

    await expect(versions.saveVersion(p.id, { name: 42 })).rejects.toThrow();
    expect(await versions.deleteVersion(p.id, v1.id)).toBe(true);
    expect(await versions.deleteVersion(p.id, v1.id)).toBe(false);
    expect(await versions.getVersion(p.id, v1.id)).toBeNull();
    expect(await versions.getVersion(p.id, "../../x")).toBeNull();

    // deleting the project deletes its versions
    await store.deleteProject(p.id);
    expect(existsSync(join(root, "projects", p.id))).toBe(false);
    await expect(versions.listVersions(p.id)).rejects.toThrow(
      "This project was deleted.",
    );
  });

  it("keeps at most 50: the oldest automatic ones go first", async () => {
    const p = await store.createProject({
      name: "Many",
      doc: docFromSpec(DEFAULT_SPEC, lite(A)),
    });
    await versions.saveVersion(p.id, { name: "Auto old", auto: true }, 1);
    for (let i = 0; i < versions.VERSIONS_MAX - 1; i++)
      await versions.saveVersion(p.id, {}, 10 + i);
    expect((await versions.listVersions(p.id)).length).toBe(
      versions.VERSIONS_MAX,
    );
    await versions.saveVersion(p.id, { name: "Newest" }, 1000);
    const list = await versions.listVersions(p.id);
    expect(list.length).toBe(versions.VERSIONS_MAX);
    expect(list.some((v) => v.name === "Auto old")).toBe(false);
    expect(list.some((v) => v.name === "Version 1")).toBe(true);
    await versions.saveVersion(p.id, { name: "Newer" }, 2000);
    expect(
      (await versions.listVersions(p.id)).some((v) => v.name === "Version 1"),
    ).toBe(false);
    expect(readdirSync(join(root, "projects", p.id, "versions")).length).toBe(
      versions.VERSIONS_MAX,
    );
    await store.deleteProject(p.id);
  });

  it("the 24-hour cleanup keeps an upload only a version uses; a version whose upload is gone says so", async () => {
    const p = await store.createProject({
      name: "Old take",
      doc: docFromSpec(DEFAULT_SPEC, lite(C)),
    });
    await versions.saveVersion(p.id, { name: "With C" });
    // the live project moves on to another upload
    await store.updateProject(p.id, {
      doc: docFromSpec(DEFAULT_SPEC, lite(A)),
    });
    const old = new Date(Date.now() - 48 * 3600 * 1000);
    for (const id of [A, B, C]) utimesSync(join(root, "videos", id), old, old);
    await storage.cleanupOld();
    expect(existsSync(join(root, "videos", A))).toBe(true);
    expect(existsSync(join(root, "videos", C))).toBe(true); // only the version uses it
    expect(existsSync(join(root, "videos", B))).toBe(false);

    // the version's upload is deleted: it comes back without that clip, and says one is missing
    rmSync(join(root, "videos", C), { recursive: true, force: true });
    const [v] = await versions.listVersions(p.id);
    expect(v).toMatchObject({ name: "With C", missing: 1, clips: 0 });
    expect(
      mainTrack((await versions.getVersion(p.id, v.id))!.doc).clips,
    ).toHaveLength(0);
    await store.deleteProject(p.id);
  });
});
