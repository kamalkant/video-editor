import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { docFromSpec, type MediaLite } from "@/lib/edit/doc";
import { DEFAULT_SPEC } from "@/lib/edit/spec";
import type { VideoMeta } from "@/lib/videos";

const root = mkdtempSync(join(tmpdir(), "VDO-del-test-"));
process.env.VDO_STORAGE = root;

const A = "11111111-1111-4111-8111-111111111111"; // in project
const B = "22222222-2222-4222-8222-222222222222"; // unused
const C = "33333333-3333-4333-8333-333333333333"; // in template

const lite = (id: string): MediaLite => ({
  id,
  kind: "video",
  fileName: `clip-${id}.mp4`,
  width: 1280,
  height: 720,
  fps: 24,
  duration: 4,
  hasAudio: false,
  suggestedKey: null,
  keyKind: null,
});

const meta = (id: string): VideoMeta => ({
  id,
  fileName: `clip-${id}.mp4`,
  createdAt: Date.now(),
  info: {
    container: "mov,mp4,m4a,3gp,3g2,mj2",
    videoCodec: "h264",
    width: 1280,
    height: 720,
    fps: 24,
    duration: 4,
    hasAudio: false,
    audioCodec: null,
    soundDetected: false,
    colorTransfer: null,
    size: 1000,
  },
  suggestedKey: null,
  keyKind: null,
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

describe("Asset Deletion & Template Decoupling", () => {
  let videosModule: typeof import("@/lib/videos");
  let projectsStore: typeof import("@/lib/projects/store");
  let templatesModule: typeof import("@/lib/templates/custom");
  let deleteRoute: typeof import("@/app/api/videos/[id]/route");

  beforeAll(async () => {
    videosModule = await import("@/lib/videos");
    projectsStore = await import("@/lib/projects/store");
    templatesModule = await import("@/lib/templates/custom");
    deleteRoute = await import("@/app/api/videos/[id]/route");

    // Initialize mock video folders
    for (const id of [A, B, C]) {
      mkdirSync(join(root, "videos", id), { recursive: true });
      writeFileSync(
        join(root, "videos", id, "meta.json"),
        JSON.stringify(meta(id)),
      );
    }

    // Project using A
    await projectsStore.createProject({
      name: "Active Show",
      doc: docFromSpec(DEFAULT_SPEC, lite(A)),
    });

    // Custom template using C
    await templatesModule.createCustom("test-user", {
      name: "Custom News Look",
      baseId: null,
      videoId: C,
    });
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("lists all non-hidden videos initially", async () => {
    const list = await videosModule.listVideos();
    const ids = list.map((v) => v.id);
    expect(ids).toContain(A);
    expect(ids).toContain(B);
    expect(ids).toContain(C);
  });

  it("deleting an unused asset permanently removes it from disk", async () => {
    const res = await deleteRoute.DELETE(
      new Request("http://localhost/api/videos/" + B, { method: "DELETE" }),
      ctx(B),
    );
    expect(res.status).toBe(204);

    // Verify completely gone
    expect(await videosModule.getVideo(B)).toBeNull();
    expect(existsSync(join(root, "videos", B))).toBe(false);

    const list = await videosModule.listVideos();
    expect(list.map((v) => v.id)).not.toContain(B);
  });

  it("deleting an asset used in a project unlists it from My Assets without breaking project playback", async () => {
    // Verify project is using A
    const usingA = await projectsStore.projectsUsingVideo(A);
    expect(usingA.length).toBeGreaterThan(0);

    const res = await deleteRoute.DELETE(
      new Request("http://localhost/api/videos/" + A, { method: "DELETE" }),
      ctx(A),
    );
    expect(res.status).toBe(204);

    // The asset should no longer appear in My Assets list
    const list = await videosModule.listVideos();
    expect(list.map((v) => v.id)).not.toContain(A);

    // BUT the asset metadata and disk storage MUST still exist for project playback
    const saved = await videosModule.getVideo(A);
    expect(saved).not.toBeNull();
    expect(saved?.hiddenFromLibrary).toBe(true);
    expect(existsSync(join(root, "videos", A, "meta.json"))).toBe(true);
  });

  it("deleting an asset used in a template unlists it from My Assets without breaking the template", async () => {
    // Verify template is using C
    const usingC = await templatesModule.templatesUsing(C);
    expect(usingC.length).toBeGreaterThan(0);

    const res = await deleteRoute.DELETE(
      new Request("http://localhost/api/videos/" + C, { method: "DELETE" }),
      ctx(C),
    );
    expect(res.status).toBe(204);

    // Unlisted from My Assets list
    const list = await videosModule.listVideos();
    expect(list.map((v) => v.id)).not.toContain(C);

    // Template remains functional and not marked missing
    const templates = await templatesModule.listCustomWithStatus("test-user");
    const t = templates.find((x) => x.name === "Custom News Look")!;
    expect(t).toBeDefined();
    expect(t.missing).toBeUndefined();
  });
});
