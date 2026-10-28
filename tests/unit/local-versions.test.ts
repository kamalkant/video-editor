import { describe, expect, it } from "vitest";
import { AccountWorkspace } from "@/lib/storage/workspace";
import { newProject } from "@/lib/projects/model";
import { emptyDoc, type TimelineDoc } from "@/lib/edit/doc";
import { VERSIONS_MAX } from "@/lib/projects/versionList";

/**
 * Saved versions of a project are kept where the project is: in this browser's account workspace (the server
 * has no copy of the project, so "Save a version" used to fail with "This project was deleted").
 */
const uuid = () => crypto.randomUUID();
const docWith = (fill: string): TimelineDoc => {
  const d = emptyDoc();
  return { ...d, tracks: d.tracks.map((t) => (t.kind === "main" ? { ...t, clips: [{ id: "b1", type: "blank", fill, duration: 3, fadeIn: 0, fadeOut: 0 }] } : t)) } as TimelineDoc;
};
const fillOf = (d: TimelineDoc) => (d.tracks.find((t) => t.kind === "main")!.clips[0] as { fill: string }).fill;

async function setup() {
  const ws = new AccountWorkspace(`acct-${uuid()}`, "u1", "u1@test.local");
  const id = uuid();
  await ws.saveProject(newProject({ id, name: "Trip", doc: docWith("#ff0000"), now: Date.now() }));
  return { ws, id };
}

describe("project versions in the browser", () => {
  it("saves the project as it is, lists it (newest first) and gives its timeline back", async () => {
    const { ws, id } = await setup();
    const v1 = await ws.saveVersion(id);
    expect(v1).toMatchObject({ name: "Version 1", auto: false, clips: 1, duration: 3 });
    const p = (await ws.getProject(id))!;
    await ws.saveProject({ ...p, doc: docWith("#0000ff") });
    const v2 = await ws.saveVersion(id, { name: "  Blue  " });
    expect(v2.name).toBe("Blue");
    expect((await ws.listVersions(id)).map((v) => v.id)).toEqual([v2.id, v1.id]);
    expect(fillOf((await ws.getVersion(id, v1.id))!.doc)).toBe("#ff0000");
    expect(fillOf((await ws.getVersion(id, v2.id))!.doc)).toBe("#0000ff");
  });

  it("numbers only your own versions, not the automatic ones", async () => {
    const { ws, id } = await setup();
    await ws.saveVersion(id, { name: "Before restoring", auto: true });
    expect((await ws.saveVersion(id)).name).toBe("Version 1");
  });

  it("deletes a version, and all of them with the project", async () => {
    const { ws, id } = await setup();
    const a = await ws.saveVersion(id);
    const b = await ws.saveVersion(id);
    expect(await ws.deleteVersion(id, a.id)).toBe(true);
    expect((await ws.listVersions(id)).map((v) => v.id)).toEqual([b.id]);
    await ws.deleteProject(id);
    expect(await ws.listVersions(id)).toEqual([]);
    expect(await ws.getVersion(id, b.id)).toBeNull();
  });

  it("refuses a project that isn't in this workspace", async () => {
    const { ws } = await setup();
    await expect(ws.saveVersion(uuid())).rejects.toThrow(/isn't saved in this browser/);
  });

  it("keeps at most VERSIONS_MAX, dropping the oldest automatic ones first", async () => {
    const { ws, id } = await setup();
    const auto = await ws.saveVersion(id, { auto: true, name: "auto" });
    for (let i = 0; i < VERSIONS_MAX; i++) await ws.saveVersion(id);
    const left = await ws.listVersions(id);
    expect(left).toHaveLength(VERSIONS_MAX);
    expect(left.some((v) => v.id === auto.id)).toBe(false);
  });

  it("keeps each account's versions apart", async () => {
    const { ws, id } = await setup();
    const v = await ws.saveVersion(id);
    const other = new AccountWorkspace(`acct-${uuid()}`, "u2", "u2@test.local");
    expect(await other.listVersions(id)).toEqual([]);
    expect(await other.getVersion(id, v.id)).toBeNull();
    expect(await other.deleteVersion(id, v.id)).toBe(false);
  });
});
