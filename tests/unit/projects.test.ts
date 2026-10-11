import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asSingleVideo,
  docFromSpec,
  mainTrack,
  mediaIdsOf,
  type MediaLite,
} from "@/lib/edit/doc";
import { addMedia } from "@/lib/edit/docEdit";
import { DEFAULT_SPEC, keyOp } from "@/lib/edit/spec";
import {
  migrateProject,
  nameFromFile,
  newProject,
  projectSchema,
  summaryOf,
} from "@/lib/projects/model";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const P = "33333333-3333-4333-8333-333333333333";
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
const media = (id: string) => (id === A || id === B ? lite(id) : null);

describe("project model v3 (a timeline)", () => {
  it("a new project holds a timeline; names are tidied", () => {
    const p = newProject({
      id: P,
      name: "  Anchor   intro ",
      doc: docFromSpec(DEFAULT_SPEC, lite(A)),
      now: 5,
    });
    expect(p.version).toBe(3);
    expect(p.name).toBe("Anchor intro");
    expect(mediaIdsOf(p.doc)).toEqual([A]);
    expect(summaryOf(p, () => true)).toMatchObject({
      coverId: A,
      duration: 4,
      clips: 1,
      missing: false,
    });
  });

  it("opens v2 projects (one video's parts) with their cuts and settings", () => {
    const ops = structuredClone(DEFAULT_SPEC.ops);
    keyOp({ ...DEFAULT_SPEC, ops })!.params.similarity = 0.08;
    const v2 = {
      version: 2,
      id: P,
      name: "Old cut",
      createdAt: 1,
      updatedAt: 2,
      tracks: [
        {
          id: "video-1",
          kind: "video",
          clips: [
            { id: "c1", videoId: A, start: 0, in: 0, out: 1, ops },
            { id: "c2", videoId: A, start: 1, in: 2, out: 4, ops },
          ],
        },
      ],
      output: DEFAULT_SPEC.output,
      jobId: null,
    };
    const p = migrateProject(v2, media);
    expect(p.version).toBe(3);
    expect(
      mainTrack(p.doc).clips.map((c) =>
        c.type === "video" ? [c.in, c.out] : null,
      ),
    ).toEqual([
      [0, 1],
      [2, 4],
    ]);
    const single = asSingleVideo(p.doc)!;
    expect(keyOp(single.spec)!.params.similarity).toBe(0.08);
    // reading it again changes nothing
    expect(migrateProject(p, media)).toEqual(p);
  });

  it("opens v1 projects ({ videoId, spec })", () => {
    const p = migrateProject(
      {
        id: P,
        name: "Oldest",
        videoId: A,
        spec: DEFAULT_SPEC,
        createdAt: 1,
        updatedAt: 2,
        jobId: null,
      },
      media,
    );
    expect(p.version).toBe(3);
    expect(asSingleVideo(p.doc)?.mediaId).toBe(A);
    expect(p.createdAt).toBe(1);
  });

  it("rejects bad input", () => {
    const p = newProject({
      id: P,
      name: "x",
      doc: docFromSpec(DEFAULT_SPEC, lite(A)),
      now: 0,
    });
    expect(() => projectSchema.parse({ ...p, name: "   " })).toThrow();
    expect(() => projectSchema.parse({ ...p, id: "../../etc" })).toThrow();
    const evil = structuredClone(p);
    const clip = mainTrack(evil.doc).clips[0];
    if (clip.type === "video")
      (clip.ops[0].params as { keyColor: string }).keyColor =
        "12AF34,movie=/etc/passwd";
    expect(() => projectSchema.parse(evil)).toThrow();
  });

  it("names projects after the file", () => {
    expect(nameFromFile("Anchor_Intro.mp4")).toBe("Anchor Intro");
    expect(nameFromFile(".mp4")).toBe("Untitled project");
  });
});

describe("project storage", () => {
  let root: string;
  let store: typeof import("@/lib/projects/store");
  let storage: typeof import("@/lib/storage");
  const meta = (id: string) => ({
    id,
    fileName: "clip.mp4",
    createdAt: 1,
    info: { width: 1280, height: 720, fps: 24, duration: 4, hasAudio: false },
    suggestedKey: "#12AF34",
    keyKind: "green",
  });

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "VDO-projects-"));
    process.env.VDO_STORAGE = root;
    storage = await import("@/lib/storage");
    store = await import("@/lib/projects/store");
    for (const id of [A, B]) {
      mkdirSync(join(root, "videos", id), { recursive: true });
      writeFileSync(
        join(root, "videos", id, "meta.json"),
        JSON.stringify(meta(id)),
      );
    }
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("create, list, rename, autosave the timeline, delete", async () => {
    const p = await store.createProject({
      name: "First",
      doc: docFromSpec(DEFAULT_SPEC, lite(A)),
    });
    expect((await store.listProjects()).map((x) => x.id)).toEqual([p.id]);
    // many autosaves at once still end with the last one
    await Promise.all(
      [1, 2, 3].map((n) => {
        let d = docFromSpec(DEFAULT_SPEC, lite(A));
        for (let i = 0; i < n; i++) d = addMedia(d, lite(B)).doc;
        return store.updateProject(p.id, { doc: d });
      }),
    );
    expect(mainTrack((await store.getProject(p.id))!.doc).clips).toHaveLength(
      4,
    );
    await store.updateProject(p.id, { name: "Renamed" });
    await expect(store.updateProject(p.id, { name: "  " })).rejects.toThrow(
      "Give the project a name.",
    );
    expect((await store.projectsUsingVideo(B)).length).toBe(1);
    expect((await store.summarize((await store.getProject(p.id))!)).clips).toBe(
      4,
    );
    expect(await store.deleteProject(p.id)).toBe(true);
    expect(await store.getProject(p.id)).toBeNull();
    expect(await store.deleteProject(p.id)).toBe(false);
  });

  it("drops clips whose upload is gone", async () => {
    const d = addMedia(
      docFromSpec(DEFAULT_SPEC, lite(A)),
      lite("44444444-4444-4444-8444-444444444444"),
    ).doc;
    const p = await store.createProject({ name: "x", doc: d });
    expect(mediaIdsOf(p.doc)).toEqual([A]);
    await store.deleteProject(p.id);
  });

  it("the 24-hour cleanup keeps uploads a project uses and deletes the others", async () => {
    const p = await store.createProject({
      name: "Keep",
      doc: docFromSpec(DEFAULT_SPEC, lite(A)),
    });
    const old = new Date(Date.now() - 48 * 3600 * 1000);
    for (const id of [A, B]) utimesSync(join(root, "videos", id), old, old);
    await storage.cleanupOld();
    expect(existsSync(join(root, "videos", A))).toBe(true);
    expect(existsSync(join(root, "videos", B))).toBe(false);
    // a broken project file: nothing is deleted
    mkdirSync(join(root, "projects", P), { recursive: true });
    writeFileSync(join(root, "projects", P, "project.json"), "{broken");
    await store.deleteProject(p.id);
    await storage.cleanupOld();
    expect(existsSync(join(root, "videos", A))).toBe(true);
  });
});
