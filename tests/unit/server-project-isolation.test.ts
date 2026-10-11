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

const A = "11111111-1111-4111-8111-111111111111";
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

describe("Server-Side Multi-Tenant Project Isolation", () => {
  let root: string;
  let store: typeof import("@/lib/projects/store");

  const userA = "user-uuid-aaaa-1111";
  const userB = "user-uuid-bbbb-2222";

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "VDO-server-isolation-"));
    process.env.VDO_STORAGE = root;
    store = await import("@/lib/projects/store");

    // Mock video upload directory for media verification
    mkdirSync(join(root, "videos", A), { recursive: true });
    writeFileSync(
      join(root, "videos", A, "meta.json"),
      JSON.stringify({
        id: A,
        fileName: "clip.mp4",
        createdAt: 1,
        info: {
          width: 1280,
          height: 720,
          fps: 24,
          duration: 4,
          hasAudio: false,
        },
      }),
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("strictly scopes projects to their respective owners", async () => {
    const docA = docFromSpec(DEFAULT_SPEC, lite(A));
    const projA = await store.createProject({
      name: "User A Project",
      doc: docA,
      userId: userA,
    });

    const docB = docFromSpec(DEFAULT_SPEC, lite(A));
    const projB = await store.createProject({
      name: "User B Project",
      doc: docB,
      userId: userB,
    });

    // User A should only see their project
    const listA = await store.listProjects(userA);
    expect(listA.map((p) => p.id)).toContain(projA.id);
    expect(listA.map((p) => p.id)).not.toContain(projB.id);

    // User B should only see their project
    const listB = await store.listProjects(userB);
    expect(listB.map((p) => p.id)).toContain(projB.id);
    expect(listB.map((p) => p.id)).not.toContain(projA.id);
  });

  it("prevents User B from accessing, modifying, or deleting User A's project", async () => {
    const docA = docFromSpec(DEFAULT_SPEC, lite(A));
    const projA = await store.createProject({
      name: "Secret User A Notes",
      doc: docA,
      userId: userA,
    });

    // User B tries to read User A's project
    const readAttempt = await store.getProject(projA.id, userB);
    expect(readAttempt).toBeNull();

    // User B tries to modify User A's project
    await expect(
      store.updateProject(projA.id, { name: "Malicious Rename" }, userB),
    ).rejects.toThrow("This project was deleted.");

    // User B tries to delete User A's project
    const deleteAttempt = await store.deleteProject(projA.id, userB);
    expect(deleteAttempt).toBe(false);

    // Ensure User A's project is still fully intact
    const original = await store.getProject(projA.id, userA);
    expect(original).not.toBeNull();
    expect(original?.name).toBe("Secret User A Notes");
  });

  it("preserves client-provided project ID on creation", async () => {
    const clientProvidedId = "99999999-9999-4999-8999-999999999999";
    const doc = docFromSpec(DEFAULT_SPEC, lite(A));

    const p = await store.createProject({
      id: clientProvidedId,
      name: "Client ID Synced Project",
      doc,
      userId: userA,
    });

    expect(p.id).toBe(clientProvidedId);
    const retrieved = await store.getProject(clientProvidedId, userA);
    expect(retrieved?.id).toBe(clientProvidedId);
  });

  it("hides legacy unassigned projects from authenticated users", async () => {
    // Simulate legacy project with null userId (e.g. legacy global Newsroom)
    const legacyId = "88888888-8888-4888-8888-888888888888";
    const legacyProject = {
      version: 3,
      id: legacyId,
      name: "Legacy Global Project",
      createdAt: 1000,
      updatedAt: 1000,
      doc: docFromSpec(DEFAULT_SPEC, lite(A)),
      jobId: null,
      userId: null,
    };
    mkdirSync(join(root, "projects", legacyId), { recursive: true });
    writeFileSync(
      join(root, "projects", legacyId, "project.json"),
      JSON.stringify(legacyProject),
    );

    // Authenticated User A should NOT see the legacy unassigned project
    const listA = await store.listProjects(userA);
    expect(listA.map((p) => p.id)).not.toContain(legacyId);

    // Calling getProject with User A should return null for legacy project
    expect(await store.getProject(legacyId, userA)).toBeNull();
  });
});
