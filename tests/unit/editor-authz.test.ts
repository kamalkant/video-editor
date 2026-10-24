import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

// who is signed in (null: nobody); the routes read it through lib/auth/session
const auth = vi.hoisted(() => ({ user: null as null | { id: string; role: string; email: string; name: string; status: string } }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/session")>()), getCurrentUser: async () => auth.user }));

import { storagePath } from "@/lib/storage";
import { GET as brandGet, PUT as brandPut } from "@/app/api/brand/route";
import { POST as fontAdd } from "@/app/api/brand/fonts/route";
import { GET as fontGet } from "@/app/api/brand/fonts/[id]/route";
import { GET as templatesGet, POST as templatesPost } from "@/app/api/templates/custom/route";
import { DELETE as templateDelete } from "@/app/api/templates/custom/[id]/route";
import { POST as libraryFolder } from "@/app/api/library/folder/route";
import { POST as deviceFolder } from "@/app/api/storage/device-folder/route";
import { POST as stockPhoto } from "@/app/api/stock/photos/route";
import { GET as sourceGet } from "@/app/api/videos/[id]/source/route";
import { GET as metaGet } from "@/app/api/videos/[id]/route";
import { POST as silences } from "@/app/api/videos/[id]/silences/route";
import { GET as jobGet, DELETE as jobDelete } from "@/app/api/jobs/[id]/route";
import { GET as versionsGet } from "@/app/api/projects/[id]/versions/route";

/**
 * viplay.in is one server for everyone: a person's Brand Kit, templates, files, exports and project versions
 * are theirs alone, and server-only tools (the music folder, the Documents folder, fetching addresses) are
 * not for strangers. (EDITOR_AUDIT.md S1–S10)
 */
const A = { id: "user-a", role: "user", email: "a@x.test", name: "A", status: "active" };
const B = { id: "user-b", role: "user", email: "b@x.test", name: "B", status: "active" };
const ADMIN = { id: "admin-1", role: "admin", email: "ad@x.test", name: "Ad", status: "active" };
const as = (u: typeof A | null) => {
  auth.user = u;
};
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) }) as never;
const json = (method: string, body: unknown) => new Request("http://x", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** An upload of `owner` (a tiny fake MP4 is enough for these routes). */
function upload(owner: string | undefined): string {
  const id = randomUUID();
  mkdirSync(storagePath("videos", id), { recursive: true });
  writeFileSync(storagePath("videos", id, "source"), Buffer.alloc(64));
  writeFileSync(storagePath("videos", id, "meta.json"), JSON.stringify({ id, fileName: "clip.mp4", kind: "video", createdAt: Date.now(), info: { container: "mp4", videoCodec: "h264", width: 640, height: 360, fps: 30, duration: 2, hasAudio: true }, suggestedKey: null, keyKind: null, ...(owner ? { userId: owner } : {}) }));
  return id;
}

let mineA: string;
let legacy: string;
beforeAll(() => {
  mineA = upload(A.id);
  legacy = upload(undefined);
});

describe("files are their owner's", () => {
  it("signed out: 401; someone else's file: 404 (as if it weren't there); yours: served", async () => {
    as(null);
    expect((await sourceGet(new Request("http://x"), params({ id: mineA }))).status).toBe(401);
    as(B);
    expect((await sourceGet(new Request("http://x"), params({ id: mineA }))).status).toBe(404);
    expect((await metaGet(new Request("http://x"), params({ id: mineA }))).status).toBe(404);
    expect((await silences(json("POST", {}), params({ id: mineA }))).status).toBe(404);
    as(A);
    expect((await sourceGet(new Request("http://x"), params({ id: mineA }))).status).toBe(200);
    expect((await metaGet(new Request("http://x"), params({ id: mineA }))).status).toBe(200);
    // staff may look at any file; a file from before owners: anyone signed in
    as(ADMIN);
    expect((await sourceGet(new Request("http://x"), params({ id: mineA }))).status).toBe(200);
    as(B);
    expect((await sourceGet(new Request("http://x"), params({ id: legacy }))).status).toBe(200);
  });
});

describe("Brand Kits are per person", () => {
  it("signed out: 401; each person changes only their own kit", async () => {
    as(null);
    expect((await brandGet()).status).toBe(401);
    as(A);
    expect((await brandPut(json("PUT", { colors: ["#ff0000"] }))).status).toBe(200);
    as(B);
    const b = await (await brandGet()).json();
    expect(b.colors).toEqual([]);
    as(A);
    expect((await (await brandGet()).json()).colors).toEqual(["#ff0000"]);
  });

  it("a font belongs to the kit of the person who added it", async () => {
    as(A);
    // (the first bytes of a TrueType font)
    const ttf = Buffer.concat([Buffer.from([0, 1, 0, 0]), Buffer.alloc(60)]);
    const r = await fontAdd(new Request("http://x", { method: "POST", headers: { "x-file-name": "Mine.ttf" }, body: ttf }));
    expect(r.status).toBe(201);
    const { font } = await r.json();
    expect((await fontGet(new Request("http://x"), params({ id: font.id }))).status).toBe(200);
    as(B);
    expect((await fontGet(new Request("http://x"), params({ id: font.id }))).status).toBe(404);
    as(null);
    expect((await fontGet(new Request("http://x"), params({ id: font.id }))).status).toBe(401);
  });
});

describe("templates are per person", () => {
  it("someone else's template is neither listed nor deletable", async () => {
    as(null);
    expect((await templatesGet()).status).toBe(401);
    as(A);
    const made = await templatesPost(json("POST", { name: "Mine", baseId: null, videoId: mineA }));
    expect(made.status).toBe(201);
    const { template } = await made.json();
    as(B);
    expect((await (await templatesGet()).json()).templates.map((t: { id: string }) => t.id)).not.toContain(template.id);
    expect((await templateDelete(new Request("http://x", { method: "DELETE" }), params({ id: template.id }))).status).toBe(404);
    // and B can't make a template of A's video
    expect((await templatesPost(json("POST", { name: "Theirs", baseId: null, videoId: mineA }))).status).toBe(404);
    as(A);
    expect((await (await templatesGet()).json()).templates.map((t: { id: string }) => t.id)).toContain(template.id);
  });
});

describe("server-only tools are not for strangers", () => {
  it("the music folder: super admins only", async () => {
    as(null);
    expect([401, 403]).toContain((await libraryFolder(json("POST", { folder: "/etc" }))).status);
    as(ADMIN);
    expect((await libraryFolder(json("POST", { folder: "/etc" }))).status).toBe(403);
  });

  it("the server's Documents folder: off unless it's a local install", async () => {
    as(A);
    delete process.env.VDO_LOCAL_MODE;
    expect((await deviceFolder(json("POST", { fileName: "x.json", content: "{}" }))).status).toBe(404);
  });

  it("stock photo import: signed in, and only from the libraries' picture hosts (no fetching other addresses)", async () => {
    as(null);
    expect((await stockPhoto(json("POST", { url: "https://images.unsplash.com/photo-1" }))).status).toBe(401);
    as(A);
    for (const url of ["http://127.0.0.1:3000/api/health", "http://169.254.169.254/latest/meta-data", "https://example.com/a.jpg", "file:///etc/passwd", "https://images.unsplash.com.evil.test/x.jpg"])
      expect((await stockPhoto(json("POST", { url }))).status).toBe(400);
  });
});

describe("exports and versions are their owner's", () => {
  it("a job id of someone else's export: 404; signed out: 401", async () => {
    // (a finished job on disk, owned by A)
    const id = randomUUID();
    mkdirSync(storagePath("jobs", id), { recursive: true });
    writeFileSync(storagePath("jobs", id, "job.json"), JSON.stringify({ id, videoId: "", createdAt: Date.now(), updatedAt: Date.now(), state: "done", spec: { version: 1, ops: [], output: {} }, steps: [], files: [], output: { width: 2, height: 2, fps: 1, hasAudio: false }, error: null, errorDetail: null, userId: A.id }));
    as(null);
    expect((await jobGet(new Request("http://x"), params({ id }))).status).toBe(401);
    as(B);
    expect((await jobGet(new Request("http://x"), params({ id }))).status).toBe(404);
    expect((await jobDelete(new Request("http://x?purge=1", { method: "DELETE" }), params({ id }))).status).toBe(404);
  });

  it("someone else's project versions: 404; signed out: 401", async () => {
    as(null);
    expect((await versionsGet(new Request("http://x"), params({ id: randomUUID() }))).status).toBe(401);
    as(B);
    expect((await versionsGet(new Request("http://x"), params({ id: randomUUID() }))).status).toBe(404);
  });
});
